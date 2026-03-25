import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, CheckCircle2, XCircle, Clock } from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";
import { useToast } from "@/hooks/use-toast";

const DashboardPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/login");
      return;
    }

    const [profileRes, rolesRes, avatarRes, approvalsRes] = await Promise.all([
      supabase.from("profiles").select("*, schools(name)").eq("id", user.id).single(),
      supabase.from("user_roles").select("*").eq("user_id", user.id),
      supabase.from("avatars").select("*").eq("user_id", user.id).single(),
      supabase.from("approvals").select("*, profiles!approvals_user_id_fkey(full_name, email)").eq("status", "pending"),
    ]);

    setProfile(profileRes.data);
    setRoles(rolesRes.data || []);
    if (avatarRes.data) {
      setAvatar({
        faceShape: avatarRes.data.face_shape,
        skinColor: avatarRes.data.skin_color,
        eyeShape: avatarRes.data.eye_shape,
        eyeColor: avatarRes.data.eye_color,
        hairStyle: avatarRes.data.hair_style,
        hairColor: avatarRes.data.hair_color,
        facialHair: avatarRes.data.facial_hair || "none",
        outfit: avatarRes.data.outfit,
        outfitColor: avatarRes.data.outfit_color,
        accessory: avatarRes.data.accessory || "none",
        expression: avatarRes.data.expression,
        background: avatarRes.data.background,
      });
    }
    setPendingApprovals(approvalsRes.data || []);
    setLoading(false);
  };

  const handleApproval = async (approvalId: string, userId: string, approved: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from("approvals").update({
      status: approved ? "approved" : "rejected",
      approver_id: user?.id,
    }).eq("id", approvalId);

    if (approved) {
      await supabase.from("profiles").update({ is_approved: true }).eq("id", userId);
    }

    toast({ title: approved ? "המשתמש אושר ✅" : "המשתמש נדחה ❌" });
    loadData();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">טוען...</p></div>;
  }

  const roleLabels: Record<string, string> = {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {avatar && <AvatarPreview config={avatar} size={64} />}
            <div>
              <h1 className="text-2xl font-heading font-bold">שלום, {profile?.full_name} 👋</h1>
              <div className="flex gap-2 mt-1">
                {roles.map((r) => (
                  <span key={r.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-heading">
                    {roleLabels[r.role] || r.role}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" />
            התנתק
          </Button>
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <Card className="mb-6 border-warning/30">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                בקשות ממתינות לאישור ({pendingApprovals.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingApprovals.map((approval) => (
                <div key={approval.id} className="flex items-center justify-between p-4 bg-muted rounded-xl">
                  <div>
                    <p className="font-heading font-medium">{(approval as any).profiles?.full_name || "משתמש"}</p>
                    <p className="text-sm text-muted-foreground">{approval.notes}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-success border-success/30 hover:bg-success/10"
                      onClick={() => handleApproval(approval.id, approval.user_id, true)}
                    >
                      <CheckCircle2 className="w-4 h-4" /> אשר
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleApproval(approval.id, approval.user_id, false)}
                    >
                      <XCircle className="w-4 h-4" /> דחה
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">מידע כללי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground">בית ספר:</span> {(profile as any)?.schools?.name || "—"}</p>
            <p><span className="text-muted-foreground">אימייל:</span> {profile?.email}</p>
            <p><span className="text-muted-foreground">סטטוס:</span> {profile?.is_approved ? "✅ מאושר" : "⏳ ממתין לאישור"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
