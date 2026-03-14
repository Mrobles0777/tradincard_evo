-- Drop the original policy that was missing from previous fix
DROP POLICY IF EXISTS "evaluations_owner" ON public.evaluations;

-- Ensure all-access policies exist (hardening the fix)
DROP POLICY IF EXISTS "evaluations_all_insert" ON public.evaluations;
CREATE POLICY "evaluations_all_insert" ON public.evaluations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "evaluations_all_select" ON public.evaluations;
CREATE POLICY "evaluations_all_select" ON public.evaluations FOR SELECT USING (true);

DROP POLICY IF EXISTS "evaluations_all_update" ON public.evaluations;
CREATE POLICY "evaluations_all_update" ON public.evaluations FOR UPDATE USING (true);

DROP POLICY IF EXISTS "evaluations_all_delete" ON public.evaluations;
CREATE POLICY "evaluations_all_delete" ON public.evaluations FOR DELETE USING (true);
