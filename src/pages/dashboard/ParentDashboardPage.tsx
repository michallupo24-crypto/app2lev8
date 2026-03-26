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

      // 1. Grades
      const { data: subs } = await supabase
        .from("submissions")
        .select("grade, graded_at, assignments(title, subject, max_grade, class_id)")
        .eq("student_id", selectedChild.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .order("graded_at", { ascending: false })
        .limit(20);

      // 2. Class averages per assignment
      const assignmentIds = (subs || []).map((s: any) => s.assignments?.id).filter(Boolean);
      let classAvgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: allSubs } = await supabase
          .from("submissions")
          .select("assignment_id, grade, assignments(max_grade)")
          .in("assignment_id", assignmentIds)
          .eq("status", "graded")
          .not("grade", "is", null);
        const grouped = new Map<string, number[]>();
        (allSubs || []).forEach((s: any) => {
          const maxG = s.assignments?.max_grade || 100;
          const norm = (s.grade / maxG) * 100;
          const list = grouped.get(s.assignment_id) || [];
          list.push(norm);
          grouped.set(s.assignment_id, list);
        });
        grouped.forEach((gs, aId) => {
          classAvgMap.set(aId, Math.round(gs.reduce((a, b) => a + b, 0) / gs.length));
        });
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

                {/* AI Snapshot */}
                {subjectStats.length > 0 && (
                  <motion.div variants={item}>
                    <Card className="border-purple-500/30 bg-purple-50/50 dark:bg-purple-900/10">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-heading flex items-center gap-2 text-purple-700 dark:text-purple-300">
                          <Brain className="h-4 w-4" />תמצית AI
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 text-sm font-body text-muted-foreground space-y-1">
                        {subjectStats[0] && (
                          <p>💪 <b className="font-heading">{subjectStats[0].subject}</b> — המקצוע החזק ביותר עם ממוצע {subjectStats[0].avg}</p>
                        )}
                        {subjectStats[subjectStats.length - 1] && subjectStats.length > 1 && subjectStats[subjectStats.length - 1].avg < 70 && (
                          <p>📈 <b className="font-heading">{subjectStats[subjectStats.length - 1].subject}</b> — ממוצע {subjectStats[subjectStats.length - 1].avg}, מומלץ לשים לב</p>
                        )}
                        {subjectStats.filter(s => s.trend === "up").length > 0 && (
                          <p>✨ מגמת שיפור ב: {subjectStats.filter(s => s.trend === "up").map(s => s.subject).join(", ")}</p>
                        )}
                        {attendance?.redLine && (
                          <p className="text-destructive">⚠️ אחוז החיסורים ({attendance.absencePct}%) מתקרב לגבול שעלול לפגוע בציון</p>
                        )}
                        {pendingTasks > 0 && (
                          <p>⏰ {pendingTasks} מטלות עדיין לא הוגשו</p>
                        )}
                      </CardContent>
                    </Card>
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
                          <div key={ss.subject} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
                            <div className="flex items-center gap-3">
                              {ss.trend === "up" && <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />}
                              {ss.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive shrink-0" />}
                              {ss.trend === "stable" && <Minus className="h-4 w-4 text-muted-foreground shrink-0" />}
                              <div>
                                <p className="font-heading text-sm font-medium">{ss.subject}</p>
                                <p className="text-[10px] text-muted-foreground">{ss.count} ציונים</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-24 hidden sm:block">
                                <Progress value={ss.avg} className="h-1.5" />
                              </div>
                              <span className={`font-heading font-bold text-lg ${gradeColor(ss.avg)}`}>{ss.avg}</span>
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

                    {/* Grades list */}
                    <div className="space-y-2">
                      {recentGrades.map((g, i) => {
                        const norm = Math.round((g.grade / g.maxGrade) * 100);
                        const vs = g.classAvg !== null ? norm - g.classAvg : null;
                        return (
                          <Card key={i} className="hover:shadow-sm transition-all">
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-heading font-medium text-sm truncate">{g.title}</p>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                    <span>{g.subject}</span>
                                    {g.gradedAt && <><span>•</span><span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span></>}
                                  </div>
                                </div>
                                <div className="text-left shrink-0">
                                  <span className={`font-heading font-bold text-xl ${gradeColor(norm)}`}>{g.grade}</span>
                                  {g.maxGrade !== 100 && <span className="text-xs text-muted-foreground">/{g.maxGrade}</span>}
                                  {vs !== null && (
                                    <p className={`text-[10px] ${vs > 0 ? "text-green-500" : vs < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                      {vs > 0 ? `+${vs}` : vs} מממוצע
                                    </p>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
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
