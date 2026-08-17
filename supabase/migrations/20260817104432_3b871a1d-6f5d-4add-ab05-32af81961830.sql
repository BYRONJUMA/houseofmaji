ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

DROP POLICY IF EXISTS "services update" ON public.services;
CREATE POLICY "services update" ON public.services
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'sales_head')
    OR recorded_by = auth.uid()
    OR assigned_engineer_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'sales_head')
    OR recorded_by = auth.uid()
    OR assigned_engineer_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.service_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_engineer_id IS NOT NULL
     AND NEW.assigned_engineer_id IS DISTINCT FROM OLD.assigned_engineer_id THEN
    INSERT INTO public.notifications (user_id, message, fulfillment_id)
    VALUES (NEW.assigned_engineer_id,
      'You''ve been assigned a service visit — ' || NEW.client_name || ', ' ||
      COALESCE(NEW.machine_type, 'machine') || ', due ' ||
      COALESCE(NEW.next_due_date::text, 'not scheduled') || '.',
      NEW.fulfillment_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS services_assigned ON public.services;
CREATE TRIGGER services_assigned
AFTER UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.service_assigned();