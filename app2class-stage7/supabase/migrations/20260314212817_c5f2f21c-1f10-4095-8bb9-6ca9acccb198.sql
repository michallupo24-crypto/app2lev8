-- Fix broken conversations SELECT policy (cp.conversation_id = cp.id should be conversations.id)
drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations"
on public.conversations
for select
to authenticated
using (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
  )
);

-- Fix broken conversation_participants SELECT policy (self-referencing bug)
drop policy if exists "Participants can view participants" on public.conversation_participants;
create policy "Participants can view participants"
on public.conversation_participants
for select
to authenticated
using (
  EXISTS (
    SELECT 1 FROM conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND cp2.user_id = auth.uid()
  )
);

-- Fix broken messages SELECT policy (self-referencing bug)
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
on public.messages
for select
to authenticated
using (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);

-- Fix broken messages INSERT policy
drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);