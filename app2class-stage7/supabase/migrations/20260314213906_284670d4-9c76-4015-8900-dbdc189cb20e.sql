-- Allow conversation participants (not just creator) to update conversation (e.g. accept request)
DROP POLICY IF EXISTS "Creator can update conversation" ON public.conversations;
CREATE POLICY "Participants can update conversation"
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  OR public.is_conversation_participant(id, auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  OR public.is_conversation_participant(id, auth.uid())
);

-- Clean up duplicate private conversations between same user pairs
-- Keep only the newest one per pair
DELETE FROM public.conversations
WHERE id IN (
  SELECT c.id FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id != cp1.user_id
  WHERE c.type = 'private'
  AND c.id NOT IN (
    SELECT DISTINCT ON (LEAST(cp1b.user_id, cp2b.user_id), GREATEST(cp1b.user_id, cp2b.user_id))
      cb.id
    FROM public.conversations cb
    JOIN public.conversation_participants cp1b ON cp1b.conversation_id = cb.id
    JOIN public.conversation_participants cp2b ON cp2b.conversation_id = cb.id AND cp2b.user_id != cp1b.user_id
    WHERE cb.type = 'private'
    ORDER BY LEAST(cp1b.user_id, cp2b.user_id), GREATEST(cp1b.user_id, cp2b.user_id), cb.updated_at DESC
  )
);