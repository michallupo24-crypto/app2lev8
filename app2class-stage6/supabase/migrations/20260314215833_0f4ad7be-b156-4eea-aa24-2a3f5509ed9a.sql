CREATE POLICY "Students can view grade events for their class"
ON public.grade_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.classes c ON c.id = p.class_id
    WHERE p.id = auth.uid()
      AND c.grade = grade_events.grade
      AND c.school_id = grade_events.school_id
  )
);