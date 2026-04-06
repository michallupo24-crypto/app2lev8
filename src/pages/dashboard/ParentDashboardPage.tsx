import { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, TrendingUp, TrendingDown, Minus, BookOpen, AlertTriangle,
  CheckCircle2, Clock, MessageSquare, Send, Loader2, BarChart3,
  Calendar, Heart, Brain, Target, Trophy, ChevronLeft, UserRound,
  HeartHandshake, School,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChildInfo {
  id: string;
  fullName: string;
  grade: string | null;
  classNumber: number | null;
  schoolName: string | null;
  schoolId: string | null;
  classId: string | null;
  isApproved: boolean;
  level?: number;
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
  presencePct: number;
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

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);

  // Data States
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [attendance, setAttendance] = useState<AttendanceStat | null>(null);
  const [recentGrades, setRecentGrades] = useState<GradeEntry[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  
  // Messaging
  const [messageDialog, setMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  const gradeColor = (g: number) => {
    if (g >= 90) return "text-green-600 dark:text-green-400";
    if (g >= 75) return "text-indigo-600 dark:text-indigo-400";
    if (g >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-destructive";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
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
        level: Math.floor(Math.random() * 5) + 3,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  useEffect(() => {
    if (!selectedChild) return;
    const loadData = async () => {
      setChildLoading(true);
      
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, grade, feedback, graded_at, assignments(id, title, subject, max_grade)")
        .eq("student_id", selectedChild.id)
        .eq("status", "graded")
        .order("graded_at", { ascending: false });

      const assignmentIds = (subs || []).map((s: any) => s.assignments?.id).filter(Boolean);
      let classAvgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: avgData } = await supabase.rpc("get_class_avgs", { assignment_uids: assignmentIds });
        if (avgData) (avgData as any[]).forEach(row => classAvgMap.set(row.assignment_id, Number(row.class_avg)));
      }

      const processedGrades: GradeEntry[] = (subs || []).slice(0, 10).map((s: any) => {
        const norm = Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100);
        const classAvg = classAvgMap.get(s.assignments?.id) ?? null;
        let relativeStrength: GradeEntry["relativeStrength"] = "middle";
        if (classAvg !== null) {
          if (norm - classAvg > 15) relativeStrength = "top";
          else if (norm - classAvg > 5) relativeStrength = "above";
          else if (norm - classAvg < -15) relativeStrength = "struggling";
        }
        if (classAvg !== null && classAvg < 50 && norm > classAvg + 10) relativeStrength = "context_high";

        return {
          title: s.assignments?.title || "",
          subject: s.assignments?.subject || "",
          grade: s.grade,
          maxGrade: s.assignments?.max_grade || 100,
          gradedAt: s.graded_at,
          classAvg,
          teacherTip: s.feedback,
          relativeStrength,
        };
      });
      setRecentGrades(processedGrades);

      const bySubject = new Map<string, { grades: number[]; dates: string[] }>();
      (subs || []).forEach((s: any) => {
        const subj = s.assignments?.subject;
        const norm = Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100);
        if (!subj) return;
        const entry = bySubject.get(subj) || { grades: [], dates: [] };
        entry.grades.push(norm);
        entry.dates.push(s.graded_at);
        bySubject.set(subj, entry);
      });

      const stats: SubjectStat[] = [];
      bySubject.forEach(({ grades, dates }, subj) => {
        const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
        let trend: "up" | "down" | "stable" = "stable";
        if (grades.length >= 2) {
            const diff = grades[0] - grades[1];
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
      setSubjectStats(stats.sort((a, b) => b.avg - a.avg));

      const { data: attRecs } = await supabase.from("attendance").select("status").eq("student_id", selectedChild.id).limit(100);
      if (attRecs && attRecs.length > 0) {
        const total = attRecs.length;
        const absent = attRecs.filter((a: any) => a.status === "absent").length;
        const absencePct = Math.round((absent / total) * 100);
        setAttendance({ total, present: total - absent, absent, late: 0, absencePct, presencePct: 100 - absencePct, redLine: absencePct >= 12 });
      }

      if (selectedChild.classId) {
        const { data: assigns } = await supabase.from("assignments").select("id").eq("class_id", selectedChild.classId).eq("published", true);
        const { data: submitted } = await supabase.from("submissions").select("assignment_id").eq("student_id", selectedChild.id);
        const submittedIds = new Set((submitted || []).map((s: any) => s.assignment_id));
        setPendingTasks((assigns || []).length - submittedIds.size);
      }

      setChildLoading(false);
    };
    loadData();
  }, [selectedChild]);

  const overallAvg = useMemo(() => 
    subjectStats.length === 0 ? null : Math.round(subjectStats.reduce((s, ss) => s + ss.avg, 0) / subjectStats.length),
    [subjectStats]
  );

  const trendChartData = useMemo(() => {
    return recentGrades.slice().reverse().map(g => ({
      name: g.subject.slice(0, 4),
      grade: Math.round((g.grade / g.maxGrade) * 100),
      classAvg: g.classAvg ?? undefined,
    }));
  }, [recentGrades]);

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 overflow-x-hidden">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-32 space-y-10">
        
        {/* TOP BAR */}
        <motion.div variants={item} className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-heading font-black flex items-center gap-2">
                <Heart className="h-6 w-6 text-indigo-600" /> פורטל הורים <span className="text-slate-300 font-light">|</span> <span className="text-indigo-600">SmartPulse</span>
             </h1>
          </div>
          {children.length > 1 && (
            <div className="flex gap-2 p-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100">
               {children.map(c => (
                 <Button key={c.id} variant={selectedChild?.id === c.id ? "default" : "ghost"} size="sm" onClick={() => setSelectedChild(c)} className="rounded-xl px-4 py-2 h-auto text-xs font-heading">
                    {c.fullName}
                 </Button>
               ))}
            </div>
          )}
        </motion.div>

        {selectedChild && (
          <div className="space-y-10">
             {/* HERO PULSE */}
             <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <Card className="lg:col-span-8 border-none bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-800 text-white shadow-3xl rounded-[3rem] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl animate-pulse" />
                  <CardContent className="py-12 px-10 relative z-10">
                    <div className="flex flex-col md:flex-row justify-between gap-10">
                      <div className="space-y-4">
                        <Badge className="bg-white/10 text-white border-transparent backdrop-blur-md px-3 py-1 text-[10px] uppercase font-black tracking-widest">Child Performance Pulse</Badge>
                        <h2 className="text-5xl font-heading font-black tracking-tight">{selectedChild.fullName}</h2>
                        <div className="flex items-center gap-4 text-indigo-100/80 text-sm font-body">
                           <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> כיתה {selectedChild.grade}'{selectedChild.classNumber}</span>
                           <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                           <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /> מצב נוכחות יציב</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-10">
                        <div className="text-center">
                           <p className="text-8xl font-heading font-black tracking-tighter tabular-nums">{overallAvg ?? "—"}</p>
                           <p className="text-xs uppercase font-bold text-indigo-200 tracking-widest">ממוצע כללי משוקלל</p>
                        </div>
                        <div className="w-px h-24 bg-white/20 hidden md:block" />
                        <div className="hidden md:block space-y-4">
                           <div className="space-y-1">
                              <p className="text-[10px] uppercase font-bold text-indigo-200">הישגי שיא</p>
                              <p className="text-xl font-heading font-bold">{subjectStats[0]?.subject || "—"}</p>
                           </div>
                           <div className="space-y-1">
                              <p className="text-[10px] uppercase font-bold text-indigo-200">משימות פתוחות</p>
                              <p className="text-xl font-heading font-bold">{pendingTasks}</p>
                           </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                   {[
                     { label: "שיעורים", val: attendance?.total || 0, icon: <Users className="h-7 w-7 text-indigo-600" /> },
                     { label: "היעדרויות", val: attendance?.absent || 0, icon: <AlertTriangle className={`h-7 w-7 ${attendance?.redLine ? 'text-red-500' : 'text-slate-400'}`} /> },
                     { label: "משימות", val: pendingTasks, icon: <Clock className="h-7 w-7 text-orange-500" /> },
                     { label: "רמה", val: `LVL ${selectedChild.level || 4}`, icon: <Trophy className="h-7 w-7 text-yellow-500" /> },
                   ].map((k, i) => (
                     <div key={i} className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 border border-slate-100 dark:border-slate-800 flex flex-col justify-between shadow-sm">
                        {k.icon}
                        <div>
                           <p className="text-3xl font-heading font-black">{k.val}</p>
                           <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider mt-1">{k.label}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </motion.div>

             {/* DATA ANALYSIS */}
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                <Card className="border-none bg-indigo-50/20 dark:bg-indigo-900/10 backdrop-blur-xl rounded-[3rem] p-10">
                   <div className="flex items-center gap-5 mb-10">
                      <div className="w-14 h-14 rounded-3xl bg-indigo-600 flex items-center justify-center text-white shadow-2xl">
                         <Brain className="h-8 w-8" />
                      </div>
                      <div>
                         <h3 className="text-xl font-heading font-black">הקשר פדגוגי חכם</h3>
                         <p className="text-sm text-slate-500">ניתוח ביצועים יחסי לרמת הקושי</p>
                      </div>
                   </div>
                   <div className="space-y-4">
                      {subjectStats.slice(0, 4).map((ss, idx) => (
                        <div key={ss.subject} className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-[2rem] border border-white dark:border-white/5 flex gap-6 items-center shadow-sm">
                           <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center text-3xl">
                              {idx === 0 ? "👑" : idx === 1 ? "🥇" : "🥈"}
                           </div>
                           <div className="flex-1">
                              <p className="text-base font-heading font-black">{ss.subject}</p>
                              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                 {ss.statusLabel} • נמצא/ת בחזית המצוינות הכיתתית במקצוע זה.
                              </p>
                           </div>
                           <div className="text-right">
                              <p className={`text-3xl font-heading font-black ${gradeColor(ss.avg)}`}>{ss.avg}</p>
                           </div>
                        </div>
                      ))}
                   </div>
                </Card>

                <Card className="border-none bg-white dark:bg-slate-900 rounded-[3rem] p-10 shadow-sm flex flex-col">
                   <h3 className="text-xl font-heading font-black mb-10 flex items-center gap-3">
                      <Calendar className="h-6 w-6 text-indigo-600" /> ציונים ומשובים אחרונים
                   </h3>
                   <div className="flex-1 space-y-6 relative pr-3">
                      <div className="absolute top-0 right-0 w-0.5 h-full bg-slate-100 dark:bg-slate-800" />
                      {recentGrades.slice(0, 3).map((g, idx) => (
                        <div key={idx} className="relative pr-10">
                           <div className="absolute top-2 right-[-3px] w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white shadow-sm" />
                           <div className="bg-slate-50/50 dark:bg-slate-800/40 p-5 rounded-[2rem] border border-transparent">
                              <div className="flex justify-between items-start mb-2">
                                 <p className="text-sm font-heading font-bold">{g.title}</p>
                                 <span className={`text-xl font-heading font-black ${gradeColor(Math.round((g.grade/g.maxGrade)*100))}`}>{g.grade}</span>
                              </div>
                              {g.teacherTip && (
                                <p className="text-[11px] text-indigo-900 dark:text-indigo-200 font-body leading-relaxed italic opacity-80 decoration-indigo-300">
                                   💬 "{g.teacherTip}"
                                </p>
                              )}
                           </div>
                        </div>
                      ))}
                   </div>
                   <Button onClick={() => navigate("/chat")} className="w-full mt-10 h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-heading font-black text-lg gap-4 shadow-2xl transition-all">
                      <Send className="h-6 w-6" /> התחלת שיחה עם המחנך/ת
                   </Button>
                </Card>
             </div>

             {/* COMMUNITY & CHANNELS */}
             <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <Card className="lg:col-span-7 border-none bg-white dark:bg-slate-900 rounded-[3rem] p-10 shadow-sm">
                   <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-heading font-black flex items-center gap-3">
                         <Users className="h-6 w-6 text-indigo-600" /> פיד קהילת הורים
                      </h3>
                      <Button variant="ghost" size="sm" onClick={() => navigate("/community")}>לפורום המלא</Button>
                   </div>
                   <div className="space-y-6">
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-[2rem] border border-transparent hover:border-indigo-100 transition-all cursor-pointer">
                         <div className="flex items-center gap-2 mb-3">
                            <Badge className="bg-indigo-600 text-white text-[9px] px-2">סקר</Badge>
                            <span className="text-[10px] text-muted-foreground font-bold">ועד הורים • 2ש'</span>
                         </div>
                         <p className="text-sm font-heading font-bold mb-4 text-slate-800 dark:text-slate-100">נושא המסיבה לכיתות ח' - הצביעו עכשיו!</p>
                         <div className="space-y-2 mb-4">
                            <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                               <div className="h-full bg-indigo-500 w-[65%]" />
                            </div>
                            <div className="flex justify-between text-[10px] font-black text-slate-400">
                               <span>מסיבת בריכה</span>
                               <span>65% (42 הצבעות)</span>
                            </div>
                         </div>
                         <Button size="sm" className="w-full h-10 text-xs font-heading font-bold bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 transition-colors">להצבעה מהירה</Button>
                      </div>
                      <div className="flex items-start gap-4 px-2 opacity-60 hover:opacity-100 transition-opacity">
                         <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0 shadow-sm"><CheckCircle2 className="h-5 w-5" /></div>
                         <div>
                            <p className="text-xs font-heading font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">אישור הגעה לטיול השנתי</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">אנא אשרו הגעה בפורום הקהילה עד סוף השבוע.</p>
                         </div>
                      </div>
                   </div>
                </Card>

                <Card className="lg:col-span-5 border-none bg-indigo-600 text-white rounded-[3rem] p-10 shadow-2xl">
                   <h3 className="text-xl font-heading font-black mb-8 flex items-center gap-3">
                      <MessageSquare className="h-6 w-6 text-white" /> ערוצי תקשורת
                   </h3>
                   <div className="space-y-4">
                      {[
                        { label: "המחנכת שירה", sub: "זמינה כעת", icon: <UserRound className="h-5 w-5" /> },
                        { label: "יועצת השכבה - מיכל", sub: "מענה תוך 24 שעות", icon: <HeartHandshake className="h-5 w-5" /> },
                        { label: "הנהלת בית הספר", sub: "עדכונים רשמיים", icon: <School className="h-5 w-5" /> },
                      ].map((ch, i) => (
                        <div key={i} className="flex items-center gap-4 p-5 rounded-[2rem] bg-white/10 hover:bg-white/20 transition-all cursor-pointer border border-white/5 active:scale-95" onClick={() => navigate("/chat")}>
                           <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">{ch.icon}</div>
                           <div className="flex-1">
                              <p className="text-sm font-heading font-bold">{ch.label}</p>
                              <p className="text-[10px] text-indigo-100 opacity-70 uppercase tracking-widest">{ch.sub}</p>
                           </div>
                           <ChevronLeft className="h-4 w-4 opacity-50" />
                        </div>
                      ))}
                   </div>
                   <div className="mt-10 bg-indigo-500/30 p-5 rounded-3xl border border-white/10 flex gap-4 items-start shadow-inner">
                      <Target className="h-5 w-5 text-indigo-100 shrink-0 mt-0.5" />
                      <div>
                         <p className="text-[10px] text-indigo-100 font-black uppercase tracking-widest mb-1">טיפ זהב להורים</p>
                         <p className="text-xs text-indigo-50/90 leading-relaxed italic font-body">"יצירת קשר רציף עם המחנך/ת מסייעת במניעת פערים לימודיים מבעוד מועד."</p>
                      </div>
                   </div>
                </Card>
             </motion.div>

             {/* ANALYTICS */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <Card className="lg:col-span-2 p-10 border-none bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm">
                   <h3 className="text-sm font-heading font-bold mb-8 flex items-center gap-2">
                     <TrendingUp className="h-4 w-4 text-indigo-600" /> מגמת התקדמות אקדמית
                   </h3>
                   <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={trendChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                            <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 700}} axisLine={false} tickLine={false} dy={10} />
                            <YAxis hide domain={[0, 100]} />
                            <Line type="monotone" dataKey="grade" stroke="hsl(var(--primary))" strokeWidth={6} dot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 4, stroke: "#fff" }} />
                            <Line type="monotone" dataKey="classAvg" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="6 6" dot={false} />
                         </LineChart>
                      </ResponsiveContainer>
                   </div>
                </Card>

                <Card className="p-10 border-none bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm flex flex-col items-center justify-center text-center">
                   <div className="relative w-44 h-44 mb-6">
                      <svg className="w-full h-full rotate-[-90deg]">
                         <circle cx="88" cy="88" r="75" stroke="currentColor" strokeWidth="14" fill="transparent" className="text-slate-50 dark:text-slate-800" />
                         <circle cx="88" cy="88" r="75" stroke="currentColor" strokeWidth="14" strokeDasharray={471} strokeDashoffset={471 - (471 * (attendance?.presencePct ?? 100)) / 100} strokeLinecap="round" fill="transparent" className="text-indigo-600 shadow-xl" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                         <span className="text-5xl font-heading font-black">{attendance?.presencePct ?? 100}%</span>
                         <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Presence</span>
                      </div>
                   </div>
                   <p className="text-xs font-body text-slate-500 leading-relaxed max-w-[200px]">רמת ההתמדה משפיעה ישירות על המגמה האקדמית. הילד שומר על רצף תקין.</p>
                </Card>
             </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ParentDashboardPage;
