CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _requested public.app_role;
  _role public.app_role;
  _key text;
BEGIN
  _requested := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'sales_rep')::public.app_role;
  _key := COALESCE(NEW.raw_user_meta_data->>'admin_key','');
  _role := _requested;
  IF _requested = 'admin' AND _key <> 'HOM123' THEN
    _role := 'sales_rep';
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), _role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;