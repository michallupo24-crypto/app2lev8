import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  isApproved: boolean;
  schoolId: string | null;
  roles: string[];
  avatar: any | null;
  pendingApprovalsCount: number;
  unreadChatCount: number;
}

export const useAuth = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      if (profileRes.data) {
        setProfile({
          id: user.id,
          fullName: profileRes.data.full_name,
          email: profileRes.data.email,
          isApproved: profileRes.data.is_approved,
          schoolId: profileRes.data.school_id,
          roles: (rolesRes.data || []).map((r: any) => r.role),
          avatar: null,
          pendingApprovalsCount: 0,
          unreadChatCount: 0,
        });
      }
    } catch (error) {
      console.error("Auth Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return { profile, loading, logout, refresh: loadProfile };
};
