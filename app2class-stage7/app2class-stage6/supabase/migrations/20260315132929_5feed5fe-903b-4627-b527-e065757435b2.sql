
-- Allow system_admin to delete profiles (needed for admin user management)
CREATE POLICY "System admin can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'system_admin'::app_role));

-- Allow system_admin to delete avatars
CREATE POLICY "System admin can delete avatars"
ON public.avatars
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'system_admin'::app_role));

-- Allow system_admin to manage all user_roles
CREATE POLICY "System admin can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'system_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'system_admin'::app_role));
