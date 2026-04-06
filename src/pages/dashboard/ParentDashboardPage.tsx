import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, TrendingDown, Minus, BookOpen, AlertTriangle,
  CheckCircle2, Clock, MessageSquare, Send, Loader2,
  Calendar, Heart, Brain, Target, Trophy, ChevronLeft, UserRound,
  HeartHandshake, School, Plus,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer,
} from "recharts";

/* ─── Types ───────────────────────────────────────────── */
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

interface GradeEntry {
  id: string;
  title: string;
  subject: string;
  grade: number;
  maxGrade: number;
  gradedAt: string;
  classAvg: number | null;
  teacherTip?: string | null;
  relativeStrength: "top" | "above" | "middle" | "struggling" | "context_high";
}

interface DashboardPost {
  id: string;
  title: string | null;
  content: string;
  author_name: string;
  created_at: string;
  plugin_data?: any;
}

interface DashboardConvo {
  id: string;
  title: string;
  lastMsg?: string;
  unread: number;
  type: string;
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);

  // System Data States
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [attendance, setAttendance] = useState<{ presencePct: number; absent: number; total: number; absencePct: number; redLine: boolean } | null>(null);
  const [recentGrades, setRecentGrades] = useState<GradeEntry[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [communityPosts, setCommunityPosts] = useState<DashboardPost[]>([]);
  const [recentConvos, setRecentConvos] = useState<DashboardConvo[]>([]);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  /* ── Data Loaders ────────────────────────────────────── */
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    // 1. Get real children links
    const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
    if (!links?.length) { setLoading(false); return; }

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
      level: Math.floor(Math.random() * 5) + 3, // Mock field until game engine is ready
    }));
    setChildren(kids);
    if (kids.length > 0) setSelectedChild(kids[0]);
    
    // 2. Load Real Conversations for this Parent
    const { data: myParts } = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", profile.id);
    if (myParts?.length) {
      const cIds = myParts.map(p => p.conversation_id);
      const { data: convos } = await supabase.from("conversations").select("*").in("id", cIds).order("updated_at", { ascending: false }).limit(3);
      if (convos) {
         setRecentConvos(convos.map(c => ({ id: c.id, title: c.title || "שימוש אישי", unread: 0, type: c.type })));
      }
    }

    setLoading(false);
  }, [profile.id]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  const loadChildData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    
    // 1. Academic Load (Submissions + Class Averages)
    const { data: subs } = await supabase
      .from("submissions")
      .select("id, grade, feedback, graded_at, assignments(id, title, subject, max_grade)")
      .eq("student_id", child.id)
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
      let rel: GradeEntry["relativeStrength"] = "middle";
      if (classAvg !== null) {
        if (norm - classAvg > 15) rel = "top";
        else if (norm - classAvg > 5) rel = "above";
        else if (norm - classAvg < -10) rel = "struggling";
      }
      return {
        id: s.id,
        title: s.assignments?.title || "",
        subject: s.assignments?.subject || "",
        grade: s.grade,
        maxGrade: s.assignments?.max_grade || 100,
        gradedAt: s.graded_at,
        classAvg,
        teacherTip: s.feedback,
        relativeStrength: rel,
      };
    });
    setRecentGrades(processedGrades);

    // 2. Subject Stats Engine
    const bySubject = new Map<string, number[]>();
    (subs || []).forEach((s: any) => {
      const subj = s.assignments?.subject;
      if (!subj) return;
      const grades = bySubject.get(subj) || [];
      grades.push(Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100));
      bySubject.set(subj, grades);
    });

    const stats: SubjectStat[] = [];
    bySubject.forEach((grades, subj) => {
      const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
      let status: SubjectStat["status"] = "stable";
      let statusLabel = "מגמה יציבה";
      if (avg >= 92) { status = "excellent"; statusLabel = "מצטיין/ת במקצוע"; }
      else if (avg >= 82) { status = "good"; statusLabel = "הישגים גבוהים"; }
      else if (avg < 60) { status = "critical"; statusLabel = "נדרש מיקוד"; }
      stats.push({ subject: subj, avg, count: grades.length, classAvg: null, trend: "stable", status, statusLabel });
    });
    setSubjectStats(stats.sort((a, b) => b.avg - a.avg));

    // 3. Official Attendance
    const { data: att } = await supabase.from("attendance").select("status").eq("student_id", child.id);
    if (att?.length) {
      const total = att.length;
      const absent = att.filter((a: any) => a.status === "absent").length;
      const pct = Math.round(((total - absent) / total) * 100);
      setAttendance({ presencePct: pct, absent, total, absencePct: 100 - pct, redLine: (100 - pct) >= 12 });
    }

    // 4. Pending Tasks
    if (child.classId) {
      const [{ data: assigns }, { data: submitted }] = await Promise.all([
        supabase.from("assignments").select("id").eq("class_id", child.classId).eq("published", true),
        supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
      ]);
      const submittedIds = new Set((submitted || []).map((s: any) => s.assignment_id));
      setPendingTasks((assigns || []).length - submittedIds.size);
    }

    // 5. Community Feed (Factions the parent is eligible for)
    if (child.schoolId) {
       const { data: parentFacs } = await supabase.from("factions").select("id").eq("school_id", child.schoolId).contains("eligible_roles", ["parent"]);
       if (parentFacs?.length) {
          const fIds = parentFacs.map(f => f.id);
          const { data: topPosts } = await supabase.from("faction_posts").select("*").in("faction_id", fIds).eq("is_removed", false).order("created_at", { ascending: false }).limit(2);
          if (topPosts) {
             setCommunityPosts(topPosts.map(p => ({ id: p.id, title: p.title, content: p.content, author_name: p.is_anonymous ? "אנונימי" : "צוות הקהילה", created_at: p.created_at, plugin_data: p.plugin_data })));
          }
       }
    }

    setChildLoading(false);
  }, []);

  useEffect(() => { if (selectedChild) loadChildData(selectedChild); }, [selectedChild, loadChildData]);

  const overallAvg = useMemo(() => 
    subjectStats.length === 0 ? null : Math.round(subjectStats.reduce((s, ss) => s + ss.avg, 0) / subjectStats.length),
    [subjectStats]
  );

  const chartData = useMemo(() => {
    return recentGrades.slice().reverse().map(g => ({
      name: g.subject.slice(0, 3),
      grade: Math.round((g.grade / g.maxGrade) * 100),
      avg: g.classAvg
    }));
  }, [recentGrades]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="h-10 w-10 animate-spin text-indigo-500" /></div>;

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950 font-body overflow-x-hidden">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10 pb-32">
        
        {/* TITLE & CHILD SELECTOR */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
           <div className="space-y-1">
              <h1 className="text-3xl font-heading font-black tracking-tighter flex items-center gap-3">
                 <Heart className="h-7 w-7 text-indigo-600" /> <span className="text-slate-400">Dash</span><span className="text-indigo-600">Pulse</span>
              </h1>
              <p className="text-xs text-muted-foreground uppercase font-black tracking-widest opacity-60">Parental Strategic Overview</p>
           </div>
           {children.length > 1 && (
             <div className="flex p-1.5 bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-white/5 overflow-x-auto max-w-full">
                {children.map(c => (
                  <Button key={c.id} variant={selectedChild?.id === c.id ? "default" : "ghost"} size="sm" onClick={() => setSelectedChild(c)} className="rounded-xl px-5 h-10 text-xs font-black transition-all">
                     {c.fullName}
                  </Button>
                ))}
             </div>
           )}
        </motion.div>

        {selectedChild && (
           <div className="space-y-10">
              {/* SECTION 1: HERO STATE */}
              <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                 <Card className="lg:col-span-8 border-none bg-indigo-700 dark:bg-indigo-600 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] shadow-3xl shadow-indigo-100 dark:shadow-none rounded-[3rem] overflow-hidden relative group">
                    <CardContent className="p-0 h-full">
                       <div className="p-10 md:p-14 text-white flex flex-col md:flex-row justify-between gap-12 relative z-10">
                          <div className="space-y-6">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/10 text-white border-transparent text-[9px] px-3 font-black uppercase tracking-widest backdrop-blur-xl">Live Metrics</Badge>
                                {childLoading && <Loader2 className="h-3 w-3 animate-spin opacity-50" />}
                             </div>
                             <h2 className="text-4xl md:text-6xl font-heading font-black tracking-tight leading-none">{selectedChild.fullName}</h2>
                             <div className="flex flex-wrap items-center gap-4 text-indigo-100/70 text-xs font-bold">
                                <span className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-full"><School className="h-3.5 w-3.5" /> כיתה {selectedChild.grade}'{selectedChild.classNumber}</span>
                                <span className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-full"><BookOpen className="h-3.5 w-3.5" /> {selectedChild.schoolName}</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-8 md:gap-14">
                             <div className="text-center group-hover:scale-110 transition-transform duration-500">
                                <p className="text-7xl md:text-9xl font-heading font-black tracking-tighter tabular-nums leading-none">{overallAvg ?? "—"}</p>
                                <p className="text-[10px] text-indigo-200 uppercase font-black tracking-widest mt-2">Overall Average</p>
                             </div>
                             <div className="w-px h-24 bg-white/10" />
                             <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-1">
                                   <p className="text-[9px] text-indigo-200 uppercase font-black opacity-60">Absent Record</p>
                                   <p className={`text-2xl font-black ${attendance?.redLine ? 'text-rose-400' : 'text-white'}`}>{attendance?.absent ?? 0} <span className="text-xs opacity-50 font-medium">Days</span></p>
                                </div>
                                <div className="space-y-1">
                                   <p className="text-[9px] text-indigo-200 uppercase font-black opacity-60">Pending Jobs</p>
                                   <p className="text-2xl font-black">{pendingTasks}</p>
                                </div>
                             </div>
                          </div>
                       </div>
                    </CardContent>
                 </Card>

                 <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                    {[
                      { l: "Attendance", v: attendance ? `${attendance.presencePct}%` : "—", i: <Target className="h-6 w-6 text-indigo-600" /> },
                      { l: "Top Subject", v: subjectStats[0]?.subject || "—", i: <Trophy className="h-6 w-6 text-yellow-500" /> },
                      { l: "Recent Pulse", v: recentGrades[0]?.grade ? `${recentGrades[0].grade}/${recentGrades[0].maxGrade}` : "—", i: <ActivityIcon /> },
                      { l: "Growth Level", v: `LVL ${selectedChild.level || 3}`, i: <Brain className="h-6 w-6 text-purple-600" /> }
                    ].map((k, i) => (
                      <Card key={i} className="border-none bg-white dark:bg-slate-900 rounded-[2.5rem] p-7 flex flex-col justify-between shadow-sm cursor-default hover:shadow-md transition-all">
                         <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">{k.i}</div>
                         <div>
                            <p className="text-2xl font-black tracking-tight">{k.v}</p>
                            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-wider mt-1">{k.l}</p>
                         </div>
                      </Card>
                    ))}
                 </div>
              </motion.div>

              {/* SECTION 2: SYSTEM INSIGHTS */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                 {/* Live Community Feed */}
                 <Card className="border-none bg-white dark:bg-slate-900 rounded-[3rem] p-10 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="text-xl font-heading font-black flex items-center gap-3">
                          <Users className="h-6 w-6 text-indigo-600" /> Community Newsfeed
                       </h3>
                       <Button variant="ghost" size="sm" className="text-indigo-600 font-bold" onClick={() => navigate("/community")}>פורום מלא</Button>
                    </div>
                    {communityPosts.length === 0 ? (
                      <div className="py-12 text-center space-y-4 opacity-40">
                         <MessageSquare className="h-10 w-10 mx-auto" />
                         <p className="text-xs font-bold font-heading">אין עדכוני קהילה כרגע</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                         {communityPosts.map(p => (
                            <div key={p.id} className="p-6 rounded-[2rem] bg-slate-50 dark:bg-slate-800/40 border border-transparent hover:border-indigo-100 transition-all">
                               <div className="flex items-center gap-2 mb-3">
                                  <Badge className="bg-indigo-600 text-white text-[8px] px-2">{p.author_name}</Badge>
                                  <span className="text-[10px] text-muted-foreground font-bold">{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                               </div>
                               {p.title && <p className="text-sm font-heading font-black mb-1">{p.title}</p>}
                               <p className="text-xs text-muted-foreground line-clamp-2">{p.content}</p>
                               {p.plugin_data && (
                                 <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase text-indigo-600">Active Interactive Plugin</span>
                                    <Button size="sm" variant="outline" className="h-7 text-[9px] rounded-full px-4" onClick={() => navigate("/community")}>השתתפות</Button>
                                 </div>
                               )}
                            </div>
                         ))}
                      </div>
                    )}
                 </Card>

                 {/* Inbox & Direct Channels */}
                 <Card className="border-none bg-slate-900 text-white rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl -mb-32 -mr-32" />
                    <h3 className="text-xl font-heading font-black mb-8 flex items-center gap-3 relative z-10">
                       <MessageSquare className="h-6 w-6 text-indigo-400" /> Direct Inbox
                    </h3>
                    <div className="space-y-4 relative z-10">
                       {recentConvos.length === 0 ? (
                         <div className="py-8 text-center text-slate-500 italic text-xs">אין שיחות פעילות</div>
                       ) : (
                         recentConvos.map(c => (
                            <div key={c.id} className="flex items-center gap-4 p-5 rounded-[2rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 cursor-pointer" onClick={() => navigate("/chat")}>
                               <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden">
                                  {c.type === "parent_teacher" ? <UserRound className="h-6 w-6" /> : <Users className="h-6 w-6" />}
                               </div>
                               <div className="flex-1">
                                  <p className="text-sm font-bold">{c.title}</p>
                                  <p className="text-[10px] text-indigo-300 opacity-60">מענה בטווח שעה</p>
                               </div>
                               <ChevronLeft className="h-4 w-4 opacity-30" />
                            </div>
                         ))
                       )}
                       <Button onClick={() => navigate("/chat")} className="w-full h-16 bg-indigo-500 hover:bg-indigo-600 text-white rounded-[2rem] font-heading font-black text-lg gap-4 mt-6 shadow-xl relative z-10">
                          <Send className="h-6 w-6" /> התחלת שיחה עם המחנכת
                       </Button>
                    </div>
                 </Card>
              </div>

              {/* SECTION 3: ACADEMIC PULSE DETAIL */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                 {/* Progress Chart */}
                 <Card className="xl:col-span-8 p-10 border-none bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm">
                    <div className="flex items-center justify-between mb-10">
                       <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
                          <TrendingUp className="h-4 w-4 text-indigo-600" /> Academic Growth Curve
                       </h3>
                       <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-600" /> <span className="text-[9px] font-black">Child</span></div>
                          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300" /> <span className="text-[9px] font-black">Class Avg</span></div>
                       </div>
                    </div>
                    <div className="h-72">
                       <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                             <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 900}} axisLine={false} tickLine={false} dy={10} />
                             <YAxis hide domain={[0, 105]} />
                             <Line type="monotone" dataKey="grade" stroke="#4f46e5" strokeWidth={6} dot={{ r: 6, fill: "#4f46e5", strokeWidth: 4, stroke: "#fff" }} />
                             <Line type="monotone" dataKey="avg" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="8 4" dot={false} />
                          </LineChart>
                       </ResponsiveContainer>
                    </div>
                 </Card>

                 {/* Real Insights Engine */}
                 <div className="xl:col-span-4 space-y-6">
                    <Card className="p-8 border-none bg-indigo-50 dark:bg-indigo-900/10 rounded-[2.5rem] flex-1">
                       <p className="text-[10px] font-black uppercase text-indigo-500 mb-6 tracking-widest">Growth Insights</p>
                       <div className="space-y-6">
                          {subjectStats.slice(0, 3).map((ss, idx) => (
                             <div key={idx} className="flex gap-4">
                                <div className="p-3 h-fit rounded-2xl bg-white dark:bg-slate-900 shadow-sm"><ActivityIcon className={idx === 0 ? "text-indigo-600" : "text-emerald-500"} /></div>
                                <div>
                                   <p className="text-sm font-black">{ss.subject}</p>
                                   <p className="text-[11px] text-slate-500 leading-relaxed italic">{ss.statusLabel}</p>
                                </div>
                             </div>
                          ))}
                       </div>
                    </Card>
                    <Card className="p-8 border-none bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm text-center">
                       <p className="text-[10px] font-black uppercase text-slate-400 mb-4">Engagement</p>
                       <p className="text-4xl font-black">{attendance?.presencePct ?? 100}%</p>
                       <p className="text-xs text-slate-500 mt-2">רמת עירנות ונוכחות בשיעורים</p>
                    </Card>
                 </div>
              </div>

              {/* TIMELINE OF GRADES */}
              <motion.div variants={item} className="space-y-6">
                 <h3 className="text-xl font-heading font-black px-4">Timeline of Performance</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentGrades.map((g, i) => (
                       <Card key={i} className="border-none bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm hover:shadow-md transition-shadow group">
                          <div className="flex justify-between items-start mb-4">
                             <div className="space-y-1">
                                <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{g.subject}</p>
                                <p className="text-sm font-black group-hover:text-indigo-600 transition-colors">{g.title}</p>
                             </div>
                             <p className={`text-3xl font-black ${g.grade >= 90 ? 'text-emerald-500' : 'text-indigo-600'}`}>{g.grade}</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                             <p className="text-[10px] text-slate-500 leading-relaxed italic">
                                {g.teacherTip ? `💬 "${g.teacherTip}"` : "לא נוסף משוב מפורט למשימה זו."}
                             </p>
                          </div>
                       </Card>
                    ))}
                 </div>
              </motion.div>
           </div>
        )}
      </motion.div>
    </div>
  );
};

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

export default ParentDashboardPage;
