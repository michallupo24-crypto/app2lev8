-- 20260412000000_unlock_all_profiles_rls.sql
-- EMERGENCY FIX: Unlocking public.profiles row level security so that System Admins and Dashboards can fetch user data.
-- The previous policy strictly limited SELECT to the user's own profile, causing massive data omission on existing users.

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Approved users can view other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Everyone can view profiles" ON public.profiles;

-- Create an open policy to instantly restore functionality for admins and dashboards
CREATE POLICY "Everyone can view profiles" ON public.profiles FOR SELECT USING (true);
