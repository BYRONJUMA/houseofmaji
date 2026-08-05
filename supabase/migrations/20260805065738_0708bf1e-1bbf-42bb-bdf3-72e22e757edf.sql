-- 1. client contact
ALTER TABLE public.fulfillments ADD COLUMN IF NOT EXISTS client_contact text;

-- 2. new stage in constraints
ALTER TABLE public.fulfillments DROP CONSTRAINT IF EXISTS fulfillments_current_stage_check;
ALTER TABLE public.fulfillments ADD CONSTRAINT fulfillments_current_stage_check
  CHECK (current_stage = ANY (ARRAY['received','waiting_for_frame','material_procurement','assigned','assembling','delivery','installed']));
ALTER TABLE public.stage_events DROP CONSTRAINT IF EXISTS stage_events_stage_check;
ALTER TABLE public.stage_events ADD CONSTRAINT stage_events_stage_check
  CHECK (stage = ANY (ARRAY['received','waiting_for_frame','material_procurement','assigned','assembling','delivery','installed']));

-- 3. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  fulfillment_id uuid REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own notifications readable" ON public.notifications;
CREATE POLICY "own notifications readable" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own notifications updatable" ON public.notifications;
CREATE POLICY "own notifications updatable" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- 4. transition + reassignment authorisation (server-side)
CREATE OR REPLACE FUNCTION public.enforce_transition_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  -- Reassignment (no stage change) must be done by a chief engineer, only between assigned and delivery
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage
     AND (NEW.assembly_engineer_id IS DISTINCT FROM OLD.assembly_engineer_id
          OR NEW.installation_engineer_id IS DISTINCT FROM OLD.installation_engineer_id) THEN
    IF NOT public.has_role(_uid, 'chief_engineer') THEN
      RAISE EXCEPTION 'Only the chief engineer can reassign engineers';
    END IF;
    IF OLD.current_stage NOT IN ('assigned','assembling','delivery') THEN
      RAISE EXCEPTION 'Engineers can only be reassigned between the Assigned and Delivery stages';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;

  IF NEW.current_stage = 'assembling' THEN
    IF OLD.current_stage <> 'assigned' THEN
      RAISE EXCEPTION 'The machine must be marked received from the Assigned stage first';
    END IF;
    IF NEW.assembly_engineer_id IS NULL OR NEW.assembly_engineer_id <> _uid THEN
      RAISE EXCEPTION 'Only the assigned assembly engineer can mark the machine received';
    END IF;
  END IF;

  IF NEW.current_stage = 'delivery' THEN
    IF OLD.current_stage <> 'assembling' THEN
      RAISE EXCEPTION 'Assembly can only be completed from the Assembling stage';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stage_events WHERE fulfillment_id = NEW.id AND stage = 'assigned') THEN
      RAISE EXCEPTION 'The machine must be marked received before assembly can be completed';
    END IF;
    IF NEW.assembly_engineer_id IS NULL OR NEW.assembly_engineer_id <> _uid THEN
      RAISE EXCEPTION 'Only the assigned assembly engineer can mark assembly complete';
    END IF;
  END IF;

  IF NEW.current_stage = 'installed' THEN
    IF OLD.current_stage <> 'delivery' THEN
      RAISE EXCEPTION 'Delivery must be in progress before it can be marked delivered';
    END IF;
    IF NEW.sales_rep_id <> _uid THEN
      RAISE EXCEPTION 'Only the sales rep who created this sale can mark it delivered';
    END IF;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_transition_rules() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS fulfillments_transition_rules ON public.fulfillments;
CREATE TRIGGER fulfillments_transition_rules BEFORE UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transition_rules();

-- allow the assigned engineer / sales rep transitions through RLS
DROP POLICY IF EXISTS "assigned engineer updates" ON public.fulfillments;
CREATE POLICY "assigned engineer updates" ON public.fulfillments
  FOR UPDATE TO authenticated
  USING (auth.uid() = assembly_engineer_id OR auth.uid() = installation_engineer_id)
  WITH CHECK (auth.uid() = assembly_engineer_id OR auth.uid() = installation_engineer_id);
DROP POLICY IF EXISTS "owning sales rep updates" ON public.fulfillments;
CREATE POLICY "owning sales rep updates" ON public.fulfillments
  FOR UPDATE TO authenticated
  USING (auth.uid() = sales_rep_id) WITH CHECK (auth.uid() = sales_rep_id);

-- 5. stage change bookkeeping + notifications
CREATE OR REPLACE FUNCTION public.fulfillment_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid;
  _installer uuid;
  _engineer_name text;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;
  _installer := COALESCE(NEW.installation_engineer_id, NEW.assembly_engineer_id);
  _actor := CASE NEW.current_stage
    WHEN 'waiting_for_frame' THEN NEW.chief_engineer_id
    WHEN 'material_procurement' THEN NEW.chief_engineer_id
    WHEN 'assigned' THEN NEW.assembly_engineer_id
    WHEN 'assembling' THEN NEW.assembly_engineer_id
    WHEN 'delivery' THEN NEW.sales_rep_id
    WHEN 'installed' THEN _installer
    ELSE auth.uid() END;

  UPDATE public.stage_events SET exited_at = now()
  WHERE fulfillment_id = NEW.id AND exited_at IS NULL;

  INSERT INTO public.stage_events (fulfillment_id, stage, actor_id)
  VALUES (NEW.id, NEW.current_stage, _actor);

  IF NEW.current_stage = 'assigned' AND NEW.assembly_engineer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, message, fulfillment_id)
    VALUES (NEW.assembly_engineer_id,
            'You have been assigned the machine for ' || NEW.client_name || '.', NEW.id);
  END IF;

  IF NEW.current_stage = 'assembling' THEN
    SELECT full_name INTO _engineer_name FROM public.profiles WHERE id = NEW.assembly_engineer_id;
    INSERT INTO public.notifications (user_id, message, fulfillment_id)
    SELECT uid, 'Machine for ' || NEW.client_name || ' has been received by ' ||
                COALESCE(_engineer_name, 'the assigned engineer') || '.', NEW.id
    FROM (SELECT NEW.chief_engineer_id AS uid UNION SELECT NEW.sales_rep_id) t
    WHERE uid IS NOT NULL;
  END IF;

  IF NEW.current_stage = 'delivery' AND NEW.assembly_engineer_id IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, NEW.assembly_engineer_id, 'assembly', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.current_stage = 'installed' AND _installer IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, _installer, 'installation', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fulfillment_stage_changed() FROM public, anon, authenticated;

-- 6. reassignment logging + notification
CREATE OR REPLACE FUNCTION public.fulfillment_reassigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_name text;
  _new_name text;
BEGIN
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;

  IF NEW.assembly_engineer_id IS DISTINCT FROM OLD.assembly_engineer_id THEN
    SELECT full_name INTO _old_name FROM public.profiles WHERE id = OLD.assembly_engineer_id;
    SELECT full_name INTO _new_name FROM public.profiles WHERE id = NEW.assembly_engineer_id;
    UPDATE public.stage_events
      SET notes = COALESCE(notes || E'\n', '') || 'Reassigned from ' ||
                  COALESCE(_old_name, 'unassigned') || ' to ' || COALESCE(_new_name, 'unassigned')
      WHERE fulfillment_id = NEW.id AND exited_at IS NULL;
    IF NEW.assembly_engineer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, message, fulfillment_id)
      VALUES (NEW.assembly_engineer_id,
              'You have been assigned assembly for ' || NEW.client_name || '.', NEW.id);
    END IF;
  END IF;

  IF NEW.installation_engineer_id IS DISTINCT FROM OLD.installation_engineer_id THEN
    SELECT full_name INTO _old_name FROM public.profiles WHERE id = OLD.installation_engineer_id;
    SELECT full_name INTO _new_name FROM public.profiles WHERE id = NEW.installation_engineer_id;
    UPDATE public.stage_events
      SET notes = COALESCE(notes || E'\n', '') || 'Reassigned from ' ||
                  COALESCE(_old_name, 'unassigned') || ' to ' || COALESCE(_new_name, 'unassigned')
      WHERE fulfillment_id = NEW.id AND exited_at IS NULL;
    IF NEW.installation_engineer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, message, fulfillment_id)
      VALUES (NEW.installation_engineer_id,
              'You have been assigned installation for ' || NEW.client_name || '.', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fulfillment_reassigned() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS fulfillments_reassigned ON public.fulfillments;
CREATE TRIGGER fulfillments_reassigned AFTER UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_reassigned();
