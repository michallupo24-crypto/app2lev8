
-- App Role enum
CREATE TYPE public.app_role AS ENUM (
  'student',
  'parent', 
  'educator',
  'professional_teacher',
  'subject_coordinator',
  'grade_coordinator',
  'counselor',
  'management',
  'system_admin'
);

-- Approval status enum
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Grade level enum
CREATE TYPE public.grade_level AS ENUM ('ז', 'ח', 'ט', 'י', 'יא', 'יב');

-- Schools table (fixed list)
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schools are viewable by everyone" ON public.schools FOR SELECT USING (true);

-- Insert fixed schools
INSERT INTO public.schools (name) VALUES
  ('תיכון חדש תל אביב'),
  ('תיכון בן צבי קריית אונו'),
  ('בית ספר אהבת ציון'),
  ('תיכון ליד"ה ירושלים');

-- Classes table
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade grade_level NOT NULL,
  class_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, grade, class_number)
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Classes are viewable by everyone" ON public.classes FOR SELECT USING (true);

-- Generate classes for each school (grades ז-יב, classes 1-10)
INSERT INTO public.classes (school_id, grade, class_number)
SELECT s.id, g.grade, c.num
FROM public.schools s
CROSS JOIN (VALUES ('ז'::grade_level), ('ח'), ('ט'), ('י'), ('יא'), ('יב')) AS g(grade)
CROSS JOIN generate_series(1, 10) AS c(num);

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  id_number TEXT, -- encrypted/hashed ID number
  school_id UUID REFERENCES public.schools(id),
  class_id UUID REFERENCES public.classes(id),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Approved users can view other profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles table (many-to-many)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  -- Role-specific metadata
  subject TEXT, -- for teachers/subject coordinators
  grade grade_level, -- for grade coordinators/counselors
  homeroom_class_id UUID REFERENCES public.classes(id), -- for educators
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Users can insert own roles" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- has_role function (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Teacher-class mapping
CREATE TABLE public.teacher_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, class_id)
);
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher classes viewable by authenticated" ON public.teacher_classes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own teacher classes" ON public.teacher_classes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Parent-student linking
CREATE TABLE public.parent_student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);
ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parent-student links" ON public.parent_student FOR SELECT USING (auth.uid() = parent_id OR auth.uid() = student_id);
CREATE POLICY "Parents can insert links" ON public.parent_student FOR INSERT WITH CHECK (auth.uid() = parent_id);

-- Avatars table (stored as JSON code, not images)
CREATE TABLE public.avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  face_shape TEXT NOT NULL DEFAULT 'round',
  skin_color TEXT NOT NULL DEFAULT '#FFD2A1',
  eye_shape TEXT NOT NULL DEFAULT 'round',
  eye_color TEXT NOT NULL DEFAULT '#4A3728',
  hair_style TEXT NOT NULL DEFAULT 'short',
  hair_color TEXT NOT NULL DEFAULT '#2C1B0E',
  facial_hair TEXT DEFAULT 'none',
  outfit TEXT NOT NULL DEFAULT 'casual',
  outfit_color TEXT NOT NULL DEFAULT '#3B82F6',
  accessory TEXT DEFAULT 'none',
  expression TEXT NOT NULL DEFAULT 'happy',
  background TEXT NOT NULL DEFAULT '#E0F2FE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Avatars viewable by authenticated" ON public.avatars FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own avatar" ON public.avatars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own avatar" ON public.avatars FOR UPDATE USING (auth.uid() = user_id);

-- Approvals queue
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES auth.users(id),
  status approval_status NOT NULL DEFAULT 'pending',
  required_role app_role NOT NULL, -- which role needs to approve
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own approvals" ON public.approvals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Approvers can view pending" ON public.approvals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = required_role)
);
CREATE POLICY "Users can insert approvals" ON public.approvals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Approvers can update approvals" ON public.approvals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = required_role)
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create system admin account will be seeded after auth setup
