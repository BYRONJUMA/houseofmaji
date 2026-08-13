-- ============ machine taxonomy ============
CREATE TABLE public.machine_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_categories TO authenticated;
GRANT ALL ON public.machine_categories TO service_role;
ALTER TABLE public.machine_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy cat read" ON public.machine_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxonomy cat manage" ON public.machine_categories FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER machine_categories_touch BEFORE UPDATE ON public.machine_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.machine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.machine_categories(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_types TO authenticated;
GRANT ALL ON public.machine_types TO service_role;
ALTER TABLE public.machine_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy type read" ON public.machine_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxonomy type manage" ON public.machine_types FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER machine_types_touch BEFORE UPDATE ON public.machine_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.machine_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_capacities TO authenticated;
GRANT ALL ON public.machine_capacities TO service_role;
ALTER TABLE public.machine_capacities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy cap read" ON public.machine_capacities FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxonomy cap manage" ON public.machine_capacities FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER machine_capacities_touch BEFORE UPDATE ON public.machine_capacities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.machine_categories (name) VALUES
  ('Reverse Osmosis'), ('Ultrafiltration'), ('Softener'), ('Accessories');

INSERT INTO public.machine_types (name, category_id) VALUES
  ('RO 250LPH', (SELECT id FROM public.machine_categories WHERE name = 'Reverse Osmosis')),
  ('RO 500LPH', (SELECT id FROM public.machine_categories WHERE name = 'Reverse Osmosis')),
  ('RO 1000LPH', (SELECT id FROM public.machine_categories WHERE name = 'Reverse Osmosis')),
  ('UF', (SELECT id FROM public.machine_categories WHERE name = 'Ultrafiltration')),
  ('Softener', (SELECT id FROM public.machine_categories WHERE name = 'Softener'));

INSERT INTO public.machine_capacities (label) VALUES
  ('250 LPH'), ('500 LPH'), ('1000 LPH'), ('2000 LPH'), ('5000 LPH');

-- ============ settings ============
CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings manage" ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.settings (key, value) VALUES
  ('default_service_interval_months', '6'),
  ('low_stock_threshold', '50'),
  ('company_name', 'House of Maji'),
  ('company_logo_url', '');

-- ============ site visits ============
CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  location text,
  visit_type text NOT NULL DEFAULT 'installation'
    CHECK (visit_type IN ('installation','maintenance','repair','inspection')),
  engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visits TO authenticated;
GRANT ALL ON public.site_visits TO service_role;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits read own or manager" ON public.site_visits FOR SELECT TO authenticated
  USING (public.is_crm_manager(auth.uid()) OR engineer_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "visits insert" ON public.site_visits FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_manager(auth.uid()) OR created_by = auth.uid() OR engineer_id = auth.uid());
CREATE POLICY "visits update own or manager" ON public.site_visits FOR UPDATE TO authenticated
  USING (public.is_crm_manager(auth.uid()) OR engineer_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (public.is_crm_manager(auth.uid()) OR engineer_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "visits delete manager" ON public.site_visits FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));
CREATE TRIGGER site_visits_touch BEFORE UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.seed_site_visit_checklist()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.visit_type = 'installation' AND (NEW.checklist IS NULL OR jsonb_array_length(NEW.checklist) = 0) THEN
    NEW.checklist := '[
      {"item_key":"unpacked_inspected","label":"Machine unpacked and inspected for transit damage","checked":false,"notes":null},
      {"item_key":"positioned_level","label":"Positioned and levelled correctly","checked":false,"notes":null},
      {"item_key":"inlet_connected","label":"Inlet water connection fitted and leak-free","checked":false,"notes":null},
      {"item_key":"drain_connected","label":"Drain / waste line connected","checked":false,"notes":null},
      {"item_key":"power_on","label":"Power connected and machine powers on","checked":false,"notes":null},
      {"item_key":"system_flushed","label":"System flushed and initial run completed","checked":false,"notes":null},
      {"item_key":"output_tested","label":"Output water tested (TDS / quality checked)","checked":false,"notes":null},
      {"item_key":"no_leaks","label":"No leaks after a 10-minute run","checked":false,"notes":null},
      {"item_key":"customer_operation","label":"Customer trained on operation","checked":false,"notes":null}
    ]'::jsonb;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER site_visits_seed_checklist BEFORE INSERT ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.seed_site_visit_checklist();

CREATE TABLE public.site_visit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL REFERENCES public.site_visits(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_photos TO authenticated;
GRANT ALL ON public.site_visit_photos TO service_role;
ALTER TABLE public.site_visit_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit photos read" ON public.site_visit_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_visits v WHERE v.id = site_visit_id
    AND (public.is_crm_manager(auth.uid()) OR v.engineer_id = auth.uid() OR v.created_by = auth.uid())));
CREATE POLICY "visit photos insert" ON public.site_visit_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.site_visits v WHERE v.id = site_visit_id
    AND (public.is_crm_manager(auth.uid()) OR v.engineer_id = auth.uid() OR v.created_by = auth.uid())));
CREATE POLICY "visit photos delete" ON public.site_visit_photos FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()) OR uploaded_by = auth.uid());

-- ============ call reviews ============
CREATE TABLE public.recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings TO authenticated;
GRANT ALL ON public.recordings TO service_role;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recordings read" ON public.recordings FOR SELECT TO authenticated
  USING (public.is_crm_manager(auth.uid()) OR uploaded_by = auth.uid());
CREATE POLICY "recordings insert own" ON public.recordings FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "recordings delete" ON public.recordings FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()) OR uploaded_by = auth.uid());

CREATE TABLE public.transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  transcript_text text,
  score numeric,
  coaching_notes text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transcripts read" ON public.transcripts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = recording_id
    AND (public.is_crm_manager(auth.uid()) OR r.uploaded_by = auth.uid())));
CREATE POLICY "transcripts write" ON public.transcripts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = recording_id
    AND (public.is_crm_manager(auth.uid()) OR r.uploaded_by = auth.uid())));
CREATE POLICY "transcripts update" ON public.transcripts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = recording_id
    AND (public.is_crm_manager(auth.uid()) OR r.uploaded_by = auth.uid())))
  WITH CHECK (true);
CREATE POLICY "transcripts delete" ON public.transcripts FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));

-- ============ whatsapp management data ============
CREATE TABLE public.whatsapp_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  region text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_recipients TO authenticated;
GRANT ALL ON public.whatsapp_recipients TO service_role;
ALTER TABLE public.whatsapp_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa recipients read" ON public.whatsapp_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa recipients manage" ON public.whatsapp_recipients FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER whatsapp_recipients_touch BEFORE UPDATE ON public.whatsapp_recipients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.whatsapp_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_sequences TO authenticated;
GRANT ALL ON public.whatsapp_sequences TO service_role;
ALTER TABLE public.whatsapp_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa seq read" ON public.whatsapp_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa seq manage" ON public.whatsapp_sequences FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER whatsapp_sequences_touch BEFORE UPDATE ON public.whatsapp_sequences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.whatsapp_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.whatsapp_sequences(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  template_text text NOT NULL,
  delay_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_sequence_steps TO authenticated;
GRANT ALL ON public.whatsapp_sequence_steps TO service_role;
ALTER TABLE public.whatsapp_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa step read" ON public.whatsapp_sequence_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa step manage" ON public.whatsapp_sequence_steps FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER whatsapp_sequence_steps_touch BEFORE UPDATE ON public.whatsapp_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ storage object policies ============
CREATE POLICY "visit photos auth read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-visit-photos');
CREATE POLICY "visit photos auth insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-visit-photos');
CREATE POLICY "visit photos auth delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-visit-photos');

CREATE POLICY "call recordings auth read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'call-recordings');
CREATE POLICY "call recordings auth insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'call-recordings');
CREATE POLICY "call recordings auth delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'call-recordings');