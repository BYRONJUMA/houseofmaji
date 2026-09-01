REVOKE ALL ON FUNCTION public.apply_lead_scoring() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_manual_lead_stage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_leads() TO authenticated;