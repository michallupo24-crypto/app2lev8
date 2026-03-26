-- Allow staff with approval power to update is_approved on other users' profiles
CREATE POLICY "Staff can approve users"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'system_admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'educator') OR
  public.has_role(auth.uid(), 'grade_coordinator')
)
WITH CHECK (
  public.has_role(auth.uid(), 'system_admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'educator') OR
  public.has_role(auth.uid(), 'grade_coordinator')
);