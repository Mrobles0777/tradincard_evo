ALTER TABLE public.evaluations 
ADD COLUMN estimated_value NUMERIC(12,2) DEFAULT NULL;

COMMENT ON COLUMN public.evaluations.estimated_value IS 'Valor estimado de la carta en USD basado en su nota PSA';
