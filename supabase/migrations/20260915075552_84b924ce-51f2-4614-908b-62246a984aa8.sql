DELETE FROM public.sale_items
 WHERE product_id IN (SELECT id FROM public.store_products WHERE name = 'POS Test Widget');
DELETE FROM public.sales
 WHERE id NOT IN (SELECT sale_id FROM public.sale_items);
DELETE FROM public.store_stock_entries
 WHERE product_id IN (SELECT id FROM public.store_products WHERE name = 'POS Test Widget');
DELETE FROM public.store_products WHERE name = 'POS Test Widget';