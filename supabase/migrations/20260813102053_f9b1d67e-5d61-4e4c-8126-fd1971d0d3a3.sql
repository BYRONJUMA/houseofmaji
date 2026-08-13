UPDATE public.leads SET stage = CASE
  WHEN stage IN ('new') THEN 'new'
  WHEN stage IN ('contacted','not_responding') THEN 'warm'
  WHEN stage IN ('qualified','showroom_demo','quote_sent','negotiation') THEN 'hot'
  WHEN stage = 'won' THEN 'won'
  ELSE 'not_won'
END;

ALTER TABLE public.leads DROP COLUMN IF EXISTS temp;
ALTER TABLE public.leads ALTER COLUMN stage SET DEFAULT 'new';
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_stage_check CHECK (stage IN ('new','warm','hot','won','not_won'));