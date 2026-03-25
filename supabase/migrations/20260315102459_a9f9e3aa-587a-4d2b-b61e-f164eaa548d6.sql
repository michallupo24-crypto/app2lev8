
-- Live lesson sessions (teacher starts when class begins)
CREATE TABLE public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  lesson_number SMALLINT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id UUID NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Content sharing
  shared_content_type TEXT DEFAULT 'none', -- 'none', 'image', 'link', 'whiteboard'
  shared_content_url TEXT,
  shared_content_title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Teachers can manage their own sessions
CREATE POLICY "Teachers can manage own live sessions" ON public.live_sessions
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students can view active sessions for their class
CREATE POLICY "Students can view active live sessions" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.class_id = live_sessions.class_id
    )
  );

-- Staff can view all sessions
CREATE POLICY "Staff can view live sessions" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role) OR
    has_role(auth.uid(), 'system_admin'::app_role) OR
    has_role(auth.uid(), 'grade_coordinator'::app_role)
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;

-- Live Q&A questions
CREATE TABLE public.live_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  upvotes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_questions ENABLE ROW LEVEL SECURITY;

-- Students can ask questions in sessions they can see
CREATE POLICY "Students can insert questions" ON public.live_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      JOIN public.profiles p ON p.class_id = ls.class_id
      WHERE ls.id = live_questions.session_id AND p.id = auth.uid() AND ls.is_active = true
    )
  );

-- Everyone in the session can see questions
CREATE POLICY "Session participants can view questions" ON public.live_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_questions.session_id AND (
        ls.teacher_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.class_id = ls.class_id)
      )
    )
  );

-- Teachers can update questions (mark answered)
CREATE POLICY "Teachers can update questions" ON public.live_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_questions.session_id AND ls.teacher_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_questions;

-- Live polls
CREATE TABLE public.live_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL DEFAULT 'poll', -- 'poll', 'quiz'
  options JSONB NOT NULL DEFAULT '[]', -- [{text: "...", isCorrect?: boolean}]
  is_active BOOLEAN NOT NULL DEFAULT false,
  show_results BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_polls ENABLE ROW LEVEL SECURITY;

-- Teachers can manage polls in their sessions
CREATE POLICY "Teachers can manage polls" ON public.live_polls
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_polls.session_id AND ls.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_polls.session_id AND ls.teacher_id = auth.uid()
    )
  );

-- Students can view active polls
CREATE POLICY "Students can view active polls" ON public.live_polls
  FOR SELECT TO authenticated
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      JOIN public.profiles p ON p.class_id = ls.class_id
      WHERE ls.id = live_polls.session_id AND p.id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_polls;

-- Poll responses
CREATE TABLE public.live_poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.live_polls(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  selected_option INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, student_id)
);

ALTER TABLE public.live_poll_responses ENABLE ROW LEVEL SECURITY;

-- Students can submit responses
CREATE POLICY "Students can submit poll responses" ON public.live_poll_responses
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Students can view own responses
CREATE POLICY "Students can view own responses" ON public.live_poll_responses
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Teachers can view all responses for their polls
CREATE POLICY "Teachers can view poll responses" ON public.live_poll_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_polls lp
      JOIN public.live_sessions ls ON ls.id = lp.session_id
      WHERE lp.id = live_poll_responses.poll_id AND ls.teacher_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_poll_responses;

-- Question upvotes (prevent duplicates)
CREATE TABLE public.live_question_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, user_id)
);

ALTER TABLE public.live_question_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can vote on questions" ON public.live_question_votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view votes" ON public.live_question_votes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can remove own votes" ON public.live_question_votes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
