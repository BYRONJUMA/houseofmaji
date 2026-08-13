REVOKE EXECUTE ON FUNCTION public.is_crm_manager(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;