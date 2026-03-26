
-- Bell schedule per school
CREATE TABLE public.bell_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  lesson_number smallint NOT NULL,
  label text NOT NULL DEFAULT '',
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  break_duration_minutes smallint DEFAULT 0,
  UNIQUE(school_id, lesson_number)
);
ALTER TABLE public.bell_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bell schedule viewable by all authenticated" ON public.bell_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage bell schedule" ON public.bell_schedule FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management'))
  WITH CHECK (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management'));

-- Timetable slots - each slot links a lesson_number + day + class/group to a subject & teacher
CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  lesson_number smallint NOT NULL,
  subject text NOT NULL,
  teacher_id uuid,
  teacher_name text,
  room text,
  group_name text,
  color text DEFAULT '#E5E7EB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Timetable viewable by all authenticated" ON public.timetable_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage timetable" ON public.timetable_slots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'grade_coordinator'))
  WITH CHECK (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'grade_coordinator'));

-- Student tracks/electives (hakbatzot/megamot)
CREATE TABLE public.student_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  track_type text NOT NULL CHECK (track_type IN ('megama', 'hakbatza')),
  track_name text NOT NULL,
  level text,
  approved boolean DEFAULT false,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, track_name, track_type)
);
ALTER TABLE public.student_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tracks" ON public.student_tracks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own tracks" ON public.student_tracks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff can view all tracks" ON public.student_tracks FOR SELECT TO authenticated 
  USING (has_role(auth.uid(), 'educator') OR has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'grade_coordinator'));
CREATE POLICY "Staff can update tracks" ON public.student_tracks FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'educator') OR has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'system_admin'))
  WITH CHECK (has_role(auth.uid(), 'educator') OR has_role(auth.uid(), 'management') OR has_role(auth.uid(), 'system_admin'));

-- App2Community: Factions (forums)
CREATE TABLE public.factions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  faction_type text NOT NULL CHECK (faction_type IN ('main_hub', 'student_sanctuary', 'staff_room', 'parents_circle')),
  sub_type text,
  grade text,
  class_id uuid REFERENCES public.classes(id),
  subject text,
  icon text DEFAULT '💬',
  color text DEFAULT '#6366F1',
  eligible_roles text[] NOT NULL DEFAULT '{}',
  is_sub_faction boolean DEFAULT false,
  parent_faction_id uuid REFERENCES public.factions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view factions" ON public.factions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage factions" ON public.factions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management'))
  WITH CHECK (has_role(auth.uid(), 'system_admin') OR has_role(auth.uid(), 'management'));

-- Faction members
CREATE TABLE public.faction_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id uuid NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'guardian', 'admin')),
  reputation integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(faction_id, user_id)
);
ALTER TABLE public.faction_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view faction members" ON public.faction_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join factions" ON public.faction_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can leave factions" ON public.faction_members FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Guardians can manage members" ON public.faction_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.faction_members fm WHERE fm.faction_id = faction_members.faction_id AND fm.user_id = auth.uid() AND fm.role IN ('guardian', 'admin')));

-- Faction posts
CREATE TABLE public.faction_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id uuid NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  title text,
  content text NOT NULL,
  flowers integer NOT NULL DEFAULT 0,
  is_pinned boolean DEFAULT false,
  is_removed boolean DEFAULT false,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faction_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view posts" ON public.faction_posts FOR SELECT TO authenticated
  USING (NOT is_removed AND EXISTS (SELECT 1 FROM public.faction_members fm WHERE fm.faction_id = faction_posts.faction_id AND fm.user_id = auth.uid()));
CREATE POLICY "Members can create posts" ON public.faction_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.faction_members fm WHERE fm.faction_id = faction_posts.faction_id AND fm.user_id = auth.uid()));
CREATE POLICY "Authors can update own posts" ON public.faction_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "Guardians can manage posts" ON public.faction_posts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.faction_members fm WHERE fm.faction_id = faction_posts.faction_id AND fm.user_id = auth.uid() AND fm.role IN ('guardian', 'admin')));

-- Faction comments
CREATE TABLE public.faction_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.faction_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  flowers integer NOT NULL DEFAULT 0,
  is_removed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faction_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Post viewers can view comments" ON public.faction_comments FOR SELECT TO authenticated
  USING (NOT is_removed);
CREATE POLICY "Members can create comments" ON public.faction_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors can update own comments" ON public.faction_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

-- Flower votes (reputation)
CREATE TABLE public.flower_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid REFERENCES public.faction_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.faction_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id),
  UNIQUE(user_id, comment_id),
  CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
);
ALTER TABLE public.flower_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own votes" ON public.flower_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can vote" ON public.flower_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can remove own votes" ON public.flower_votes FOR DELETE TO authenticated USING (user_id = auth.uid());
