
-- Add message_request_status to conversations for Instagram-like DM limits
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_accepted boolean DEFAULT true;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS grade text;

-- Allow participants to add other participants (for auto-group creation)
CREATE POLICY "Conversation creator can add participants" ON public.conversation_participants
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    OR auth.uid() = user_id
  );

-- Drop the old restrictive insert policy first
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;
