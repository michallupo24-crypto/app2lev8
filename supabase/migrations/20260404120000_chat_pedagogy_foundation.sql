-- App2Class pedagogical chat foundation: channel taxonomy, teacher presence,
-- distress/safety audit events (server-written), scheduled message outbox.

-- 1) Expand conversation types (pedagogical channels)
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_type_check CHECK (
  type IN (
    'private',
    'group',
    'class_subject',
    'class_homeroom',
    'counseling',
    'parent_teacher'
  )
);

-- 2) Teacher/staff availability for "privacy & health" UX
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_presence text NOT NULL DEFAULT 'available';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_chat_presence_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_chat_presence_check CHECK (
  chat_presence IN ('available', 'in_lesson', 'resting')
);

COMMENT ON COLUMN public.profiles.chat_presence IS
  'Staff chat availability: available | in_lesson | resting (quiet hours are separate, per school).';

-- 3) Distress / safety signals — inserted only by Edge Function (service role)
CREATE TABLE IF NOT EXISTS public.chat_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  message_excerpt text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_safety_events_school_created
  ON public.chat_safety_events (school_id, created_at DESC);

ALTER TABLE public.chat_safety_events ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE for authenticated users — service role bypasses RLS
CREATE POLICY "School safety staff can view chat_safety_events"
ON public.chat_safety_events
FOR SELECT
USING (
  school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    public.has_role(auth.uid(), 'counselor'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'system_admin'::app_role)
  )
);

COMMENT ON TABLE public.chat_safety_events IS
  'Discreet distress alerts from chat moderation; visible to counselor/management/system_admin in the same school.';

-- 4) Scheduled messaging outbox (delivery via future cron/edge job)
CREATE TABLE IF NOT EXISTS public.scheduled_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content text NOT NULL,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_chat_pending
  ON public.scheduled_chat_messages (send_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.scheduled_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scheduled chat messages"
ON public.scheduled_chat_messages
FOR ALL
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

COMMENT ON TABLE public.scheduled_chat_messages IS
  'Messages queued for send_at; requires a processor (cron) to insert into messages and set sent_at.';
