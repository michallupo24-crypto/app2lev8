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

    // GRACEFUL DEGRADATION: Do not kick the user out if profile fetch is blocked.
    // Give them a valid profile using user auth metadata so the app can remain functional.
    if (!profileRes.data && profileRes.error) {
      console.error("Profile fetch error:", profileRes.error);
    }

    const roles = (rolesRes.data || []).map((r: any) => r.role);
    
    // Construct identity variables, defaulting to auth instance payload if SQL fails
    const fullName = profileRes.data?.full_name || user.user_metadata?.full_name || "משתמש אנונימי";
    const userEmail = profileRes.data?.email || user.email || "";
    const isApproved = profileRes.data ? profileRes.data.is_approved : true;
    const schoolId = profileRes.data?.school_id || null;
    const schoolName = profileRes.data ? (profileRes.data as any).schools?.name : null;
    
    // Fallback roles for emergency access to avoid blank dashboards
    const validRoles = roles.length > 0 ? roles : ["parent"];

    // Count pending approvals — single query with IN filter
    let pendingCount = 0;
    if (roles.length > 0) {
      const { count } = await supabase
        .from("approvals")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .in("required_role", roles);
      pendingCount = count || 0;
    }

    // Count unread chat messages — single query via RPC or aggregated
    let unreadChatCount = 0;
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);
    if (participations && participations.length > 0) {
      // Batch: get all messages newer than last_read_at in any of these conversations
      const convIds = participations.map((p: any) => p.conversation_id);
      const minReadAt = participations
        .filter((p: any) => p.last_read_at)
        .reduce((min: string, p: any) => p.last_read_at < min ? p.last_read_at : min,
          participations[0]?.last_read_at || new Date().toISOString());
      if (convIds.length > 0) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .neq("sender_id", user.id)
          .gt("created_at", minReadAt);
        unreadChatCount = count || 0;
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
      fullName,
      email: userEmail,
      isApproved,
      schoolId,
      schoolName,
      roles: validRoles,
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
