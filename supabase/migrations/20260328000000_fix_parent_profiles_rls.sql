
-- Allow parents to view their children's profiles even if not approved
CREATE POLICY "Parents can view their children's profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_id = auth.uid() AND ps.student_id = profiles.id
  )
);
