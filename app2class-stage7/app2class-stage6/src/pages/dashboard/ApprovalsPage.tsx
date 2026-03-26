import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/hooks/useAuth";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד/ה",
  parent: "הורה",
  educator: "מחנך/ת",
  professional_teacher: "מורה מקצועי/ת",
  subject_coordinator: "רכז/ת מקצוע",
  grade_coordinator: "רכז/ת שכבה",
  counselor: "יועץ/ת",
  management: "הנהלה",
  system_admin: "מנהל/ת מערכת",
};

const REQUIRED_ROLE_LABELS: Record<string, string> = {
  educator: "דרוש אישור מחנך/ת",
  grade_coordinator: "דרוש אישור רכז/ת שכבה",
  management: "דרוש אישור הנהלה",
  system_admin: "דרוש אישור מנהל/ת מערכת",
};

interface ApprovalItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  notes: string | null;
  requiredRole: string;
  status: string;
  createdAt: string;
  avatar: AvatarConfig | null;
  userRoles: string[];
}

const ApprovalsPage = () => {
  const { profile, refresh } = useOutletContext<{ profile: UserProfile; refresh: () => void }>();
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  useEffect(() => {
    loadApprovals();
  }, [filter]);

  const loadApprovals = async () => {
    setLoading(true);
    let query = supabase
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    if (!data) {
      setApprovals([]);
      setLoading(false);
      return;
    }

    // Load profiles and avatars for all approval users
    const userIds = [...new Set(data.map((a: any) => a.user_id))];
    const [profilesRes, avatarsRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", userIds),
      supabase.from("avatars").select("*").in("user_id", userIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);

    const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
    const avatarsMap = new Map((avatarsRes.data || []).map((a: any) => [a.user_id, a]));
    const rolesMap = new Map<string, string[]>();
    (rolesRes.data || []).forEach((r: any) => {
      const existing = rolesMap.get(r.user_id) || [];
      existing.push(r.role);
      rolesMap.set(r.user_id, existing);
    });

    const items: ApprovalItem[] = data.map((a: any) => {
      const p = profilesMap.get(a.user_id);
      const av = avatarsMap.get(a.user_id);
      return {
        id: a.id,
        userId: a.user_id,
        userName: p?.full_name || "לא ידוע",
        userEmail: p?.email || "",
        notes: a.notes,
        requiredRole: a.required_role,
        status: a.status,
        createdAt: a.created_at,
        avatar: av ? {
          faceShape: av.face_shape, skinColor: av.skin_color, eyeShape: av.eye_shape,
          eyeColor: av.eye_color, hairStyle: av.hair_style, hairColor: av.hair_color,
          facialHair: av.facial_hair || "none", outfit: av.outfit, outfitColor: av.outfit_color,
          accessory: av.accessory || "none", expression: av.expression, background: av.background,
        } : null,
        userRoles: rolesMap.get(a.user_id) || [],
      };
    });

    setApprovals(items);
    setLoading(false);
  };

  const handleApproval = async (approval: ApprovalItem, approved: boolean) => {
    await supabase.from("approvals").update({
      status: approved ? "approved" : "rejected",
      approver_id: profile.id,
    }).eq("id", approval.id);

    if (approved) {
      await supabase.from("profiles").update({ is_approved: true }).eq("id", approval.userId);
    }

    toast({
      title: approved ? `${approval.userName} אושר/ה ✅` : `${approval.userName} נדחה ❌`,
    });

    loadApprovals();
    refresh();
  };

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-primary" />
            ניהול אישורים
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            ניהול בקשות רישום של משתמשים חדשים
          </p>
        </div>
        {pendingCount > 0 && filter === "pending" && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {pendingCount} ממתינים
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="font-heading"
          >
            {f === "pending" && "⏳ ממתינים"}
            {f === "approved" && "✅ אושרו"}
            {f === "rejected" && "❌ נדחו"}
            {f === "all" && "📋 הכל"}
          </Button>
        ))}
      </div>

      {/* Approvals List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-body">אין בקשות {filter === "pending" ? "ממתינות" : ""}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval, idx) => (
            <motion.div
              key={approval.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className={`transition-colors ${approval.status === "pending" ? "border-warning/30" : ""}`}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {approval.avatar ? (
                        <AvatarPreview config={approval.avatar} size={48} />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-lg">
                          👤
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm">{approval.userName}</p>
                      <p className="text-xs text-muted-foreground">{approval.userEmail}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {approval.userRoles.map((r) => (
                          <span key={r} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {ROLE_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                      {approval.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{approval.notes}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {REQUIRED_ROLE_LABELS[approval.requiredRole] || approval.requiredRole} • {new Date(approval.createdAt).toLocaleDateString("he-IL")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex gap-2">
                      {approval.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="gap-1 bg-success hover:bg-success/90 text-white font-heading"
                            onClick={() => handleApproval(approval, true)}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            אשר
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 font-heading"
                            onClick={() => handleApproval(approval, false)}
                          >
                            <XCircle className="w-4 h-4" />
                            דחה
                          </Button>
                        </>
                      ) : (
                        <Badge variant={approval.status === "approved" ? "default" : "destructive"} className="font-heading">
                          {approval.status === "approved" ? "✅ אושר" : "❌ נדחה"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default ApprovalsPage;
