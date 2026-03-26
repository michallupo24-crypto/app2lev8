-- Add content column to submissions if not exists (for text submissions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.submissions ADD COLUMN content TEXT;
  END IF;
END $$;

-- Add published column to assignments if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignments' AND column_name = 'published'
  ) THEN
    ALTER TABLE public.assignments ADD COLUMN published BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Students can view their own submissions
CREATE POLICY IF NOT EXISTS "Students can insert own submissions"
ON public.submissions FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Students can update own submissions"
ON public.submissions FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());
