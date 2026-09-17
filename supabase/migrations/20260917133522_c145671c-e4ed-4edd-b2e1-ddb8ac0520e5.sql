-- Products: scope reads and writes to the product's branch
DROP POLICY IF EXISTS "store products readable by signed in" ON public.store_products;
DROP POLICY IF EXISTS "store products insert with store access" ON public.store_products;
DROP POLICY IF EXISTS "store products update with store access" ON public.store_products;
DROP POLICY IF EXISTS "store products delete with store access" ON public.store_products;

CREATE POLICY "Branch users can view products" ON public.store_products
FOR SELECT TO authenticated USING (public.can_use_branch(auth.uid(), branch_id));
CREATE POLICY "Branch writers can add products" ON public.store_products
FOR INSERT TO authenticated WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));
CREATE POLICY "Branch writers can edit products" ON public.store_products
FOR UPDATE TO authenticated USING (public.can_write_branch_pos(auth.uid(), branch_id))
WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));
CREATE POLICY "Branch writers can delete products" ON public.store_products
FOR DELETE TO authenticated USING (public.can_write_branch_pos(auth.uid(), branch_id));

-- Stock entries: follow the product's branch
DROP POLICY IF EXISTS "store entries readable by signed in" ON public.store_stock_entries;
DROP POLICY IF EXISTS "store entries insert with store access" ON public.store_stock_entries;

CREATE POLICY "Branch users can view stock entries" ON public.store_stock_entries
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.store_products p
  WHERE p.id = store_stock_entries.product_id
    AND public.can_use_branch(auth.uid(), p.branch_id)));
CREATE POLICY "Branch writers can add stock entries" ON public.store_stock_entries
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.store_products p
  WHERE p.id = store_stock_entries.product_id
    AND public.can_write_branch_pos(auth.uid(), p.branch_id)));

-- Stock take variances: follow the product's branch
DROP POLICY IF EXISTS "variances readable by signed in" ON public.stock_take_variances;
DROP POLICY IF EXISTS "variances insert with store access" ON public.stock_take_variances;

CREATE POLICY "Branch users can view variances" ON public.stock_take_variances
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.store_products p
  WHERE p.id = stock_take_variances.product_id
    AND public.can_use_branch(auth.uid(), p.branch_id)));
CREATE POLICY "Branch writers can add variances" ON public.stock_take_variances
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.store_products p
  WHERE p.id = stock_take_variances.product_id
    AND public.can_write_branch_pos(auth.uid(), p.branch_id)));

-- Customers cannot be reassigned to another branch
DROP POLICY IF EXISTS "Branch writers can edit customers" ON public.pos_customers;
CREATE POLICY "Branch writers can edit customers" ON public.pos_customers
FOR UPDATE TO authenticated USING (public.can_write_branch_pos(auth.uid(), branch_id))
WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));

-- Stock RPCs check the product's branch, not just global store access
CREATE OR REPLACE FUNCTION public.store_set_quantity(_product_id uuid, _location store_location, _new_qty numeric, _notes text DEFAULT 'Manual stock update'::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _current numeric; _branch uuid;
BEGIN
  SELECT CASE WHEN _location = 'in_house' THEN in_house_qty ELSE warehouse_qty END, branch_id
    INTO _current, _branch FROM public.store_products WHERE id = _product_id;
  IF _current IS NULL THEN RAISE EXCEPTION 'Product not found.'; END IF;
  IF NOT public.can_write_branch_pos(auth.uid(), _branch) THEN
    RAISE EXCEPTION 'You do not have permission to change stock for this branch.';
  END IF;
  IF _new_qty = _current THEN RETURN; END IF;
  INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES (_product_id, _location, _new_qty - _current, _notes, auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_stock_take_submit(_location store_location, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; _pid uuid; _counted numeric; _system numeric; _branch uuid; _n integer := 0;
BEGIN
  FOR r IN SELECT jsonb_array_elements(_rows) LOOP
    _pid := (r->>'product_id')::uuid;
    _counted := (r->>'counted_quantity')::numeric;
    SELECT CASE WHEN _location = 'in_house' THEN in_house_qty ELSE warehouse_qty END, branch_id
      INTO _system, _branch FROM public.store_products WHERE id = _pid;
    CONTINUE WHEN _system IS NULL OR _counted IS NULL OR _counted = _system;
    IF NOT public.can_write_branch_pos(auth.uid(), _branch) THEN
      RAISE EXCEPTION 'You do not have permission to submit a stock take for this branch.';
    END IF;
    INSERT INTO public.stock_take_variances
      (product_id, location, system_quantity, counted_quantity, variance, counted_by)
      VALUES (_pid, _location, _system, _counted, _counted - _system, auth.uid());
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
      VALUES (_pid, _location, _counted - _system, 'Stock take adjustment', auth.uid());
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$function$;