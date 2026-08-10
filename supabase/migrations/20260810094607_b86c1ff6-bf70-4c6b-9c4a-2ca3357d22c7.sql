-- FK relaxations so a user can be deleted without breaking history
ALTER TABLE public.fulfillments ALTER COLUMN sales_rep_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN recorded_by DROP NOT NULL;

ALTER TABLE public.stage_events DROP CONSTRAINT stage_events_actor_id_fkey,
  ADD CONSTRAINT stage_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_checklists DROP CONSTRAINT delivery_checklists_started_by_fkey,
  ADD CONSTRAINT delivery_checklists_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payments DROP CONSTRAINT payments_recorded_by_fkey,
  ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.commissions DROP CONSTRAINT commissions_user_id_fkey,
  ADD CONSTRAINT commissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.fulfillments DROP CONSTRAINT fulfillments_sales_rep_id_fkey,
  ADD CONSTRAINT fulfillments_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fulfillments DROP CONSTRAINT fulfillments_assembly_engineer_id_fkey,
  ADD CONSTRAINT fulfillments_assembly_engineer_id_fkey FOREIGN KEY (assembly_engineer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fulfillments DROP CONSTRAINT fulfillments_installation_engineer_id_fkey,
  ADD CONSTRAINT fulfillments_installation_engineer_id_fkey FOREIGN KEY (installation_engineer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fulfillments DROP CONSTRAINT fulfillments_chief_engineer_id_fkey,
  ADD CONSTRAINT fulfillments_chief_engineer_id_fkey FOREIGN KEY (chief_engineer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 1. Auto-transition to installed on engineer checklist sign-off
CREATE OR REPLACE FUNCTION public.checklist_signoff_installed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _stage text;
BEGIN
  IF NEW.engineer_signoff_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.engineer_signoff_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT current_stage INTO _stage FROM public.fulfillments WHERE id = NEW.fulfillment_id;
  IF _stage <> 'delivery' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.delivery_checklists
    WHERE fulfillment_id = NEW.fulfillment_id AND engineer_signoff_at IS NULL
  ) THEN RETURN NEW; END IF;

  PERFORM set_config('app.auto_installed', '1', true);
  PERFORM set_config('app.signoff_actor', COALESCE(auth.uid()::text, ''), true);
  UPDATE public.fulfillments SET current_stage = 'installed' WHERE id = NEW.fulfillment_id;
  PERFORM set_config('app.auto_installed', '', true);
  PERFORM set_config('app.signoff_actor', '', true);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS delivery_checklists_signoff_installed ON public.delivery_checklists;
CREATE TRIGGER delivery_checklists_signoff_installed
AFTER INSERT OR UPDATE ON public.delivery_checklists
FOR EACH ROW EXECUTE FUNCTION public.checklist_signoff_installed();

-- 2. Transition rules: admins may override; installed only via checklist sign-off
CREATE OR REPLACE FUNCTION public.enforce_transition_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF public.has_role(_uid, 'admin') THEN RETURN NEW; END IF;

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
    IF COALESCE(current_setting('app.auto_installed', true), '') <> '1' THEN
      RAISE EXCEPTION 'Installed is set automatically once every machine has the engineer delivery sign-off';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 3. Stage-change bookkeeping: sign-off actor + admin override note
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
  _auto boolean := COALESCE(current_setting('app.auto_installed', true), '') = '1';
  _notes text := NULL;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;
  _installer := COALESCE(NEW.installation_engineer_id, NEW.assembly_engineer_id);
  _actor := CASE NEW.current_stage
    WHEN 'waiting_for_frame' THEN NEW.chief_engineer_id
    WHEN 'material_procurement' THEN NEW.chief_engineer_id
    WHEN 'assigned' THEN NEW.assembly_engineer_id
    WHEN 'assembling' THEN NEW.assembly_engineer_id
    WHEN 'delivery' THEN NEW.sales_rep_id
    WHEN 'installed' THEN COALESCE(NULLIF(current_setting('app.signoff_actor', true), '')::uuid, _installer)
    ELSE auth.uid() END;

  IF NOT _auto AND public.has_role(auth.uid(), 'admin') THEN
    _actor := auth.uid();
    _notes := 'Stage changed manually by admin (override)';
  END IF;

  UPDATE public.stage_events SET exited_at = now()
  WHERE fulfillment_id = NEW.id AND exited_at IS NULL;

  INSERT INTO public.stage_events (fulfillment_id, stage, actor_id, notes)
  VALUES (NEW.id, NEW.current_stage, _actor, _notes);

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

  IF NEW.current_stage = 'installed' THEN
    IF NEW.sales_rep_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, message, fulfillment_id)
      VALUES (NEW.sales_rep_id,
              'All machines for ' || NEW.client_name || ' are signed off — order is installed.', NEW.id);
    END IF;
    IF _installer IS NOT NULL THEN
      INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
      VALUES (NEW.id, _installer, 'installation', 1000)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- 4. Admin management policies
DROP POLICY IF EXISTS "admins update any fulfillment" ON public.fulfillments;
CREATE POLICY "admins update any fulfillment" ON public.fulfillments
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete fulfillments" ON public.fulfillments;
CREATE POLICY "admins delete fulfillments" ON public.fulfillments
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete profiles" ON public.profiles;
CREATE POLICY "admins delete profiles" ON public.profiles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Guard: block deleting a user still on an active order
CREATE OR REPLACE FUNCTION public.guard_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.fulfillments
  WHERE current_stage <> 'installed'
    AND (sales_rep_id = OLD.id OR assembly_engineer_id = OLD.id OR installation_engineer_id = OLD.id);
  IF _n > 0 THEN
    RAISE EXCEPTION 'This user is assigned to % active order(s) — reassign or complete those first', _n;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS profiles_guard_delete ON public.profiles;
CREATE TRIGGER profiles_guard_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_delete();

REVOKE ALL ON FUNCTION public.checklist_signoff_installed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_delete() FROM PUBLIC, anon, authenticated;