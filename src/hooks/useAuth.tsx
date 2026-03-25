import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  isApproved: boolean;
  schoolId: string | null;
  schoolName: string | null;
  roles: string[];
  avatar: AvatarConfig | null;
  pendingApprovalsCount: number;
  unreadChatCount: number;
}

export const useAuth = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/login");
      return;
    }

    const [profileRes, rolesRes, avatarRes] = await Promise.all([
      supabase.from("profiles").select("*, schools(name)").eq("id", user.id).single(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("avatars").select("*").eq("user_id", user.id).single(),
    ]);

    if (!profileRes.data) {
      navigate("/login");
      return;
    }

    const roles = (rolesRes.data || []).map((r: any) => r.role);

    // Count pending approvals relevant to this user's roles
    let pendingCount = 0;
    for (const role of roles) {
      const { count } = await supabase
        .from("approvals")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("required_role", role);
      pendingCount += count || 0;
    }

    // Count unread chat messages
    let unreadChatCount = 0;
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);
    if (participations) {
      for (const p of participations) {
        if (p.last_read_at) {
          const { count } = await supabase
            .from("messages").select("*", { count: "exact", head: true })
            .eq("conversation_id", p.conversation_id)
            .gt("created_at", p.last_read_at);
          unreadChatCount += count || 0;
        }
      }
    }

    let avatar: AvatarConfig | null = null;
    if (avatarRes.data) {
      const faceToBody: Record<string, string> = {
        round: "basic", oval: "basic", square: "wider", long: "taller",
        basic: "basic", wider: "wider", taller: "taller",
      };
      avatar = {
        body_type: faceToBody[avatarRes.data.face_shape] || "basic",
        eye_color: avatarRes.data.eye_color || "brown",
        skin: avatarRes.data.skin_color || "#FDDBB4",
        hair_style: avatarRes.data.hair_style || "boy",
        hair_color: avatarRes.data.hair_color || "#2C1A0E",
      };
    }

    setProfile({
      id: user.id,
      fullName: profileRes.data.full_name,
      email: profileRes.data.email,
      isApproved: profileRes.data.is_approved,
      schoolId: profileRes.data.school_id,
      schoolName: (profileRes.data as any).schools?.name || null,
      roles,
      avatar,
      pendingApprovalsCount: pendingCount,
      unreadChatCount,
    });

    // Record gamification activity
    try {
      await supabase.rpc("update_user_streak", { p_user_id: user.id });
      await supabase.rpc("check_and_award_badge", {
        p_user_id: user.id,
        p_badge_key: "pioneer",
        p_badge_label: "החלוץ 🏴",
        p_badge_icon: "🏴",
        p_category: "onboarding",
      });
    } catch { /* gamification is best-effort */ }

    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return { profile, loading, logout, refresh: loadProfile };
};
