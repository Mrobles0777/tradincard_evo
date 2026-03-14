-- ==========================================
-- FIX: Allow all evaluation inserts & selects
-- This prevents RLS errors when users test the app 
-- without being logged in (demo mode)
-- ==========================================

DROP POLICY IF EXISTS "evaluations_owner_insert" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_owner_select" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_owner_update" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_owner_delete" ON public.evaluations;

CREATE POLICY "evaluations_all_insert" ON public.evaluations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "evaluations_all_select" ON public.evaluations
  FOR SELECT USING (true);

CREATE POLICY "evaluations_all_update" ON public.evaluations
  FOR UPDATE USING (true);

CREATE POLICY "evaluations_all_delete" ON public.evaluations
  FOR DELETE USING (true);
