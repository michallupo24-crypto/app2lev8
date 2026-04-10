-- 1. Allow parents to view assignments for their children's classes
-- This fixes the "Without Name" (ללא שם) bug in grade reports
CREATE POLICY "Parents can view children's assignments"
ON public.assignments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    JOIN public.profiles student ON student.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND student.class_id = assignments.class_id
  )
);

-- 2. Ensure parents can view educator names and counselor profiles
-- This fixes the empty staff names on the dashboard
CREATE POLICY "Parents can view staff profiles for their children"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    JOIN public.profiles student ON student.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND profiles.school_id = student.school_id
    AND profiles.id IN (
        SELECT user_id FROM public.user_roles 
        WHERE role IN ('educator', 'counselor', 'professional_teacher', 'management')
    )
  )
);

-- 3. Allow parents to view class-level and grade-level conversations
-- This ensures auto-joining and deep-linking into groups works
CREATE POLICY "Parents can view children's class/grade conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_student ps
    JOIN public.profiles student ON student.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND (
        conversations.class_id = student.class_id OR 
        (conversations.type = 'parent_grade' AND conversations.school_id = student.school_id)
    )
  )
);
