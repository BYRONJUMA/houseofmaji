ALTER TABLE public.store_requisitions
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE public.store_requisitions DROP CONSTRAINT IF EXISTS store_requisitions_status_check;

UPDATE public.store_requisitions
   SET status = CASE
     WHEN status = 'approved' AND delivery_status = 'delivered' THEN 'completed'
     WHEN status = 'approved' THEN 'assigned_for_collection'
     ELSE status END;

ALTER TABLE public.store_requisitions
  ADD CONSTRAINT store_requisitions_status_check
  CHECK (status IN ('pending','assigned_for_collection','pending_confirmation','completed','rejected'));

CREATE INDEX IF NOT EXISTS idx_store_requisitions_assigned ON public.store_requisitions(assigned_engineer_id);

-- assign an engineer to physically collect the materials
CREATE OR REPLACE FUNCTION public.store_requisition_assign(_id uuid, _engineer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.store_requisitions; _summary text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'chief_engineer') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only a chief engineer can assign a collection.';
  END IF;
  SELECT * INTO r FROM public.store_requisitions WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Requisition not found.'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This requisition is no longer pending.'; END IF;

  SELECT string_agg(p.name || ' x' || i.quantity::text, ', ')
    INTO _summary
    FROM public.store_requisition_items i
    JOIN public.store_products p ON p.id = i.product_id
   WHERE i.requisition_id = _id;

  UPDATE public.store_requisitions
     SET assigned_engineer_id = _engineer_id,
         assigned_at = now(),
         status = 'assigned_for_collection'
   WHERE id = _id;

  INSERT INTO public.notifications (user_id, message)
  VALUES (_engineer_id,
    'You''ve been assigned to collect materials — Requisition ' || r.requisition_no || ', ' ||
    COALESCE(_summary, 'no items listed') || '.');
END;
$$;

-- assigned engineer marks the materials physically collected
CREATE OR REPLACE FUNCTION public.store_requisition_collected(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.store_requisitions; _who text;
BEGIN
  SELECT * INTO r FROM public.store_requisitions WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Requisition not found.'; END IF;
  IF r.status <> 'assigned_for_collection' THEN
    RAISE EXCEPTION 'This requisition is not awaiting collection.';
  END IF;
  IF NOT (r.assigned_engineer_id = auth.uid() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only the assigned engineer can mark the materials collected.';
  END IF;

  UPDATE public.store_requisitions SET status = 'pending_confirmation' WHERE id = _id;

  SELECT full_name INTO _who FROM public.profiles WHERE id = COALESCE(r.assigned_engineer_id, auth.uid());

  INSERT INTO public.notifications (user_id, message)
  SELECT ur.user_id,
         COALESCE(_who,'An engineer') || ' has collected materials for ' || r.requisition_no ||
         ' — confirm receipt.'
    FROM public.user_roles ur
   WHERE ur.role = 'chief_engineer'
      OR ur.user_id = r.created_by;
END;
$$;

-- chief engineer confirms receipt: this is the only step that moves stock
CREATE OR REPLACE FUNCTION public.store_requisition_confirm(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.store_requisitions; it record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'chief_engineer') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only a chief engineer can confirm receipt.';
  END IF;
  SELECT * INTO r FROM public.store_requisitions WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Requisition not found.'; END IF;
  IF r.status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'The materials must be marked collected before receipt can be confirmed.';
  END IF;

  FOR it IN SELECT * FROM public.store_requisition_items WHERE requisition_id = _id LOOP
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by, requisition_id)
      VALUES (it.product_id, r.source_location, -it.quantity, 'Requisition ' || r.requisition_no || ' out', auth.uid(), r.id);
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by, requisition_id)
      VALUES (it.product_id, r.destination_location, it.quantity, 'Requisition ' || r.requisition_no || ' in', auth.uid(), r.id);
  END LOOP;

  UPDATE public.store_requisitions
     SET status = 'completed', delivery_status = 'delivered'
   WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.store_requisition_assign(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_requisition_collected(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_requisition_confirm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_requisition_assign(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_requisition_collected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_requisition_confirm(uuid) TO authenticated;

-- the assigned engineer must be able to see and act on their requisition
DROP POLICY IF EXISTS "Assigned engineer reads own requisition" ON public.store_requisitions;
CREATE POLICY "Assigned engineer reads own requisition"
  ON public.store_requisitions FOR SELECT TO authenticated
  USING (assigned_engineer_id = auth.uid());

DROP POLICY IF EXISTS "Assigned engineer reads requisition items" ON public.store_requisition_items;
CREATE POLICY "Assigned engineer reads requisition items"
  ON public.store_requisition_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.store_requisitions r
                  WHERE r.id = requisition_id AND r.assigned_engineer_id = auth.uid()));