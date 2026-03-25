
-- Question type enum
CREATE TYPE public.question_type AS ENUM ('multiple_choice', 'open', 'true_false', 'fill_blank', 'matching');

-- Task questions table
CREATE TABLE public.task_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  question_type public.question_type NOT NULL DEFAULT 'multiple_choice',
  question_text TEXT NOT NULL,
  options JSONB DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  explanation TEXT,
  points INTEGER DEFAULT 1,
  order_num INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  difficulty SMALLINT DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_questions ENABLE ROW LEVEL SECURITY;

-- Teachers can manage questions for their assignments
CREATE POLICY "Teachers can manage own task questions"
ON public.task_questions FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.assignments a
  WHERE a.id = task_questions.assignment_id AND a.teacher_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.assignments a
  WHERE a.id = task_questions.assignment_id AND a.teacher_id = auth.uid()
));

-- Students can view questions for published assignments in their class
CREATE POLICY "Students can view published task questions"
ON public.task_questions FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.assignments a
  JOIN public.profiles p ON p.class_id = a.class_id
  WHERE a.id = task_questions.assignment_id
    AND a.published = true
    AND p.id = auth.uid()
));

-- Staff can view all questions
CREATE POLICY "Staff can view task questions"
ON public.task_questions FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'educator') OR
  has_role(auth.uid(), 'management') OR
  has_role(auth.uid(), 'system_admin') OR
  has_role(auth.uid(), 'grade_coordinator')
);
