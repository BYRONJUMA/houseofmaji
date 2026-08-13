-- 1. Machine capacity on the order
ALTER TABLE public.fulfillments ADD COLUMN IF NOT EXISTS capacity_lph numeric;

-- 2. Back to exactly one checklist per fulfillment
DELETE FROM public.delivery_checklists d
WHERE d.id NOT IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY fulfillment_id ORDER BY started_at, id) AS rn
    FROM public.delivery_checklists
  ) t WHERE t.rn = 1
);

ALTER TABLE public.delivery_checklists
  DROP CONSTRAINT IF EXISTS delivery_checklists_fulfillment_unique;
ALTER TABLE public.delivery_checklists
  ADD CONSTRAINT delivery_checklists_fulfillment_unique UNIQUE (fulfillment_id);

-- 3. Auto-create the checklist as soon as an order is created
CREATE OR REPLACE FUNCTION public.create_fulfillment_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.delivery_checklists (fulfillment_id, capacity_lph, started_by)
  VALUES (NEW.id, NEW.capacity_lph, NEW.sales_rep_id)
  ON CONFLICT (fulfillment_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fulfillments_create_checklist ON public.fulfillments;
CREATE TRIGGER fulfillments_create_checklist
AFTER INSERT ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.create_fulfillment_checklist();

-- 4. Backfill checklists for existing orders
INSERT INTO public.delivery_checklists (fulfillment_id, capacity_lph, started_by)
SELECT f.id, f.capacity_lph, f.sales_rep_id
FROM public.fulfillments f
LEFT JOIN public.delivery_checklists d ON d.fulfillment_id = f.id
WHERE d.id IS NULL;

-- 5. Keep capacity + delivery date on the checklist derived from the order
CREATE OR REPLACE FUNCTION public.sync_checklist_from_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.sync_checklist', '1', true);

  IF NEW.capacity_lph IS DISTINCT FROM OLD.capacity_lph THEN
    UPDATE public.delivery_checklists
      SET capacity_lph = NEW.capacity_lph
      WHERE fulfillment_id = NEW.id;
  END IF;

  IF NEW.current_stage = 'delivery' AND OLD.current_stage <> 'delivery' THEN
    UPDATE public.delivery_checklists
      SET date_delivered = CURRENT_DATE
      WHERE fulfillment_id = NEW.id AND date_delivered IS NULL;
  END IF;

  PERFORM set_config('app.sync_checklist', '', true);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fulfillments_sync_checklist ON public.fulfillments;
CREATE TRIGGER fulfillments_sync_checklist
AFTER UPDATE ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.sync_checklist_from_fulfillment();

-- 6. Delivery date + capacity are read-only on the checklist form
CREATE OR REPLACE FUNCTION public.lock_checklist_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.delivery_no := OLD.delivery_no;
  NEW.machine_serial_no := OLD.machine_serial_no;
  IF COALESCE(current_setting('app.sync_checklist', true), '') <> '1' THEN
    NEW.date_delivered := OLD.date_delivered;
    NEW.capacity_lph := OLD.capacity_lph;
  END IF;
  RETURN NEW;
END; $$;

-- 7. Backfill delivery dates for orders already at/after delivery
UPDATE public.delivery_checklists d
SET date_delivered = COALESCE(d.date_delivered, (
  SELECT se.entered_at::date FROM public.stage_events se
  WHERE se.fulfillment_id = d.fulfillment_id AND se.stage = 'delivery'
  ORDER BY se.entered_at LIMIT 1
))
WHERE d.date_delivered IS NULL;