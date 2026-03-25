
-- ==========================================
-- GAMIFICATION SYSTEM: Badges, Streaks, Reliability
-- ==========================================

-- 1. User badges table
CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  badge_icon text NOT NULL DEFAULT '🏅',
  badge_category text NOT NULL DEFAULT 'general',
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_key)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all badges" ON public.user_badges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert badges" ON public.user_badges
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 2. User streaks table (daily usage tracking)
CREATE TABLE public.user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date NOT NULL DEFAULT CURRENT_DATE,
  total_active_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all streaks" ON public.user_streaks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own streak" ON public.user_streaks
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. User reliability scores
CREATE TABLE public.user_reliability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  score integer NOT NULL DEFAULT 50,
  total_positive integer NOT NULL DEFAULT 0,
  total_negative integer NOT NULL DEFAULT 0,
  is_faction_guardian boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all reliability" ON public.user_reliability
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own reliability" ON public.user_reliability
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Allow staff to update reliability scores
CREATE POLICY "Staff can update reliability" ON public.user_reliability
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'educator') OR
    has_role(auth.uid(), 'grade_coordinator') OR
    has_role(auth.uid(), 'management') OR
    has_role(auth.uid(), 'system_admin')
  );

-- 4. Add is_community_pinned to faction_posts for auto-FAQ
ALTER TABLE public.faction_posts ADD COLUMN IF NOT EXISTS is_community_pinned boolean DEFAULT false;

-- 5. Add flowers count trigger for faction_posts
CREATE OR REPLACE FUNCTION public.update_post_flowers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE faction_posts SET flowers = flowers + 1 WHERE id = NEW.post_id;
      -- Auto community pin if flowers >= 10
      UPDATE faction_posts SET is_community_pinned = true WHERE id = NEW.post_id AND flowers >= 10;
    END IF;
    IF NEW.comment_id IS NOT NULL THEN
      UPDATE faction_comments SET flowers = flowers + 1 WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE faction_posts SET flowers = GREATEST(flowers - 1, 0) WHERE id = OLD.post_id;
      UPDATE faction_posts SET is_community_pinned = false WHERE id = OLD.post_id AND flowers < 10;
    END IF;
    IF OLD.comment_id IS NOT NULL THEN
      UPDATE faction_comments SET flowers = GREATEST(flowers - 1, 0) WHERE id = OLD.comment_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_flower_votes_sync
  AFTER INSERT OR DELETE ON public.flower_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_post_flowers();

-- 6. Streak update function
CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record user_streaks%ROWTYPE;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT * INTO v_record FROM user_streaks WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, total_active_days)
    VALUES (p_user_id, 1, 1, v_today, 1);
    RETURN;
  END IF;
  
  IF v_record.last_active_date = v_today THEN
    RETURN; -- Already active today
  END IF;
  
  IF v_record.last_active_date = v_today - 1 THEN
    -- Consecutive day
    UPDATE user_streaks SET
      current_streak = current_streak + 1,
      longest_streak = GREATEST(longest_streak, current_streak + 1),
      last_active_date = v_today,
      total_active_days = total_active_days + 1,
      updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    -- Streak broken
    UPDATE user_streaks SET
      current_streak = 1,
      last_active_date = v_today,
      total_active_days = total_active_days + 1,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- 7. Badge check function
CREATE OR REPLACE FUNCTION public.check_and_award_badge(p_user_id uuid, p_badge_key text, p_badge_label text, p_badge_icon text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_badges (user_id, badge_key, badge_label, badge_icon, badge_category)
  VALUES (p_user_id, p_badge_key, p_badge_label, p_badge_icon, p_category)
  ON CONFLICT (user_id, badge_key) DO NOTHING;
  RETURN FOUND;
END;
$$;
