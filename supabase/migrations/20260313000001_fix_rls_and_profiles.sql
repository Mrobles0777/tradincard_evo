-- ==========================================
-- FIX: Sync auth.users with public.profiles
-- ==========================================

-- Trigger function to create a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || floor(random() * 1000)::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute when a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- FIX: RLS Policies for Evaluations
-- ==========================================

-- Drop old single policy
DROP POLICY IF EXISTS "evaluations_owner" ON public.evaluations;

-- Create more explicit policies
CREATE POLICY "evaluations_owner_select" ON public.evaluations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "evaluations_owner_insert" ON public.evaluations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "evaluations_owner_update" ON public.evaluations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "evaluations_owner_delete" ON public.evaluations
  FOR DELETE USING (auth.uid() = user_id);

-- Allow system to read profiles for internal checks if needed
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (true);

-- Allow users to update their own profiles
DROP POLICY IF EXISTS "profiles_self" ON public.profiles;
CREATE POLICY "profiles_self_all" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- ==========================================
-- EXTRA: Allow Anon Evaluations (Optional)
-- Si el usuario quiere permitir escaneos sin login, descomentar esto:
-- ==========================================
-- CREATE POLICY "evaluations_anon_insert" ON public.evaluations
--  FOR INSERT WITH CHECK (auth.uid() IS NULL);
