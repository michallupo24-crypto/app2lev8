-- Optional: Foreign keys so PostgREST can resolve relationships in schema cache.
-- The app works without these (client loads profiles separately). Run in SQL Editor if you want API-level joins.

-- conversation_participants.user_id → profiles (fixes "Could not find a relationship between conversation_participants and profiles")
ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_user_id_fkey;

ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- messages.sender_id → profiles (optional; enables future select with embed on messages)
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
