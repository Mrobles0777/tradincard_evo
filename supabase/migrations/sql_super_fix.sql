-- 1. Crear la columna si no existe (con manejo de error silencioso)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluations' AND column_name='estimated_value') THEN
        ALTER TABLE public.evaluations ADD COLUMN estimated_value NUMERIC(12,2) DEFAULT NULL;
    END IF;
END $$;

-- 2. Limpiar y recrear políticas RLS para asegurar acceso total (modo demo)
DROP POLICY IF EXISTS "evaluations_owner" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_insert" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_select" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_update" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_delete" ON public.evaluations;

CREATE POLICY "evaluations_all_insert" ON public.evaluations FOR INSERT WITH CHECK (true);
CREATE POLICY "evaluations_all_select" ON public.evaluations FOR SELECT USING (true);
CREATE POLICY "evaluations_all_update" ON public.evaluations FOR UPDATE USING (true);
CREATE POLICY "evaluations_all_delete" ON public.evaluations FOR DELETE USING (true);

-- 3. Asegurar que la tabla tiene RLS activo pero con las políticas anteriores permitiendo todo
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
