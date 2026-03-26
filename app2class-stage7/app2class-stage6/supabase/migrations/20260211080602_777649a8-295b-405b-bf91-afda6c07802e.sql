
-- Drop all existing restrictive policies on approvals
DROP POLICY IF EXISTS "Approvers can update approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can view pending approvals" ON public.approvals;
DROP POLICY IF EXISTS "Users can insert approvals" ON public.approvals;
DROP POLICY IF EXISTS "Users can view own approvals" ON public.approvals;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Approvers can view pending approvals"
ON public.approvals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = approvals.required_role
  )
);

CREATE POLICY "Users can view own approvals"
ON public.approvals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Approvers can update approvals"
ON public.approvals FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = approvals.required_role
  )
);

CREATE POLICY "Users can insert approvals"
ON public.approvals FOR INSERT
WITH CHECK (auth.uid() = user_id);
