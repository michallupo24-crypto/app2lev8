import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
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

interface ChildInfo {
  id: string;
  fullName: string;
  grade: string | null;
  classNumber: number | null;
  schoolName: string | null;
  isApproved: boolean;
}

interface SubjectStat {
  subject: string;
  avg: number;
  count: number;
  classAvg: number | null;
  trend: "up" | "down" | "stable";
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
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  type: "exam" | "event" | "holiday";
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [attendance, setAttendance] = useState<AttendanceStat | null>(null);
  const [recentGrades, setRecentGrades] = useState<GradeEntry[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [childLoading, setChildLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<{ content: string; loading: boolean }>({ content: "", loading: false });

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
        isApproved: p.is_approved,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  // Load child data when selected
  useEffect(() => {
    if (!selectedChild) return;
    const load = async () => {
      setChildLoading(true);

      // 1. Grades & Class Averages via RPC
      const { data: subs } = await supabase
        .from("submissions")
        .select("assignment_id, grade, graded_at, assignments(id, title, subject, max_grade, class_id)")
        .eq("student_id", selectedChild.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .order("graded_at", { ascending: false })
        .limit(20);

      const assignmentIds = (subs || []).map((s: any) => s.assignments?.id).filter(Boolean);
      let classAvgMap = new Map<string, number>();

      if (assignmentIds.length > 0) {
        try {
          const { data: avgs } = await supabase.rpc('get_assignment_averages', {
            target_assignment_ids: assignmentIds
          });
          (avgs || []).forEach((a: any) => {
            classAvgMap.set(a.assignment_id, Math.round(a.average_grade));
          });
        } catch (e) {
          console.error("RPC Error:", e);
        }
      }

      const recent: GradeEntry[] = (subs || []).slice(0, 10).map((s: any) => ({
        title: s.assignments?.title || "",
        subject: s.assignments?.subject || "",
        grade: s.grade,
        maxGrade: s.assignments?.max_grade || 100,
        gradedAt: s.graded_at,
        classAvg: classAvgMap.get(s.assignments?.id) ?? null,
      }));
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
        stats.push({ subject: subj, avg, count: grades.length, classAvg: null, trend });
      });
      setSubjectStats(stats.sort((a, b) => b.avg - a.avg));

      // 3. Attendance
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id")
        .eq("class_id", selectedChild.id) // Note: need class_id from child, not id
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

      // 6. Generate AI Insight
      if (stats.length > 0) {
        setAiInsight(prev => ({ ...prev, loading: true }));
        try {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
          const context = {
            studentName: selectedChild.fullName,
            subjects: stats.map(s => ({ name: s.subject, avg: s.avg, trend: s.trend })),
            recentGrades: recent.map(r => ({ title: r.title, grade: r.grade, subject: r.subject })),
            attendance: attendance ? { pct: attendance.absencePct } : null
          };

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `אתה יועץ פדגוגי מקצועי. נתח את הנתונים של התלמיד ${selectedChild.fullName} עבור ההורה שלו.
                  הנה הנתונים: ${JSON.stringify(context)}.
                  כתוב תמצית קצרה ומעודדת (עד 3 פסקאות קטנות) הכוללת:
                  1. נקודת חוזק מרכזית.
                  2. מקום אחד שבו כדאי לתת תשומת לב או חיזוק.
                  3. המלצה פרקטית להמשך.
                  דבר ישירות להורה, בעברית רהוטה וחמה.`
                }]
              }]
            })
          });

          const aiData = await response.json();
          const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "לא ניתן היה לייצר תובנה כרגע.";
          setAiInsight({ content: text, loading: false });
        } catch (err) {
          console.error("AI Insight Error:", err);
          setAiInsight({ content: "שגיאה בחיבור לבינה המלאכותית.", loading: false });
        }
      }
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
                  <Button variant="outline" size="sm" className="gap-2 font-heading"
                    onClick={() => { setMessageDialog(true); setMessageText(""); }}>
                    <MessageSquare className="h-4 w-4" />שלח הודעה למחנך
                  </Button>
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

                {/* AI Snapshot - Premium Version */}
                <motion.div variants={item}>
                  <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Brain className="h-20 w-20 text-indigo-600" />
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-heading flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                        <Brain className="h-5 w-5 animate-pulse" />
                        ניתוח פדגוגי חכם (Beta AI)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 relative z-10">
                      {aiInsight.loading ? (
                        <div className="flex flex-col items-center py-6 gap-3 text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <p className="text-xs font-body animate-pulse">Gemini מנתח את נתוני הלמידה של {selectedChild.fullName}...</p>
                        </div>
                      ) : (
                        <div className="text-sm font-body text-slate-700 dark:text-slate-300 leading-relaxed space-y-3 whitespace-pre-wrap">
                          {aiInsight.content || "בחר בילד כדי להתחיל בניתוח הנתונים."}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Subject averages - Premium Cards */}
                {subjectStats.length > 0 && (
                  <motion.div variants={item} className="space-y-3">
                    <h3 className="text-sm font-heading font-medium flex items-center gap-2 text-muted-foreground mr-1">
                      <Target className="h-4 w-4" /> ממוצעים מצטברים
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {subjectStats.map((ss, idx) => (
                        <motion.div 
                          key={ss.subject}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <Card className="group hover:border-primary/40 transition-all duration-300 overflow-hidden relative">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <p className="font-heading font-bold text-sm">{ss.subject}</p>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
                                      {ss.count} מטלות
                                    </Badge>
                                    {ss.trend === "up" && <span className="text-[10px] text-green-500 flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" /> במגמת שיפור</span>}
                                  </div>
                                </div>
                                <div className="text-left">
                                  <span className={`text-2xl font-heading font-black tracking-tighter ${gradeColor(ss.avg)}`}>
                                    {ss.avg}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3 w-full bg-muted h-1 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${ss.avg}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className={`h-full ${ss.avg >= 90 ? 'bg-green-500' : ss.avg >= 75 ? 'bg-primary' : 'bg-orange-400'}`}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
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

                    {/* Grades list - Premium style */}
                    <div className="space-y-3">
                      {recentGrades.map((g, i) => {
                        const norm = Math.round((g.grade / g.maxGrade) * 100);
                        const vs = g.classAvg !== null ? norm - g.classAvg : null;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                          >
                            <Card className="hover:shadow-md transition-all duration-300 border-r-4 border-r-primary overflow-hidden">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <BookOpen className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="truncate">
                                      <p className="font-heading font-bold text-sm truncate">{g.title}</p>
                                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                        <span className="font-medium">{g.subject}</span>
                                        <span>•</span>
                                        <span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-left shrink-0 bg-muted/30 p-2 rounded-xl min-w-[70px]">
                                    <div className="flex items-baseline justify-end gap-0.5">
                                      <span className={`font-heading font-black text-2xl tracking-tighter ${gradeColor(norm)}`}>
                                        {g.grade}
                                      </span>
                                      {g.maxGrade !== 100 && <span className="text-[10px] text-muted-foreground">/{g.maxGrade}</span>}
                                    </div>
                                    {vs !== null && (
                                      <div className={`text-[9px] font-bold flex items-center justify-end gap-1 ${vs > 0 ? "text-green-500" : vs < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                        {vs > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : vs < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                                        {vs > 0 ? `+${vs}` : vs} מממוצע
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ─── ATTENDANCE - Premium UI ─── */}
              <TabsContent value="attendance" className="space-y-4 mt-4">
                {!attendance ? (
                  <Card className="border-dashed border-2"><CardContent className="py-12 text-center text-muted-foreground font-body">אין נתוני נוכחות עדיין</CardContent></Card>
                ) : (
                  <>
                    <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "שיעורים", val: attendance.total, icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
                        { label: "נכח/ה", val: attendance.present, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
                        { label: "חיסורים", val: attendance.absent, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
                        { label: "איחורים", val: attendance.late, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-600/10" },
                      ].map(s => (
                        <Card key={s.label} className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                          <CardContent className="py-4 text-center space-y-2">
                            <div className={`mx-auto w-8 h-8 rounded-full ${s.bg} flex items-center justify-center`}>
                              <s.icon className={`h-4 w-4 ${s.color}`} />
                            </div>
                            <div>
                              <p className={`text-2xl font-heading font-black tracking-tighter ${s.color}`}>{s.val}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </motion.div>

                    <motion.div variants={item}>
                      <Card className={`border-none shadow-lg relative overflow-hidden ${attendance.redLine ? 'bg-destructive/5' : 'bg-green-500/5'}`}>
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="space-y-1">
                              <h4 className="font-heading font-bold text-sm">סטטוס התמדה</h4>
                              <p className="text-xs text-muted-foreground">אחוז נוכחות בפועל אל מול דרישות המשרד</p>
                            </div>
                            <div className="text-left">
                              <span className={`font-heading font-black text-3xl tracking-tighter ${attendance.redLine ? "text-destructive" : "text-green-600"}`}>
                                {100 - attendance.absencePct}%
                              </span>
                              <p className="text-[10px] text-muted-foreground font-bold leading-none">נוכחות כללית</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold mb-1 px-1">
                              <span className="text-green-600">מצוין</span>
                              <span className="text-yellow-600">גבול האזהרה</span>
                              <span className="text-destructive">חריגה</span>
                            </div>
                            <Progress
                              value={100 - attendance.absencePct}
                              className={`h-3 rounded-full ${attendance.absencePct >= 15 ? "[&>div]:bg-destructive" : attendance.absencePct >= 12 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                            />
                          </div>

                          {attendance.redLine && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-6 flex items-start gap-4 p-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-destructive/20 shadow-inner"
                            >
                              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-6 w-6 text-destructive" />
                              </div>
                              <div className="space-y-1">
                                <h5 className="text-sm font-heading font-bold text-destructive">התראת היעדרות קריטית ⚠️</h5>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-body">
                                  שימו לב: אחוז החיסורים הגיע ל-{attendance.absencePct}%. על פי נהלי משרד החינוך, חריגה מעבר ל-15% עלולה למנוע קבלת ציון שנתי או הגשה לבגרות. מומלץ לתאם שיחה עם מחנך הכיתה בהקדם.
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
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
