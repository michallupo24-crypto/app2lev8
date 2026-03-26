-- Add target_audience to grade_announcements if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grade_announcements' AND column_name = 'target_audience'
  ) THEN
    ALTER TABLE public.grade_announcements ADD COLUMN target_audience TEXT DEFAULT 'grade';
  END IF;
END $$;

-- System admin can manage schools
CREATE POLICY IF NOT EXISTS "System admin can manage schools"
ON public.schools FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'system_admin'))
WITH CHECK (has_role(auth.uid(), 'system_admin'));

-- Management can view all profiles in their school
CREATE POLICY IF NOT EXISTS "Management can view school profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
  AND (has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'system_admin'))
);
