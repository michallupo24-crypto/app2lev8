
-- Syllabi table: define subject topics and required hours
CREATE TABLE IF NOT EXISTS public.syllabi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  grade public.grade_level NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  estimated_hours INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Syllabus progress tracking for a specific class
CREATE TABLE IF NOT EXISTS public.class_syllabus_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  syllabus_id UUID NOT NULL REFERENCES public.syllabi(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  completed_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, syllabus_id)
);

-- School events and holidays (Israeli holidays and specific school events)
CREATE TABLE IF NOT EXISTS public.school_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE, -- NULL means global holiday
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_holiday BOOLEAN DEFAULT true, -- If true, no lessons occur
  event_type TEXT DEFAULT 'holiday', -- 'holiday', 'trip', 'exam_period', 'ceremony'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.syllabi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_syllabus_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Syllabi are viewable by authenticated" ON public.syllabi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Subject coordinators can manage syllabi" ON public.syllabi FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'subject_coordinator')
);

CREATE POLICY "Class syllabus progress viewable by authenticated" ON public.class_syllabus_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can update class progress" ON public.class_syllabus_progress FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('educator', 'professional_teacher'))
);

CREATE POLICY "School events viewable by authenticated" ON public.school_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage school events" ON public.school_events FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('management', 'system_admin'))
);

-- Insert global Israeli holidays for 2024-2025 (Basic sample)
INSERT INTO public.school_events (title, start_date, end_date, is_holiday, event_type) VALUES
  ('ראש השנה', '2024-10-02', '2024-10-04', true, 'holiday'),
  ('יום כיפור', '2024-10-11', '2024-10-12', true, 'holiday'),
  ('סוכות', '2024-10-16', '2024-10-25', true, 'holiday'),
  ('חנוכה', '2024-12-25', '2025-01-02', true, 'holiday'),
  ('פורים', '2025-03-13', '2025-03-16', true, 'holiday'),
  ('פסח', '2025-04-12', '2025-04-20', true, 'holiday'),
  ('יום העצמאות', '2025-04-30', '2025-05-01', true, 'holiday'),
  ('שבועות', '2025-06-01', '2025-06-03', true, 'holiday');
