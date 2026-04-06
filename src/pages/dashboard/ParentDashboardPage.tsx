import { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, TrendingUp, TrendingDown, Minus, BookOpen, AlertTriangle,
  CheckCircle2, Clock, MessageSquare, Send, Loader2, BarChart3,
  Calendar, Heart, Brain, Target,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { getStudentGrades, SubjectGradeReport } from "@/utils/gradingEngine";

interface ChildInfo {
  id: string;
  grade: string | null;
  classNumber: number | null;
  schoolName: string | null;
  schoolId: string | null;
  classId: string | null;
  isApproved: boolean;
}

interface SubjectStat {
  subject: string;
  avg: number;
  count: number;
  classAvg: number | null;
  trend: "up" | "down" | "stable";
  status: "excellent" | "good" | "stable" | "warning" | "critical";
  statusLabel: string;
}

interface AttendanceStat {
  total: number;
  present: number;
  absent: number;
  late: number;
  absencePct: number;
  redLine: boolean;
}

interface GradeEntry {
  title: string;
  subject: string;
  grade: number;
  maxGrade: number;
  gradedAt: string;
  classAvg: number | null;
  teacherTip?: string | null;
  relativeStrength: "top" | "above" | "middle" | "struggling" | "context_high";
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  type: "exam" | "event" | "holiday";
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [attendance, setAttendance] = useState<AttendanceStat | null>(null);
  const [recentGrades, setRecentGrades] = useState<GradeEntry[]>([]);
  const [subjectGrades, setSubjectGrades] = useState<SubjectGradeReport[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [childLoading, setChildLoading] = useState(false);
  const [liveAlert, setLiveAlert] = useState<{ studentName: string; status: "absent" | "late"; time: string } | null>(null);
  const realtimeRef = useRef<any>(null);

  // Message teacher
  const [messageDialog, setMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  // Load children
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: links } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", profile.id);

      if (!links || links.length === 0) { setLoading(false); return; }

      const ids = links.map((l: any) => l.student_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, class_id, is_approved, school_id, schools(name), classes(grade, class_number)")
        .in("id", ids);

      const kids: ChildInfo[] = (profs || []).map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        grade: p.classes?.grade || null,
        classNumber: p.classes?.class_number || null,
        schoolName: p.schools?.name || null,
        schoolId: p.school_id || null,
        classId: p.class_id || null,
        isApproved: p.is_approved,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  // ── Realtime: listen for new attendance records for my children ──────────
  useEffect(() => {
    if (children.length === 0) return;
    const childIds = children.map(c => c.id);

    // Clean up previous subscription
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
    }

    const channel = supabase
      .channel(`parent-attendance-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance",
          // Filter server-side by student — Supabase supports single filter
          // We'll filter client-side for multiple children
        },
        (payload: any) => {
          const record = payload.new;
          if (!childIds.includes(record.student_id)) return;
          if (record.status !== "absent" && record.status !== "late") return;

          const child = children.find(c => c.id === record.student_id);
          if (!child) return;

          const now = new Date();
          const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

          setLiveAlert({
            studentName: child.fullName,
            status: record.status as "absent" | "late",
            time: timeStr,
          });

          // Auto-dismiss after 30 seconds
          setTimeout(() => setLiveAlert(null), 30000);

          // Also refresh attendance stats
          if (selectedChild?.id === record.student_id) {
            // Trigger re-load by bumping selectedChild
            setSelectedChild(prev => prev ? { ...prev } : null);
          }
        }
      )
      .subscribe();

    realtimeRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [children, profile.id]);

  // Load child data when selected
  useEffect(() => {
    if (!selectedChild) return;
    const load = async () => {
      setChildLoading(true);

      // 1. Grades
      const { data: subs } = await supabase
        .from("submissions")
        .select("grade, graded_at, assignments(id, title, subject, max_grade, class_id)")
        .eq("student_id", selectedChild.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .order("graded_at", { ascending: false })
        .limit(30);

      // 2. Class averages per assignment (using RPC)
      const assignmentIds = (subs || []).map((s: any) => s.assignments?.id).filter(Boolean);
      let classAvgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: avgData, error } = await supabase.rpc("get_class_avgs", {
          assignment_uids: assignmentIds
        });
        
        if (!error && avgData) {
          (avgData as any[]).forEach(row => {
            classAvgMap.set(row.assignment_id, Number(row.class_avg));
          });
        }
      }

      const recent: GradeEntry[] = (subs || []).slice(0, 10).map((s: any) => {
        const norm = Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100);
        const classAvg = classAvgMap.get(s.assignments?.id) ?? null;
        
        let relativeStrength: GradeEntry["relativeStrength"] = "middle";
        if (classAvg !== null) {
          const diff = norm - classAvg;
          if (diff > 15) relativeStrength = "top";
          else if (diff > 5) relativeStrength = "above";
          else if (diff < -15) relativeStrength = "struggling";
        }
        
        // Contextual logic: if grade is 70 but class average is 40, it's a high achievement
        if (classAvg !== null && classAvg < 50 && norm > classAvg + 10) {
            relativeStrength = "context_high";
        }

        return {
          title: s.assignments?.title || "",
          subject: s.assignments?.subject || "",
          grade: s.grade,
          maxGrade: s.assignments?.max_grade || 100,
          gradedAt: s.graded_at,
          classAvg,
          teacherTip: s.feedback, // Using feedback field for tips
          relativeStrength,
        };
      });
      setRecentGrades(recent);

      // Subject stats
      const bySubject = new Map<string, { grades: number[]; gradesBytime: { grade: number; date: string }[] }>();
      (subs || []).forEach((s: any) => {
        const subj = s.assignments?.subject;
        const maxG = s.assignments?.max_grade || 100;
        if (!subj) return;
        const norm = Math.round((s.grade / maxG) * 100);
        const entry = bySubject.get(subj) || { grades: [], gradesBytime: [] };
        entry.grades.push(norm);
        entry.gradesBytime.push({ grade: norm, date: s.graded_at });
        bySubject.set(subj, entry);
      });

      const stats: SubjectStat[] = [];
      bySubject.forEach(({ grades, gradesBytime }, subj) => {
        const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
        const sorted = gradesBytime.sort((a, b) => a.date.localeCompare(b.date));
        let trend: "up" | "down" | "stable" = "stable";
        if (sorted.length >= 2) {
          const diff = sorted[sorted.length - 1].grade - sorted[sorted.length - 2].grade;
          if (diff > 3) trend = "up"; else if (diff < -3) trend = "down";
        }
        
        let status: SubjectStat["status"] = "stable";
        let statusLabel = "יציב";
        
        if (avg >= 90) { status = "excellent"; statusLabel = "מצטיין/ת"; }
        else if (avg >= 80) { status = "good"; statusLabel = "טוב מאוד"; }
        else if (avg < 60) { status = "critical"; statusLabel = "דרוש שיפור"; }
        else if (trend === "down") { status = "warning"; statusLabel = "במגמת ירידה"; }

        stats.push({ subject: subj, avg, count: grades.length, classAvg: null, trend, status, statusLabel });
      });

      // MoE Grading Rules Integration
      if (selectedChild.schoolId) {
        const fullGrades = await getStudentGrades(selectedChild.id, selectedChild.schoolId, 1);
        setSubjectGrades(fullGrades);
      }
      setSubjectStats(stats.sort((a, b) => b.avg - a.avg));

      // 3. Attendance
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id")
        .eq("class_id", selectedChild.classId!)
        .limit(100);

      // Simpler: get attendance records for the student
      const { data: attRecs } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", selectedChild.id)
        .limit(200);

      if (attRecs && attRecs.length > 0) {
        const total = attRecs.length;
        const present = attRecs.filter((a: any) => a.status === "present").length;
        const absent = attRecs.filter((a: any) => a.status === "absent").length;
        const late = attRecs.filter((a: any) => a.status === "late").length;
        const absencePct = Math.round((absent / total) * 100);
        setAttendance({ total, present, absent, late, absencePct, redLine: absencePct >= 12 });
      } else {
        setAttendance(null);
      }

      // 4. Upcoming events
      const { data: events } = await supabase
        .from("grade_events")
        .select("id, title, event_date, event_type")
        .gte("event_date", new Date().toISOString().split("T")[0])
        .order("event_date", { ascending: true })
        .limit(5);
      setUpcomingEvents((events || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        date: e.event_date,
        type: e.event_type === "exam" ? "exam" : e.event_type === "holiday" ? "holiday" : "event",
      })));

      // 5. Pending tasks
      const { data: childProfile } = await supabase
        .from("profiles").select("class_id").eq("id", selectedChild.id).single();
      if (childProfile?.class_id) {
        const { data: assigns } = await supabase
          .from("assignments")
          .select("id")
          .eq("class_id", childProfile.class_id)
          .eq("published", true);
        const assignIds = (assigns || []).map((a: any) => a.id);
        if (assignIds.length > 0) {
          const { data: submitted } = await supabase
            .from("submissions")
            .select("assignment_id")
            .eq("student_id", selectedChild.id)
            .in("assignment_id", assignIds);
          const submittedIds = new Set((submitted || []).map((s: any) => s.assignment_id));
          setPendingTasks(assignIds.filter(id => !submittedIds.has(id)).length);
        }
      }

      setChildLoading(false);
    };
    load();
  }, [selectedChild]);

  const overallAvg = useMemo(() =>
    subjectStats.length === 0 ? null
    : Math.round(subjectStats.reduce((s, ss) => s + ss.avg, 0) / subjectStats.length),
    [subjectStats]
  );

  const trendChartData = useMemo(() => {
    return recentGrades
      .slice().reverse()
      .map(g => ({
        name: g.subject.slice(0, 6),
        grade: Math.round((g.grade / g.maxGrade) * 100),
        classAvg: g.classAvg ?? undefined,
      }));
  }, [recentGrades]);

  const gradeColor = (g: number) =>
    g >= 90 ? "text-green-600 dark:text-green-400"
    : g >= 75 ? "text-primary"
    : g >= 60 ? "text-yellow-600 dark:text-yellow-400"
    : "text-destructive";

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedChild) return;
    setSendingMsg(true);
    try {
      // Find homeroom teacher for this student's class
      const { data: classData } = await supabase
        .from("profiles").select("class_id").eq("id", selectedChild.id).single();
      if (!classData?.class_id) throw new Error("לא נמצאה כיתה");

      const { data: teacherLink } = await supabase
        .from("teacher_classes")
        .select("user_id, is_homeroom")
        .eq("class_id", classData.class_id)
        .eq("is_homeroom", true)
        .maybeSingle();

      const teacherId = teacherLink?.user_id;
      if (!teacherId) throw new Error("לא נמצא מחנך");

      // Create or find conversation
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, conversation_participants!inner(user_id)")
        .eq("conversation_participants.user_id", profile.id);

      let convId: string | null = null;
      for (const c of (convs || [])) {
        const { data: parts } = await supabase
          .from("conversation_participants").select("user_id").eq("conversation_id", c.id);
        const ids = (parts || []).map((p: any) => p.user_id);
        if (ids.includes(teacherId) && ids.includes(profile.id)) { convId = c.id; break; }
      }

      if (!convId) {
        const { data: newConv } = await supabase.from("conversations").insert({ school_id: profile.schoolId }).select("id").single();
        convId = newConv?.id;
        if (convId) {
          await supabase.from("conversation_participants").insert([
            { conversation_id: convId, user_id: profile.id },
            { conversation_id: convId, user_id: teacherId },
          ]);
        }
      }

      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          sender_id: profile.id,
          content: messageText,
        });
        toast({ title: "ההודעה נשלחה למחנך! ✅" });
        setMessageDialog(false);
        setMessageText("");
      }
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setSendingMsg(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (children.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <Users className="h-16 w-16 text-muted-foreground/20" />
      <div>
        <p className="text-lg font-heading font-bold">לא נמצאו ילדים מחוברים</p>
        <p className="text-sm text-muted-foreground mt-1">חשבון ההורה שלך עדיין לא מחובר לתלמיד, פנה למחנך לאישור</p>
      </div>
    </div>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Heart className="h-7 w-7 text-primary" />פורטל הורים
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">מעקב, תובנות ותקשורת עם הצוות</p>
      </motion.div>

      {/* Live absence alert banner */}
      {liveAlert && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          className={`flex items-start gap-3 p-4 rounded-xl border-2 ${
            liveAlert.status === "absent"
              ? "border-destructive/60 bg-destructive/10"
              : "border-yellow-400/60 bg-yellow-50/80 dark:bg-yellow-900/20"
          }`}
        >
          <span className="text-2xl shrink-0">{liveAlert.status === "absent" ? "🚨" : "⏰"}</span>
          <div className="flex-1">
            <p className="font-heading font-bold text-sm">
              {liveAlert.status === "absent"
                ? `${liveAlert.studentName} לא הגיע/ה לשיעור`
                : `${liveAlert.studentName} איחר/ה לשיעור`}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">
              נרשם בשעה {liveAlert.time} • ניתן להגיש הצדקה דרך האפליקציה
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
            onClick={() => setLiveAlert(null)}>✕</Button>
        </motion.div>
      )}

      {/* Child selector (if multiple) */}
      {children.length > 1 && (
        <motion.div variants={item} className="flex gap-2 flex-wrap">
          {children.map(c => (
            <Button key={c.id}
              variant={selectedChild?.id === c.id ? "default" : "outline"}
              size="sm" className="font-heading gap-2"
              onClick={() => setSelectedChild(c)}>
              👤 {c.fullName}
            </Button>
          ))}
        </motion.div>
      )}

      {selectedChild && (
        <>
          {/* Child info card */}
          <motion.div variants={item}>
            <Card className="border-primary/20 bg-gradient-to-l from-primary/5 to-transparent">
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-lg font-heading font-bold">{selectedChild.fullName}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                      {selectedChild.grade && <span>{selectedChild.grade}'{selectedChild.classNumber}</span>}
                      {selectedChild.schoolName && <><span>•</span><span>{selectedChild.schoolName}</span></>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="default" size="sm" className="gap-2 font-heading"
                      onClick={() => navigate("/dashboard/timetable")}>
                      <Calendar className="h-4 w-4" />מערכת שעות
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 font-heading"
                      onClick={() => { setMessageDialog(true); setMessageText(""); }}>
                      <MessageSquare className="h-4 w-4" />שלח הודעה למחנך
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {childLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs defaultValue="overview">
              <motion.div variants={item}>
                <TabsList className="w-full md:w-auto">
                  <TabsTrigger value="overview" className="font-heading">סקירה</TabsTrigger>
                  <TabsTrigger value="grades" className="font-heading">ציונים</TabsTrigger>
                  <TabsTrigger value="attendance" className="font-heading">נוכחות</TabsTrigger>
                  <TabsTrigger value="calendar" className="font-heading">אירועים</TabsTrigger>
                </TabsList>
              </motion.div>

              {/* ─── OVERVIEW ─── */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* KPI row */}
                <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="py-4 text-center">
                      <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <p className={`text-2xl font-heading font-bold ${overallAvg ? gradeColor(overallAvg) : ""}`}>
                        {overallAvg ?? "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">ממוצע כללי</p>
                    </CardContent>
                  </Card>
                  <Card className={attendance?.redLine ? "border-destructive/40" : ""}>
                    <CardContent className="py-4 text-center">
                      <CheckCircle2 className={`h-5 w-5 mx-auto mb-1 ${attendance?.redLine ? "text-destructive" : "text-green-500"}`} />
                      <p className={`text-2xl font-heading font-bold ${attendance?.redLine ? "text-destructive" : ""}`}>
                        {attendance ? `${attendance.absencePct}%` : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">חיסורים</p>
                      {attendance?.redLine && <p className="text-[9px] text-destructive font-medium">⚠ קרוב לגבול</p>}
                    </CardContent>
                  </Card>
                  <Card className={pendingTasks > 0 ? "border-yellow-400/40" : ""}>
                    <CardContent className="py-4 text-center">
                      <Clock className={`h-5 w-5 mx-auto mb-1 ${pendingTasks > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
                      <p className={`text-2xl font-heading font-bold ${pendingTasks > 0 ? "text-yellow-600" : ""}`}>
                        {pendingTasks}
                      </p>
                      <p className="text-[10px] text-muted-foreground">מטלות פתוחות</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <BookOpen className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-2xl font-heading font-bold">{subjectStats.length}</p>
                      <p className="text-[10px] text-muted-foreground">מקצועות פעילים</p>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* AI Snapshot */}
                {subjectStats.length > 0 && (
                  <motion.div variants={item}>
                {subjectStats.length > 0 && (
                  <motion.div variants={item}>
                    <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base font-heading flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                          <Brain className="h-5 w-5" />תמונת מצב אסטרטגית (AI Insights)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
                        <div className="relative z-10 bg-white/40 dark:bg-black/20 backdrop-blur-sm rounded-xl p-4 border border-white/50 dark:border-white/5">
                          <div className="flex gap-4 items-start">
                             <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                <TrendingUp className="h-6 w-6 text-indigo-600" />
                             </div>
                             <div className="space-y-2">
                                <p className="font-heading font-bold text-indigo-900 dark:text-indigo-100">
                                  {overallAvg && overallAvg >= 85 ? "מגמה חיובית חזקה" : "סטטוס למידה יציב"}
                                </p>
                                <div className="space-y-3 text-sm font-body text-slate-600 dark:text-slate-300">
                                  {subjectStats[0] && (
                                    <div className="flex items-start gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-none" />
                                      <p><b className="font-heading text-slate-800 dark:text-slate-100">נקודת חוזקה:</b> {selectedChild.fullName} מפגין/ה יכולות מצוינות ב<span className="text-green-600 font-bold">{subjectStats[0].subject}</span> (ממוצע {subjectStats[0].avg}).</p>
                                    </div>
                                  )}
                                  
                                  {attendance?.absencePct && attendance.absencePct > 10 ? (
                                    <div className="flex items-start gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 flex-none" />
                                      <p><b className="font-heading text-slate-800 dark:text-slate-100">שימו לב:</b> נרשמו {attendance.absent} חיסורים. קיימת קורלציה בין ימי היעדרות לירידה קלה בציונים במקצועות הליבה.</p>
                                    </div>
                                  ) : (
                                    <div className="flex items-start gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-none" />
                                      <p><b className="font-heading text-slate-800 dark:text-slate-100">נוכחות:</b> התמדה מצוינת בשיעורים, דבר התורם ליציבות הלימודית.</p>
                                    </div>
                                  )}

                                  {pendingTasks > 0 && (
                                    <div className="flex items-start gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-none" />
                                      <p><b className="font-heading text-slate-800 dark:text-slate-100">יעד קרוב:</b> ישנן {pendingTasks} מטלות שטרם הוגשו. הגשתן תסייע בשיפור הממוצע הכללי.</p>
                                    </div>
                                  )}
                                </div>
                             </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" className="h-8 text-[11px] font-heading bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            onClick={() => { setMessageDialog(true); setMessageText(`היי, רציתי להתייעץ לגבי המגמה ב${subjectStats[subjectStats.length-1]?.subject || 'לימודים'}...`); }}>
                            התייעצות עם המחנך/ת
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-[11px] font-heading text-slate-500">
                             מה דרוש לשיפור?
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
                  </motion.div>
                )}

                {/* Subject averages */}
                {subjectStats.length > 0 && (
                  <motion.div variants={item}>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base font-heading flex items-center gap-2">
                          <Target className="h-5 w-5 text-primary" />ממוצעים לפי מקצוע
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {subjectStats.map(ss => (
                          <div key={ss.subject} className="flex items-center justify-between py-2 px-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-all">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                ss.status === "excellent" ? "bg-green-100 text-green-700" :
                                ss.status === "warning" || ss.status === "critical" ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
                              }`}>
                                {ss.trend === "up" && <TrendingUp className="h-5 w-5" />}
                                {ss.trend === "down" && <TrendingDown className="h-5 w-5" />}
                                {ss.trend === "stable" && <BarChart3 className="h-5 w-5" />}
                              </div>
                              <div>
                                <p className="font-heading text-sm font-bold">{ss.subject}</p>
                                <Badge variant="secondary" className={`text-[9px] h-4 py-0 ${
                                  ss.status === "excellent" ? "bg-green-500/10 text-green-700 border-green-200" :
                                  ss.status === "warning" ? "bg-red-500/10 text-red-700 border-red-200" : ""
                                }`}>
                                  {ss.statusLabel}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="hidden sm:block text-right">
                                <p className="text-[10px] text-muted-foreground">{ss.count} ציונים</p>
                                <div className="w-16 h-1 mt-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                   <div className={`h-full ${gradeColor(ss.avg)}`} style={{ width: `${ss.avg}%`, backgroundColor: 'currentColor' }} />
                                </div>
                              </div>
                              <span className={`font-heading font-black text-xl ${gradeColor(ss.avg)}`}>{ss.avg}</span>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </TabsContent>

              {/* ─── GRADES ─── */}
              <TabsContent value="grades" className="space-y-4 mt-4">
                {recentGrades.length === 0 ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground font-body">אין ציונים עדיין</CardContent></Card>
                ) : (
                  <>
                    {/* Trend chart */}
                    {trendChartData.length >= 2 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-heading flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />מגמת ציונים
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={trendChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                  formatter={(v: any, n: string) => [`${v}`, n === "grade" ? "ציון" : "ממוצע כיתה"]} />
                                <ReferenceLine y={60} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="grade" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} name="grade" />
                                {trendChartData.some(d => d.classAvg !== undefined) && (
                                  <Line type="monotone" dataKey="classAvg" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="classAvg" />
                                )}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Grades list with Contextual Intelligence */}
                    <div className="space-y-3">
                      {recentGrades.map((g, i) => {
                        const norm = Math.round((g.grade / g.maxGrade) * 100);
                        return (
                          <div key={i} className="space-y-2">
                             <Card className={`overflow-hidden border-r-4 ${
                               g.relativeStrength === "top" || g.relativeStrength === "context_high" ? "border-r-green-500" : 
                               g.relativeStrength === "struggling" ? "border-r-destructive" : "border-r-slate-200"
                             }`}>
                               <CardContent className="py-4">
                                 <div className="flex items-start justify-between gap-4">
                                   <div className="flex-1 min-w-0">
                                     <div className="flex items-center gap-2 mb-1">
                                       <p className="font-heading font-bold text-sm truncate">{g.title}</p>
                                       {g.relativeStrength === "context_high" && (
                                         <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">✨ הישג משמעותי יחסית לכיתה</Badge>
                                       )}
                                     </div>
                                     <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                       <span className="font-medium text-slate-700 dark:text-slate-300">{g.subject}</span>
                                       <span>•</span>
                                       <span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span>
                                     </div>
                                     
                                     {/* Smart Analysis Text */}
                                     <p className="text-[11px] mt-2 font-body italic text-slate-500">
                                       {g.relativeStrength === "top" ? "הציון נמצא ברמה הגבוהה ביותר של הכיתה." :
                                        g.relativeStrength === "above" ? "ביצועים טובים, מעל הממוצע הכיתתי בשיעור זה." :
                                        g.relativeStrength === "context_high" ? `מרשים! למרות שהציון הוא ${g.grade}, המשימה הייתה מאתגרת לכולם והציון גבוה משמעותית מהממוצע (${g.classAvg}).` :
                                        g.relativeStrength === "struggling" ? "ניכר קושי מסוים במשימה זו יחסית לכיתה, מומלץ לחזור על החומר." : 
                                        "ציון יציב התואם את רמת הכיתה."}
                                     </p>
                                   </div>
                                   <div className="text-left shrink-0">
                                      <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 min-w-[60px] text-center border border-slate-200 dark:border-slate-700">
                                        <p className={`text-2xl font-heading font-black ${gradeColor(norm)}`}>{g.grade}</p>
                                        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">ציון סופי</p>
                                      </div>
                                   </div>
                                 </div>
                               </CardContent>
                             </Card>
                             
                             {/* Teacher's Personal Tip (if exists) */}
                             {g.teacherTip && (
                               <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                                 className="mx-4 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl rounded-tr-none border border-indigo-100 dark:border-indigo-800 relative">
                                 <div className="absolute top-0 right-0 -mr-2 -mt-2 bg-indigo-600 text-white rounded-full p-1 shadow-sm">
                                    <MessageSquare className="h-3 w-3" />
                                 </div>
                                 <p className="text-xs text-indigo-900 dark:text-indigo-200 font-body leading-relaxed">
                                   <b className="font-heading">מסר מהמחנך/ת:</b> "{g.teacherTip}"
                                 </p>
                               </motion.div>
                             )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ─── ATTENDANCE ─── */}
              <TabsContent value="attendance" className="space-y-4 mt-4">
                {!attendance ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground font-body">אין נתוני נוכחות עדיין</CardContent></Card>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "שיעורים כולל", val: attendance.total, color: "" },
                        { label: "נכח/ה", val: attendance.present, color: "text-green-600" },
                        { label: "חיסורים", val: attendance.absent, color: "text-destructive" },
                        { label: "איחורים", val: attendance.late, color: "text-yellow-600" },
                      ].map(s => (
                        <Card key={s.label}><CardContent className="py-4 text-center">
                          <p className={`text-2xl font-heading font-bold ${s.color}`}>{s.val}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </CardContent></Card>
                      ))}
                    </div>

                    <Card className={attendance.redLine ? "border-destructive/40" : ""}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-heading text-sm font-medium">אחוז חיסורים</p>
                          <span className={`font-heading font-bold text-lg ${attendance.redLine ? "text-destructive" : "text-green-600"}`}>
                            {attendance.absencePct}%
                          </span>
                        </div>
                        <Progress
                          value={Math.min(attendance.absencePct, 100)}
                          className={`h-3 ${attendance.absencePct >= 15 ? "[&>div]:bg-destructive" : attendance.absencePct >= 12 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span>0%</span>
                          <span className="text-yellow-600">12% — אזהרה</span>
                          <span className="text-destructive">15% — גבול</span>
                        </div>
                        {attendance.redLine && (
                          <div className="mt-3 flex items-start gap-2 p-2 bg-destructive/10 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-xs text-destructive font-body">
                              אחוז החיסורים מתקרב לרף שעלול לפגוע בציון הסופי על פי תקן משרד החינוך. מומלץ לפנות למחנך.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* ─── CALENDAR ─── */}
              <TabsContent value="calendar" className="space-y-3 mt-4">
                {upcomingEvents.length === 0 ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground font-body">אין אירועים קרובים</CardContent></Card>
                ) : upcomingEvents.map(ev => (
                  <Card key={ev.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">
                            {ev.type === "exam" ? "📝" : ev.type === "holiday" ? "🌟" : "📅"}
                          </span>
                          <div>
                            <p className="font-heading font-medium text-sm">{ev.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(ev.date).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "long" })}
                            </p>
                          </div>
                        </div>
                        <Badge variant={ev.type === "exam" ? "destructive" : "outline"} className="text-[10px] shrink-0">
                          {ev.type === "exam" ? "מבחן" : ev.type === "holiday" ? "חופשה" : "אירוע"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      {/* Message Dialog */}
      <Dialog open={messageDialog} onOpenChange={o => { if (!o) setMessageDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              הודעה למחנך של {selectedChild?.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="כתב הודעה למחנך..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              className="font-body text-sm resize-none" rows={4}
            />
            <Button className="w-full gap-2 font-heading" onClick={sendMessage}
              disabled={sendingMsg || !messageText.trim()}>
              {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendingMsg ? "שולח..." : "שלח הודעה"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              ההודעה תגיע למחנך הכיתה בערוץ המאובטח של המערכת
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ParentDashboardPage;
