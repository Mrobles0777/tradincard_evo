-- ================================================================
-- SECURITY HARDENING: Evaluations Row Level Security (RLS)
-- Created: 2026-03-14
-- Goal: Restrict data access to owners and prevent mass deletion.
-- ================================================================

-- 1. Cleanup: Remove existing Permissive/Insecure policies
DROP POLICY IF EXISTS "evaluations_all_insert" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_select" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_update" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_all_delete" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_owner" ON public.evaluations;

-- 2. Ensure RLS is enabled
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- 3. Policy: SELECT
-- Users see their own evaluations OR anonymous/demo evaluations where user_id is null.
CREATE POLICY "evaluations_secure_select" ON public.evaluations
  FOR SELECT USING (
    (auth.uid() = user_id) OR (user_id IS NULL)
  );

-- 4. Policy: INSERT
-- Users can insert their own evaluations. 
-- OR Anonymous users can insert if they leave user_id as NULL (Demo Mode).
CREATE POLICY "evaluations_secure_insert" ON public.evaluations
  FOR INSERT WITH CHECK (
    (auth.uid() = user_id) OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- 5. Policy: UPDATE
-- Owners can update their evaluations.
-- Anonymous can update demo evaluations (where user_id is null) for the AI analysis process.
CREATE POLICY "evaluations_secure_update" ON public.evaluations
  FOR UPDATE USING (
    (auth.uid() = user_id) OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- 6. Policy: DELETE
-- ONLY authenticated owners can delete their records. 
-- No anonymous deletions allowed (Prevents mass cleanup attacks).
CREATE POLICY "evaluations_secure_delete" ON public.evaluations
  FOR DELETE USING (
    (auth.uid() = user_id)
  );
