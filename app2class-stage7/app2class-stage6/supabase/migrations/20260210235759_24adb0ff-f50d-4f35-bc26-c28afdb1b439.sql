-- Lessons table - each lesson instance
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id),
  subject TEXT NOT NULL,
  topic TEXT,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  lesson_number SMALLINT NOT NULL DEFAULT 1,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own lessons" ON public.lessons
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Staff can view lessons" ON public.lessons
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'educator') OR
    public.has_role(auth.uid(), 'grade_coordinator')
  );

-- Attendance records
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  noted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.teacher_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.teacher_id = auth.uid())
  );

CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Staff can view attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_admin') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'educator')
  );

-- Lesson notes (behavioral - positive, disruption, equipment)
CREATE TYPE public.note_category AS ENUM ('disruption', 'phone', 'disrespect', 'no_equipment', 'no_homework', 'positive_participation', 'helped_peer', 'excellence');

CREATE TABLE public.lesson_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  category public.note_category NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage lesson notes" ON public.lesson_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.teacher_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.teacher_id = auth.uid())
  );

CREATE POLICY "Staff can view lesson notes" ON public.lesson_notes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'educator') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'system_admin')
  );

-- Assignments
CREATE TYPE public.assignment_type AS ENUM ('homework', 'exam', 'quiz', 'project', 'exercise');

CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id),
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type public.assignment_type NOT NULL DEFAULT 'homework',
  due_date TIMESTAMPTZ,
  weight_percent SMALLINT DEFAULT 0,
  max_grade SMALLINT DEFAULT 100,
  allow_late_submission BOOLEAN DEFAULT false,
  allow_revision BOOLEAN DEFAULT false,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view published assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    published = true AND
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.class_id = assignments.class_id
    )
  );

CREATE POLICY "Staff can view assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'educator') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'system_admin')
  );

-- Submissions
CREATE TYPE public.submission_status AS ENUM ('draft', 'submitted', 'graded', 'revision_needed', 'revised');

CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  content TEXT,
  file_url TEXT,
  status public.submission_status NOT NULL DEFAULT 'draft',
  grade SMALLINT,
  feedback TEXT,
  graded_by UUID,
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage own submissions" ON public.submissions
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can view and grade submissions" ON public.submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a 
      WHERE a.id = assignment_id AND a.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a 
      WHERE a.id = assignment_id AND a.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'educator') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'system_admin')
  );

-- Focus reports (from students during lessons)
CREATE TABLE public.focus_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  level SMALLINT NOT NULL CHECK (level >= 1 AND level <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.focus_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can report own focus" ON public.focus_reports
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can view own focus" ON public.focus_reports
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view focus for their lessons" ON public.focus_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.teacher_id = auth.uid())
  );

CREATE POLICY "Staff can view focus reports" ON public.focus_reports
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'educator') OR
    public.has_role(auth.uid(), 'management') OR
    public.has_role(auth.uid(), 'system_admin')
  );

-- Triggers for updated_at
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();