-- Enable Realtime on attendance so ParentDashboard can subscribe to live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;

-- Parents can view attendance for their children
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance' AND policyname = 'Parents can view children attendance'
  ) THEN
    CREATE POLICY "Parents can view children attendance"
    ON public.attendance FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.parent_id = auth.uid() AND ps.student_id = attendance.student_id
      )
    );
  END IF;
END $$;

-- Students can view their own attendance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance' AND policyname = 'Students can view own attendance'
  ) THEN
    CREATE POLICY "Students can view own attendance"
    ON public.attendance FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());
  END IF;
END $$;
