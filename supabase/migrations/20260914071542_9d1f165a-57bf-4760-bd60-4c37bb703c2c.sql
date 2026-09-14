CREATE TABLE public.service_visit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES public.profiles(id),
  next_due_date_set_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.service_visit_log TO authenticated;
GRANT ALL ON public.service_visit_log TO service_role;

ALTER TABLE public.service_visit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role holders can view service visit log"
ON public.service_visit_log FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

CREATE POLICY "Role holders can log service visits"
ON public.service_visit_log FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid()));

CREATE INDEX service_visit_log_service_idx ON public.service_visit_log(service_id, completed_at DESC);