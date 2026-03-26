import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Users, BookOpen, BarChart3, Bell, Clock, CheckCircle2,
  AlertTriangle, Megaphone, GraduationCap, TrendingDown, TrendingUp,
  ClipboardList, Layers, Brain,
} from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GradeStats {
  totalClasses: number;
  totalStudents: number;
  pendingEvents: number;
  upcomingExams: number;
  activeTutoring: number;
  scheduledMeetings: number;
  announcements: number;
  avgAttendance: number;
}

const GradeCoordinatorDashboard = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<GradeStats>({
    totalClasses: 0, totalStudents: 0, pendingEvents: 0,
    upcomingExams: 0, activeTutoring: 0, scheduledMeetings: 0,
    announcements: 0, avgAttendance: 0,
  });
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  // Get the grade this coordinator manages
  const gradeRole = (profile as any)._roleDetails?.find?.((r: any) => r.role === "grade_coordinator");

  useEffect(() => {
    const load = async () => {
      // Get coordinator's grade from user_roles
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("grade")
        .eq("user_id", profile.id)
        .eq("role", "grade_coordinator")
        .maybeSingle();

      const grade = roleData?.grade;
      if (!grade || !profile.schoolId) return;

      const [classesRes, eventsRes, tutoringRes, meetingsRes, announcementsRes] = await Promise.all([
        supabase.from("classes").select("id").eq("school_id", profile.schoolId).eq("grade", grade),
        supabase.from("grade_events").select("id, status, event_type")
          .eq("school_id", profile.schoolId).eq("grade", grade),
        supabase.from("tutoring_sessions").select("id", { count: "exact", head: true })
          .eq("school_id", profile.schoolId).eq("grade", grade).eq("status", "planned"),
        supabase.from("staff_meetings").select("id", { count: "exact", head: true })
          .eq("school_id", profile.schoolId).eq("grade", grade).eq("status", "scheduled"),
        supabase.from("grade_announcements").select("id", { count: "exact", head: true })
          .eq("school_id", profile.schoolId).eq("grade", grade),
      ]);

      const classIds = (classesRes.data || []).map((c: any) => c.id);
      let studentCount = 0;
      if (classIds.length > 0) {
        const { count } = await supabase.from("profiles")
          .select("id", { count: "exact", head: true })
          .in("class_id", classIds);
        studentCount = count || 0;
      }

      const events = eventsRes.data || [];
      const pendingEvents = events.filter((e: any) => e.status === "proposed").length;
      const upcomingExams = events.filter((e: any) => e.event_type === "exam" && e.status === "approved").length;

      setStats({
        totalClasses: classIds.length,
        totalStudents: studentCount,
        pendingEvents,
        upcomingExams,
        activeTutoring: tutoringRes.count || 0,
        scheduledMeetings: meetingsRes.count || 0,
        announcements: announcementsRes.count || 0,
        avgAttendance: 0,
      });
    };
    load();
  }, [profile.id, profile.schoolId]);

  // AI Insight
  useEffect(() => {
    const fetchInsight = async () => {
      if (!profile.schoolId) return;
      setLoadingInsight(true);
      try {
        const { data } = await supabase.functions.invoke("grade-coordinator-ai", {
          body: {
            action: "daily_insight",
            schoolId: profile.schoolId,
            userId: profile.id,
          },
        });
        setAiInsight(data?.insight || null);
      } catch {
        setAiInsight(null);
      }
      setLoadingInsight(false);
    };
    fetchInsight();
  }, [profile.id, profile.schoolId]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Welcome */}
      <motion.div variants={item} className="flex items-center gap-4">
        {profile.avatar && <AvatarPreview config={profile.avatar} size={72} />}
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">שלום, {profile.fullName} 👋</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="font-heading">רכז/ת שכבה</Badge>
            {profile.schoolName && (
              <span className="text-sm text-muted-foreground font-body">{profile.schoolName}</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* AI Insight Card */}
      <motion.div variants={item}>
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Brain className="h-6 w-6 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-heading font-bold text-sm mb-1">תובנות AI יומיות</p>
              {loadingInsight ? (
                <p className="text-sm text-muted-foreground animate-pulse">מנתח נתוני שכבה...</p>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {aiInsight || "אין מספיק נתונים לניתוח. כאשר יהיו שיעורים, ציונים ונוכחות – תקבל/י תובנות חכמות כאן."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pending approvals */}
      {profile.pendingApprovalsCount > 0 && (
        <motion.div variants={item}>
          <Card className="border-destructive/30 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => navigate("/dashboard/approvals")}>
            <CardContent className="py-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-destructive" />
              <p className="font-heading font-medium">{profile.pendingApprovalsCount} בקשות אישור ממתינות</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: BookOpen, label: "כיתות בשכבה", value: stats.totalClasses, color: "text-primary" },
          { icon: GraduationCap, label: "תלמידים", value: stats.totalStudents, color: "text-info" },
          { icon: Calendar, label: "מבחנים קרובים", value: stats.upcomingExams, color: "text-warning" },
          { icon: AlertTriangle, label: "אירועים ממתינים", value: stats.pendingEvents, color: "text-destructive" },
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: Calendar, label: "לוח מבחנים", path: "/dashboard/master-scheduler", color: "text-primary", desc: "ניהול לו\"ז שכבתי" },
            { icon: BarChart3, label: "דופק שכבתי", path: "/dashboard/grade-progress", color: "text-success", desc: "מעקב התקדמות" },
            { icon: Users, label: "תגבורים", path: "/dashboard/tutoring", color: "text-warning", desc: "ארגון שעות תגבור" },
            { icon: ClipboardList, label: "ישיבות צוות", path: "/dashboard/staff-meetings", color: "text-accent", desc: "סנכרון מחנכים" },
            { icon: Megaphone, label: "הודעות", path: "/dashboard/grade-announcements", color: "text-info", desc: "עדכונים שכבתיים" },
            { icon: Layers, label: "אישורי הורים", path: "/dashboard/event-approvals", color: "text-destructive", desc: "מעקב חתימות" },
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

      {/* Recent Activity */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">סטטיסטיקות נוספות</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-heading font-bold">{stats.activeTutoring}</p>
              <p className="text-xs text-muted-foreground">תגבורים מתוכננים</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-heading font-bold">{stats.scheduledMeetings}</p>
              <p className="text-xs text-muted-foreground">ישיבות מתוכננות</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-heading font-bold">{stats.announcements}</p>
              <p className="text-xs text-muted-foreground">הודעות שפורסמו</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default GradeCoordinatorDashboard;
