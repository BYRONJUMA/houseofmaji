CREATE OR REPLACE FUNCTION public.store_requisition_delete(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.store_requisitions;
  it record;
  short text[] := '{}';
  avail numeric;
  pname text;
  reversed boolean := false;
BEGIN
  IF NOT (public.has_role(auth.uid(),'chief_engineer') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only a chief engineer or admin can delete a requisition.';
  END IF;

  SELECT * INTO r FROM public.store_requisitions WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Requisition not found.'; END IF;

  IF r.status = 'completed' THEN
    FOR it IN SELECT * FROM public.store_requisition_items WHERE requisition_id = _id LOOP
      SELECT name,
             CASE WHEN r.destination_location = 'in_house' THEN in_house_qty ELSE warehouse_qty END
        INTO pname, avail
        FROM public.store_products WHERE id = it.product_id FOR UPDATE;
      IF avail IS NULL THEN CONTINUE; END IF;
      IF avail < it.quantity THEN
        short := short || (coalesce(pname,'Unknown product') || ' (needs ' || it.quantity || ', has ' || avail || ')');
      END IF;
    END LOOP;

    IF array_length(short, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot reverse this transfer — not enough remaining stock: %', array_to_string(short, '; ');
    END IF;

    FOR it IN SELECT * FROM public.store_requisition_items WHERE requisition_id = _id LOOP
      INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
        VALUES (it.product_id, r.destination_location, -it.quantity,
                'Reversed — Requisition ' || r.requisition_no || ' deleted', auth.uid());
      INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
        VALUES (it.product_id, r.source_location, it.quantity,
                'Reversed — Requisition ' || r.requisition_no || ' deleted', auth.uid());
    END LOOP;
    reversed := true;
  END IF;

  DELETE FROM public.store_requisition_items WHERE requisition_id = _id;
  DELETE FROM public.store_requisitions WHERE id = _id;

  RETURN jsonb_build_object('reversed', reversed, 'requisition_no', r.requisition_no);
END;
$function$;

REVOKE ALL ON FUNCTION public.store_requisition_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_requisition_delete(uuid) TO authenticated;

DROP POLICY IF EXISTS "Chief engineers and admins delete requisitions" ON public.store_requisitions;
CREATE POLICY "Chief engineers and admins delete requisitions"
ON public.store_requisitions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'chief_engineer') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Chief engineers and admins delete requisition items" ON public.store_requisition_items;
CREATE POLICY "Chief engineers and admins delete requisition items"
ON public.store_requisition_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'chief_engineer') OR public.has_role(auth.uid(),'admin'));