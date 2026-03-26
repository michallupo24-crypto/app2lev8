-- Add is_homeroom to teacher_classes if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teacher_classes' AND column_name = 'is_homeroom'
  ) THEN
    ALTER TABLE public.teacher_classes ADD COLUMN is_homeroom BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Parents can read attendance for their children
CREATE POLICY IF NOT EXISTS "Parents can view children attendance"
ON public.attendance FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_id = auth.uid() AND ps.student_id = attendance.student_id
  )
);

-- Parents can view their children's submissions
CREATE POLICY IF NOT EXISTS "Parents can view children submissions"
ON public.submissions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_id = auth.uid() AND ps.student_id = submissions.student_id
  )
);
