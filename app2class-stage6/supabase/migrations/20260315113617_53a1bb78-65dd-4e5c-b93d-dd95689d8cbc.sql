-- Allow subject coordinators to manage teacher_classes
CREATE POLICY "Subject coordinators can manage teacher classes"
ON public.teacher_classes
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'subject_coordinator'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
  OR has_role(auth.uid(), 'system_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'subject_coordinator'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
  OR has_role(auth.uid(), 'system_admin'::app_role)
);