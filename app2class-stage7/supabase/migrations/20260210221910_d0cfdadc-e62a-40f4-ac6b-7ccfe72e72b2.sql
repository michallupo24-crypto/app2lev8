
-- Drop all existing restrictive SELECT policies on profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Approved users can view other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Approved users can view other profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'system_admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'educator') OR public.has_role(auth.uid(), 'grade_coordinator') OR public.has_role(auth.uid(), 'subject_coordinator') OR public.has_role(auth.uid(), 'counselor'));

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Also fix approvals policies - same issue
DROP POLICY IF EXISTS "Approvers can update approvals" ON public.approvals;
DROP POLICY IF EXISTS "Approvers can view pending" ON public.approvals;
DROP POLICY IF EXISTS "Users can insert approvals" ON public.approvals;
DROP POLICY IF EXISTS "Users can view own approvals" ON public.approvals;

CREATE POLICY "Users can view own approvals"
ON public.approvals FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Approvers can view pending approvals"
ON public.approvals FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = approvals.required_role));

CREATE POLICY "Users can insert approvals"
ON public.approvals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Approvers can update approvals"
ON public.approvals FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = approvals.required_role));

-- Fix avatars policies
DROP POLICY IF EXISTS "Avatars viewable by authenticated" ON public.avatars;
DROP POLICY IF EXISTS "Users can insert own avatar" ON public.avatars;
DROP POLICY IF EXISTS "Users can update own avatar" ON public.avatars;

CREATE POLICY "Avatars viewable by authenticated"
ON public.avatars FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own avatar"
ON public.avatars FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own avatar"
ON public.avatars FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Fix other tables too
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Anyone can view roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Teacher classes viewable by authenticated" ON public.teacher_classes;
DROP POLICY IF EXISTS "Users can insert own teacher classes" ON public.teacher_classes;

CREATE POLICY "Teacher classes viewable by authenticated"
ON public.teacher_classes FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own teacher classes"
ON public.teacher_classes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Parents can insert links" ON public.parent_student;
DROP POLICY IF EXISTS "Users can view own parent-student links" ON public.parent_student;

CREATE POLICY "Parents can insert links"
ON public.parent_student FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Users can view own parent-student links"
ON public.parent_student FOR SELECT
TO authenticated
USING (auth.uid() = parent_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "Schools are viewable by everyone" ON public.schools;
CREATE POLICY "Schools are viewable by everyone"
ON public.schools FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Classes are viewable by everyone" ON public.classes;
CREATE POLICY "Classes are viewable by everyone"
ON public.classes FOR SELECT
USING (true);
