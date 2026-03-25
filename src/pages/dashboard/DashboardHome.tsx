import { useOutletContext, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Users, CheckCircle2, Clock, GraduationCap, BookOpen, Shield } from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

const ROLE_COLORS: Record<string, string> = {
  student: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  parent: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  educator: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  professional_teacher: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  subject_coordinator: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  grade_coordinator: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  counselor: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  management: "bg-red-500/10 text-red-600 border-red-500/20",
  system_admin: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
};

interface Stats {
  totalUsers: number;
  approvedUsers: number;
  pendingUsers: number;
  totalClasses: number;
}

const DashboardHome = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, approvedUsers: 0, pendingUsers: 0, totalClasses: 0 });

  const isStudent = profile.roles.includes("student");
  const isTeacher = profile.roles.some((r) =>
    ["professional_teacher", "subject_coordinator"].includes(r)
  );
  const isGradeCoordinator = profile.roles.includes("grade_coordinator");
  const isManagementOrAdmin = profile.roles.some((r) =>
    ["management", "system_admin"].includes(r)
  );
  const isStaff = profile.roles.some((r) =>
    ["educator", "professional_teacher", "subject_coordinator", "grade_coordinator", "counselor", "management", "system_admin"].includes(r)
  );

  useEffect(() => {
    if (!isStaff) return;
    const load = async () => {
      const [usersRes, classesRes] = await Promise.all([
        supabase.from("profiles").select("is_approved"),
        supabase.from("classes").select("id", { count: "exact", head: true }),
      ]);
      const users = usersRes.data || [];
      setStats({
        totalUsers: users.length,
        approvedUsers: users.filter((u: any) => u.is_approved).length,
        pendingUsers: users.filter((u: any) => !u.is_approved).length,
        totalClasses: classesRes.count || 0,
      });
    };
    load();
  }, [isStaff]);

  // Redirect students to their dedicated dashboard
  if (isStudent) {
    return <Navigate to="/dashboard/student-home" replace />;
  }

  // Redirect teachers (non-management) to teacher dashboard
  if (isTeacher && !isManagementOrAdmin && !isGradeCoordinator) {
    return <Navigate to="/dashboard/teacher-home" replace />;
  }

  // Redirect grade coordinators to their dashboard
  if (isGradeCoordinator && !isManagementOrAdmin) {
    return <Navigate to="/dashboard/grade-coordinator-home" replace />;
  }

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Welcome */}
      <motion.div variants={item} className="flex items-center gap-4">
        {profile.avatar && <AvatarPreview config={profile.avatar} size={80} />}
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">שלום, {profile.fullName} 👋</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {profile.roles.map((r) => (
              <span key={r} className={`text-xs px-2.5 py-1 rounded-full font-heading border ${ROLE_COLORS[r] || "bg-muted text-muted-foreground"}`}>
                {ROLE_LABELS[r] || r}
              </span>
            ))}
          </div>
          {profile.schoolName && (
            <p className="text-sm text-muted-foreground mt-1 font-body">{profile.schoolName}</p>
          )}
        </div>
      </motion.div>

      {/* Status */}
      {!profile.isApproved && (
        <motion.div variants={item}>
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="py-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="font-heading font-medium text-warning">החשבון שלך ממתין לאישור</p>
                <p className="text-xs text-muted-foreground">תקבל/י גישה מלאה לאחר אישור הגורם המוסמך</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Pending notifications */}
      {profile.pendingApprovalsCount > 0 && (
        <motion.div variants={item}>
          <Card className="border-destructive/30 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
                onClick={() => window.location.href = "/dashboard/approvals"}>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="relative">
                <Users className="h-6 w-6 text-destructive" />
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {profile.pendingApprovalsCount}
                </span>
              </div>
              <div>
                <p className="font-heading font-medium">יש {profile.pendingApprovalsCount} בקשות אישור ממתינות</p>
                <p className="text-xs text-muted-foreground">לחץ כדי לצפות ולאשר</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats Grid - Staff only */}
      {isStaff && (
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Users className="h-8 w-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-heading font-bold">{stats.totalUsers}</p>
              <p className="text-xs text-muted-foreground font-body">משתמשים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-success mb-2" />
              <p className="text-2xl font-heading font-bold">{stats.approvedUsers}</p>
              <p className="text-xs text-muted-foreground font-body">מאושרים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Clock className="h-8 w-8 mx-auto text-warning mb-2" />
              <p className="text-2xl font-heading font-bold">{stats.pendingUsers}</p>
              <p className="text-xs text-muted-foreground font-body">ממתינים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <BookOpen className="h-8 w-8 mx-auto text-secondary mb-2" />
              <p className="text-2xl font-heading font-bold">{stats.totalClasses}</p>
              <p className="text-xs text-muted-foreground font-body">כיתות</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Info */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">מידע כללי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 font-body text-sm">
            <p><span className="text-muted-foreground">אימייל:</span> {profile.email}</p>
            {profile.schoolName && (
              <p><span className="text-muted-foreground">בית ספר:</span> {profile.schoolName}</p>
            )}
            <p>
              <span className="text-muted-foreground">סטטוס:</span>{" "}
              {profile.isApproved ? "✅ מאושר" : "⏳ ממתין לאישור"}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default DashboardHome;
