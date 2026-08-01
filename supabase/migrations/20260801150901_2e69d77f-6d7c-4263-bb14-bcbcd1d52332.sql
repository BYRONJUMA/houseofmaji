REVOKE EXECUTE ON FUNCTION public.enforce_payment_gates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fulfillment_stage_changed() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fulfillment_created() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;