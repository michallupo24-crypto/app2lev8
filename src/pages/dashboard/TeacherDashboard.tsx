import { useOutletContext, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, ClipboardList, FileText, BarChart3, Bell, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeacherStats {
  totalStudents: number;
  classCount: number;
  pendingSubmissions: number;
  todayLessons: number;
}

const TeacherDashboard = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<TeacherStats>({ totalStudents: 0, classCount: 0, pendingSubmissions: 0, todayLessons: 0 });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      const [classesRes, submissionsRes] = await Promise.all([
        supabase.from("teacher_classes").select("class_id").eq("user_id", profile.id),
        supabase.from("submissions").select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ]);

      const classIds = (classesRes.data || []).map((c: any) => c.class_id);
      let studentCount = 0;
      if (classIds.length > 0) {
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true })
          .in("class_id", classIds);
        studentCount = count || 0;
      }

      setStats({
        totalStudents: studentCount,
        classCount: classIds.length,
        pendingSubmissions: submissionsRes.count || 0,
        todayLessons: 0,
      });
    };
    load();
  }, [profile.id]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Welcome */}
      <motion.div variants={item} className="flex items-center gap-4">
        {profile.avatar && <AvatarPreview config={profile.avatar} size={72} />}
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">שלום, {profile.fullName} 👋</h1>
          {profile.schoolName && (
            <p className="text-sm text-muted-foreground font-body mt-0.5">{profile.schoolName}</p>
          )}
        </div>
      </motion.div>

      {/* Pending approvals */}
      {profile.pendingApprovalsCount > 0 && (
        <motion.div variants={item}>
          <Card className="border-destructive/30 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => navigate("/dashboard/approvals")}>
            <CardContent className="py-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-heading font-medium">{profile.pendingApprovalsCount} בקשות אישור ממתינות</p>
                <p className="text-xs text-muted-foreground">לחץ לצפייה ואישור</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "תלמידים", value: stats.totalStudents, color: "text-primary" },
          { icon: BookOpen, label: "כיתות", value: stats.classCount, color: "text-info" },
          { icon: FileText, label: "הגשות ממתינות", value: stats.pendingSubmissions, color: "text-warning" },
          { icon: Clock, label: "שיעורים היום", value: stats.todayLessons, color: "text-success" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="py-4 text-center">
              <s.icon className={`h-7 w-7 mx-auto mb-2 ${s.color}`} />
              <p className="text-2xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground font-body">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item}>
        <h2 className="font-heading font-bold text-lg mb-3">פעולות מהירות</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: ClipboardList, label: "הקראת שמות", path: "/dashboard/roll-call", color: "text-primary", desc: "נוכחות והערות" },
            { icon: FileText, label: "משימות", path: "/dashboard/teacher-assignments", color: "text-warning", desc: "יצירה ובדיקה" },
            { icon: BarChart3, label: "ציונים", path: "/dashboard/teacher-grades", color: "text-success", desc: "ניתוח וסטטיסטיקות" },
            { icon: Users, label: "הכיתות שלי", path: "/dashboard/my-classes", color: "text-accent", desc: "תלמידים ונוכחות" },
          ].map((action, i) => (
            <Card key={i} className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
              onClick={() => navigate(action.path)}>
              <CardContent className="py-5 text-center">
                <action.icon className={`h-8 w-8 mx-auto mb-2 ${action.color}`} />
                <p className="text-sm font-heading font-bold">{action.label}</p>
                <p className="text-[10px] text-muted-foreground">{action.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TeacherDashboard;
