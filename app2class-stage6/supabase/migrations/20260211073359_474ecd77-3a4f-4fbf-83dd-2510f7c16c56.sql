
-- Grade Events: exams, trips, ceremonies, activities managed by grade coordinator
CREATE TABLE public.grade_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  grade grade_level NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'exam' CHECK (event_type IN ('exam', 'trip', 'ceremony', 'activity', 'tutoring', 'meeting', 'other')),
  subject TEXT, -- relevant for exam type
  event_date DATE NOT NULL,
  event_end_date DATE, -- for multi-day events
  start_time TIME,
  end_time TIME,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'cancelled')),
  proposed_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  requires_parent_approval BOOLEAN DEFAULT false,
  max_exams_per_week SMALLINT DEFAULT 3,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.grade_events ENABLE ROW LEVEL SECURITY;

-- Grade coordinator + management + admin can manage events
CREATE POLICY "Grade coordinators can manage grade events"
ON public.grade_events FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

-- Staff can view events
CREATE POLICY "Staff can view grade events"
ON public.grade_events FOR SELECT
USING (
  has_role(auth.uid(), 'educator') OR
  has_role(auth.uid(), 'professional_teacher') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'counselor')
);

-- Parent approval tracking for events
CREATE TABLE public.event_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.grade_events(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL,
  student_id UUID NOT NULL,
  approved BOOLEAN DEFAULT false,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own event approvals"
ON public.event_approvals FOR ALL
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Staff can view event approvals"
ON public.event_approvals FOR SELECT
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin') OR
  has_role(auth.uid(), 'educator')
);

-- Tutoring sessions management
CREATE TABLE public.tutoring_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  grade grade_level NOT NULL,
  subject TEXT NOT NULL,
  teacher_id UUID, -- assigned teacher
  title TEXT NOT NULL,
  description TEXT,
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  room TEXT,
  max_students SMALLINT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tutoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can manage tutoring sessions"
ON public.tutoring_sessions FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

CREATE POLICY "Teachers can view assigned tutoring"
ON public.tutoring_sessions FOR SELECT
USING (teacher_id = auth.uid() OR has_role(auth.uid(), 'educator'));

-- Students assigned to tutoring
CREATE TABLE public.tutoring_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.tutoring_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  attended BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tutoring_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can manage tutoring students"
ON public.tutoring_students FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

CREATE POLICY "Students can view own tutoring"
ON public.tutoring_students FOR SELECT
USING (student_id = auth.uid());

-- Staff meetings and protocols
CREATE TABLE public.staff_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  grade grade_level,
  subject TEXT, -- null = grade-wide, filled = subject-specific
  title TEXT NOT NULL,
  description TEXT,
  meeting_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  protocol TEXT, -- meeting minutes/summary
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  organized_by UUID NOT NULL,
  ai_suggested BOOLEAN DEFAULT false,
  suggestion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can manage staff meetings"
ON public.staff_meetings FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

CREATE POLICY "Staff can view meetings"
ON public.staff_meetings FOR SELECT
USING (
  has_role(auth.uid(), 'educator') OR
  has_role(auth.uid(), 'professional_teacher') OR
  has_role(auth.uid(), 'counselor')
);

-- Meeting attendees
CREATE TABLE public.meeting_attendees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.staff_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can manage meeting attendees"
ON public.meeting_attendees FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'subject_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

CREATE POLICY "Users can view own meeting attendance"
ON public.meeting_attendees FOR SELECT
USING (user_id = auth.uid());

-- Grade announcements
CREATE TABLE public.grade_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id),
  grade grade_level NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  announcement_type TEXT NOT NULL DEFAULT 'general' CHECK (announcement_type IN ('general', 'exam_schedule', 'event', 'urgent', 'logistics')),
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'parents', 'teachers', 'homeroom_teachers')),
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.grade_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can manage announcements"
ON public.grade_announcements FOR ALL
USING (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'grade_coordinator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin')
);

CREATE POLICY "Authenticated users can view published announcements"
ON public.grade_announcements FOR SELECT
USING (published = true AND auth.uid() IS NOT NULL);

-- Add triggers for updated_at
CREATE TRIGGER update_grade_events_updated_at
BEFORE UPDATE ON public.grade_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tutoring_sessions_updated_at
BEFORE UPDATE ON public.tutoring_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_meetings_updated_at
BEFORE UPDATE ON public.staff_meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grade_announcements_updated_at
BEFORE UPDATE ON public.grade_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
