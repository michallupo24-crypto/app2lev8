import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart3, Users, BookOpen, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Loader2, Send, Radio,
  Shield, FileText, Building2, Brain, UserCheck, Crown,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface SchoolStat {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  avgGrade: number | null;
  presentToday: number | null;
  absentToday: number | null;
  pendingApprovals: number;
}

interface GradeAvg {
  grade: string;
  avg: number;
  classCount: number;
}

interface ComplianceItem {
  teacherId: string;
  teacherName: string;
  violation: string;
  type: "late_material" | "late_grade" | "overload";
  detail: string;
}

interface TeacherLoad {
  id: string;
  name: string;
  classCount: number;
  assignmentCount: number;
  avgGradeDelay: number;
  burnoutRisk: "low" | "medium" | "high";
}

const PrincipalDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SchoolStat | null>(null);
  const [gradeAvgs, setGradeAvgs] = useState<GradeAvg[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [teacherLoads, setTeacherLoads] = useState<TeacherLoad[]>([]);

  // Broadcast dialog
  const [broadcastDialog, setBroadcastDialog] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (!profile.schoolId) { setLoading(false); return; }

      // 1. Basic school stats
      const [studRes, teachRes, classRes, approvalRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", profile.schoolId).eq("is_approved", true),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).in("role", ["professional_teacher", "educator", "subject_coordinator"]),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", profile.schoolId),
        supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      // 2. Grade averages by school grade (ז'–י"ב)
      const { data: classes } = await supabase
        .from("classes")
        .select("id, grade, class_number")
        .eq("school_id", profile.schoolId);

      const classIds = (classes || []).map((c: any) => c.id);

      const { data: submissions } = classIds.length > 0
        ? await supabase.from("submissions")
          .select("grade, assignments(class_id, max_grade)")
          .eq("status", "graded").not("grade", "is", null)
          .limit(500)
        : { data: [] };

      // Group by grade
      const gradeMap = new Map<string, number[]>();
      (submissions || []).forEach((s: any) => {
        const classId = s.assignments?.class_id;
        const cls = (classes || []).find((c: any) => c.id === classId);
        if (!cls) return;
        const maxG = s.assignments?.max_grade || 100;
        const norm = Math.round((s.grade / maxG) * 100);
        const list = gradeMap.get(cls.grade) || [];
        list.push(norm);
        gradeMap.set(cls.grade, list);
      });

      const gradeOrder = ["ז'", "ח'", "ט'", "י'", "י\"א", "י\"ב"];
      const avgs: GradeAvg[] = [];
      gradeMap.forEach((gs, grade) => {
        const clsCount = (classes || []).filter((c: any) => c.grade === grade).length;
        avgs.push({ grade, avg: Math.round(gs.reduce((a, b) => a + b, 0) / gs.length), classCount: clsCount });
      });
      avgs.sort((a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade));

      const overallAvg = avgs.length > 0 ? Math.round(avgs.reduce((s, g) => s + g.avg, 0) / avgs.length) : null;

      // Fetch attendance for today
      const today = new Date().toISOString().split("T")[0];
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("status, student_id")
        .gte("created_at", today);

      const uniqueStudents = new Map<string, string>();
      (attendanceData || []).forEach((a: any) => {
        // If they have any "absent", consider them absent (worst case), otherwise present/late is present.
        const existing = uniqueStudents.get(a.student_id);
        if (existing !== "absent") {
          uniqueStudents.set(a.student_id, a.status);
        }
      });

      let presentCount = 0;
      let absentCount = 0;
      uniqueStudents.forEach(status => {
        if (status === "present" || status === "late") presentCount++;
        if (status === "absent") absentCount++;
      });

      setStats({
        totalStudents: studRes.count || 0,
        totalTeachers: teachRes.count || 0,
        totalClasses: classRes.count || 0,
        avgGrade: overallAvg,
        presentToday: presentCount,
        absentToday: absentCount,
        pendingApprovals: approvalRes.count || 0,
      });
      setGradeAvgs(avgs);

      // 3. Compliance check — late materials & late grades
      const violations: ComplianceItem[] = [];
      if (classIds.length > 0) {
        const { data: assigns } = await supabase
          .from("assignments")
          .select("id, title, teacher_id, due_date, created_at, profiles!assignments_teacher_id_fkey(full_name)")
          .in("class_id", classIds)
          .eq("published", true)
          .limit(100);

        for (const a of (assigns || [])) {
          if (a.due_date && a.created_at) {
            const daysNotice = Math.floor(
              (new Date(a.due_date).getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysNotice < 7 && daysNotice >= 0) {
              violations.push({
                teacherId: a.teacher_id,
                teacherName: (a.profiles as any)?.full_name || "מורה לא ידוע",
                violation: "חומר מבחן מאוחר",
                type: "late_material",
                detail: `"${a.title}" הועלה ${daysNotice} ימים לפני המועד`,
              });
            }
          }
        }

        // Late grades
        const { data: pendingSubs } = await supabase
          .from("submissions")
          .select("submitted_at, assignment_id, assignments(title, teacher_id, profiles!assignments_teacher_id_fkey(full_name))")
          .in("status", ["submitted"])
          .not("submitted_at", "is", null)
          .limit(100);

        for (const s of (pendingSubs || [])) {
          if (s.submitted_at) {
            const days = Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / (1000 * 60 * 60 * 24));
            if (days > 14) {
              violations.push({
                teacherId: (s.assignments as any)?.teacher_id || "",
                teacherName: (s.assignments as any)?.profiles?.full_name || "מורה לא ידוע",
                violation: "ציון מאוחר",
                type: "late_grade",
                detail: `"${(s.assignments as any)?.title}" — לא הוחזר ציון כבר ${days} ימים`,
              });
            }
          }
        }
      }

      // Deduplicate — max 1 per teacher per type
      const seen = new Set<string>();
      const unique = violations.filter(v => {
        const key = `${v.teacherId}-${v.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCompliance(unique.slice(0, 8));

      // 4. Teacher Wellness — load count proxy
      const { data: tcLinks } = await supabase
        .from("teacher_classes")
        .select("user_id, profiles(full_name)")
        .limit(50);

      if (tcLinks) {
        const countByTeacher = new Map<string, { name: string; count: number }>();
        tcLinks.forEach((tc: any) => {
          const entry = countByTeacher.get(tc.user_id) || { name: tc.profiles?.full_name || "", count: 0 };
          entry.count++;
          countByTeacher.set(tc.user_id, entry);
        });

        const loads: TeacherLoad[] = [];
        countByTeacher.forEach(({ name, count }, id) => {
          const risk: TeacherLoad["burnoutRisk"] = count >= 8 ? "high" : count >= 5 ? "medium" : "low";
          loads.push({ id, name, classCount: count, assignmentCount: 0, avgGradeDelay: 0, burnoutRisk: risk });
        });
        setTeacherLoads(loads.sort((a, b) => b.classCount - a.classCount).slice(0, 6));
      }

      setLoading(false);
    };
    load();
  }, [profile.schoolId]);

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    try {
      // Store as school-wide announcement via grade_announcements (reuse table)
      await supabase.from("grade_announcements").insert({
        school_id: profile.schoolId,
        author_id: profile.id,
        title: "הודעת הנהלה",
        content: broadcastMsg,
        status: "published",
        published_at: new Date().toISOString(),
        target_audience: "all",
      });
      toast({ title: "ההודעה שוגרה לכלל הקהילה! 📢" });
      setBroadcastDialog(false);
      setBroadcastMsg("");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setBroadcasting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const gradeColor = (g: number) =>
    g >= 85 ? "#22c55e" : g >= 70 ? "hsl(var(--primary))" : g >= 55 ? "#eab308" : "hsl(var(--destructive))";

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Crown className="h-7 w-7 text-yellow-500" />דאשבורד מנהלת
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">מבט-על על כלל בית הספר</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs"
            onClick={() => setBroadcastDialog(true)}>
            <Radio className="h-3.5 w-3.5 text-red-500" />שידור חירום
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs"
            onClick={() => navigate("/dashboard/approvals")}>
            <UserCheck className="h-3.5 w-3.5" />
            אישורים
            {stats?.pendingApprovals ? (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">{stats.pendingApprovals}</Badge>
            ) : null}
          </Button>
        </div>
      </motion.div>

      {/* KPI Row */}
      {stats && (
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "תלמידים", val: stats.totalStudents, icon: Users, color: "text-primary" },
            { label: "מורים", val: stats.totalTeachers, icon: BookOpen, color: "text-green-600" },
            { label: "נוכחים היום", val: stats.presentToday || 0, icon: UserCheck, color: "text-blue-600" },
            { label: "חיסורים היום", val: stats.absentToday || 0, icon: AlertTriangle, color: (stats.absentToday || 0) > 0 ? "text-destructive" : "text-muted-foreground" },
            { label: "ממוצע בי\"ס", val: stats.avgGrade ?? "—", icon: BarChart3, color: stats.avgGrade ? (stats.avgGrade >= 75 ? "text-green-600" : "text-yellow-600") : "text-muted-foreground" },
            { label: "ממתינים", val: stats.pendingApprovals, icon: UserCheck, color: stats.pendingApprovals > 0 ? "text-destructive" : "text-muted-foreground" },
          ].map((s, i) => (
            <Card key={i} className={s.label === "ממתינים לאישור" && stats.pendingApprovals > 0 ? "border-destructive/30" : ""}>
              <CardContent className="py-4 text-center">
                <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                <p className={`text-2xl font-heading font-bold ${s.color}`}>{s.val}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Grade averages chart */}
      {gradeAvgs.length > 0 && (
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />ממוצעים לפי שכבה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeAvgs}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${v}`, "ממוצע"]}
                    />
                    <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                      {gradeAvgs.map((g, i) => (
                        <Cell key={i} fill={gradeColor(g.avg)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center mt-2 text-[10px] text-muted-foreground flex-wrap">
                {gradeAvgs.map(g => (
                  <span key={g.grade}>{g.grade}: ממוצע {g.avg} ({g.classCount} כיתות)</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Compliance Guard */}
      <motion.div variants={item}>
        <Card className={compliance.length > 0 ? "border-orange-400/40" : "border-green-500/30"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Shield className={`h-5 w-5 ${compliance.length > 0 ? "text-orange-500" : "text-green-500"}`} />
              Compliance Guard — מגן זכויות כלל-בית-ספרי
              {compliance.length === 0 && <Badge className="text-[10px] bg-green-500">הכל תקין ✓</Badge>}
              {compliance.length > 0 && <Badge variant="destructive" className="text-[10px]">{compliance.length} חריגות</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {compliance.length === 0 ? (
              <p className="text-sm text-muted-foreground font-body text-center py-4">
                כל המורים עומדים בנהלים — אין חריגות כרגע 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {compliance.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-heading font-medium">{c.teacherName}</p>
                      <p className="text-xs text-muted-foreground font-body">{c.detail}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0 border-orange-300 text-orange-600">{c.violation}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Teacher Wellness */}
      {teacherLoads.length > 0 && (
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />Teacher Wellness AI — זיהוי שחיקת מורים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {teacherLoads.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.burnoutRisk === "high" ? "bg-destructive" : t.burnoutRisk === "medium" ? "bg-yellow-500" : "bg-green-500"}`} />
                    <div>
                      <p className="font-heading text-sm font-medium">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.classCount} כיתות</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 hidden sm:block">
                      <Progress value={Math.min((t.classCount / 10) * 100, 100)} className={`h-1.5 ${t.burnoutRisk === "high" ? "[&>div]:bg-destructive" : t.burnoutRisk === "medium" ? "[&>div]:bg-yellow-500" : ""}`} />
                    </div>
                    <Badge variant={t.burnoutRisk === "high" ? "destructive" : "outline"} className="text-[10px]">
                      {t.burnoutRisk === "high" ? "סיכון גבוה" : t.burnoutRisk === "medium" ? "לעקוב" : "תקין"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">פעולות מהירות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "אישורים ממתינים", icon: UserCheck, route: "/dashboard/approvals", color: "text-primary" },
                { label: "עץ ארגוני", icon: Building2, route: "/dashboard/org-tree", color: "text-purple-600" },
                { label: "לוח שנה", icon: BarChart3, route: "/dashboard/schedule", color: "text-green-600" },
                { label: "שיחות", icon: FileText, route: "/dashboard/chat", color: "text-blue-600" },
                { label: "דוחות AI", icon: Brain, route: "/dashboard/grade-progress", color: "text-orange-600" },
                { label: "שידור לכולם", icon: Radio, onClick: () => setBroadcastDialog(true), color: "text-red-500" },
              ].map((a, i) => (
                <button key={i}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/50 transition-all"
                  onClick={() => a.onClick ? a.onClick() : navigate(a.route!)}>
                  <a.icon className={`h-6 w-6 ${a.color}`} />
                  <span className="text-xs font-heading text-center leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Broadcast Dialog */}
      <Dialog open={broadcastDialog} onOpenChange={o => { if (!o) setBroadcastDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Radio className="h-5 w-5 text-red-500 animate-pulse" />
              שידור לכלל הקהילה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-xs text-destructive font-body">
                ⚠️ ההודעה תוצג לכל התלמידים, המורים וההורים. השתמש בכלי זה רק לאירועים חשובים.
              </p>
            </div>
            <Textarea
              placeholder="לדוגמה: בשל מצב חירום בית הספר יסגר היום בשעה 12:00. אנא תאמו איסוף של ילדיכם."
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              className="font-body text-sm resize-none" rows={4}
            />
            <Button className="w-full gap-2 font-heading bg-destructive hover:bg-destructive/90"
              onClick={sendBroadcast} disabled={broadcasting || !broadcastMsg.trim()}>
              {broadcasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {broadcasting ? "שולח..." : "שגר הודעה לכולם"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PrincipalDashboardPage;
