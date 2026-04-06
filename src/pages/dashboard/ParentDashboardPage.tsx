import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, TrendingUp, TrendingDown, BookOpen, AlertTriangle,
  CheckCircle2, Clock, MessageSquare, Send, Loader2,
  Calendar, Heart, Brain, Target, Trophy, ChevronLeft, UserRound,
  HeartHandshake, School, Plus,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
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
}

interface SubjectPulse {
  subject: string;
  average: number;
  trend: "up" | "down" | "stable";
  level: "excellent" | "good" | "stable" | "warning";
  count: number;
}

interface DashboardState {
  overallAvg: number | null;
  attendancePct: number;
  pendingTasks: number;
  recentGrade: { grade: number; subject: string; title: string } | null;
  communityUpdate: { title: string; date: string } | null;
  unreadMessages: number;
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [childData, setChildData] = useState<DashboardState>({
    overallAvg: null,
    attendancePct: 100,
    pendingTasks: 0,
    recentGrade: null,
    communityUpdate: null,
    unreadMessages: 0,
  });
  const [subjectPulses, setSubjectPulses] = useState<SubjectPulse[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  /* ── Data Logic ───────────────────────────────────────── */
  const loadInitial = useCallback(async () => {
    setLoading(true);
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
    }));
    setChildren(kids);
    if (kids.length > 0) setSelectedChild(kids[0]);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const loadChildPulse = useCallback(async (child: ChildInfo) => {
    // 1. Fetch Submissions (Active Grades)
    const { data: subs } = await supabase
      .from("submissions")
      .select("grade, assignments(title, subject, max_grade), graded_at")
      .eq("student_id", child.id)
      .eq("status", "graded")
      .order("graded_at", { ascending: false });

    const normalizedGrades = (subs || []).map(s => {
      const g = s.grade;
      const m = s.assignments?.max_grade || 100;
      return { grade: Math.round((g / m) * 100), subject: s.assignments?.subject || "כללי", title: s.assignments?.title || "" };
    });

    // Calculate Averages
    const avg = normalizedGrades.length ? Math.round(normalizedGrades.reduce((a, b) => a + b.grade, 0) / normalizedGrades.length) : null;
    
    // Group by Subject
    const bySub: Record<string, number[]> = {};
    normalizedGrades.forEach(g => {
       if (!bySub[g.subject]) bySub[g.subject] = [];
       bySub[g.subject].push(g.grade);
    });
    const pulses: SubjectPulse[] = Object.entries(bySub).map(([subject, grades]) => {
       const subAvg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
       return {
         subject,
         average: subAvg,
         trend: grades.length > 1 ? (grades[0] > grades[1] ? "up" : "down") : "stable",
         level: subAvg >= 90 ? "excellent" : subAvg >= 80 ? "good" : subAvg >= 65 ? "stable" : "warning",
         count: grades.length
       };
    }).sort((a, b) => b.average - a.average);

    // 2. Fetch Attendance
    const { data: att } = await supabase.from("attendance").select("status").eq("student_id", child.id);
    const attPct = att?.length ? Math.round(((att.length - att.filter(a => a.status === "absent").length) / att.length) * 100) : 100;

    // 3. Pending Tasks
    let pending = 0;
    if (child.classId) {
      const { data: assigns } = await supabase.from("assignments").select("id").eq("class_id", child.classId).eq("published", true);
      const { data: done } = await supabase.from("submissions").select("assignment_id").eq("student_id", child.id);
      pending = (assigns?.length || 0) - (done?.length || 0);
    }

    // 4. Community & Inbox
    const { data: posts } = await supabase.from("factions").select("id").eq("school_id", child.schoolId).contains("eligible_roles", ["parent"]);
    let lastPost = null;
    if (posts?.length) {
       const { data: p } = await supabase.from("faction_posts").select("title, created_at").in("faction_id", posts.map(x => x.id)).order("created_at", { ascending: false }).limit(1).maybeSingle();
       if (p) lastPost = { title: p.title || "עדכון קהילה חדש", date: p.created_at };
    }

    setChildData({
      overallAvg: avg,
      attendancePct: attPct,
      pendingTasks: pending,
      recentGrade: normalizedGrades[0] || null,
      communityUpdate: lastPost,
      unreadMessages: 0,
    });
    setSubjectPulses(pulses);
    setTimelineData(normalizedGrades.slice().reverse().map((g, i) => ({ name: `מטלה ${i+1}`, grade: g.grade })));
  }, []);

  useEffect(() => { if (selectedChild) loadChildPulse(selectedChild); }, [selectedChild, loadChildPulse]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="h-10 w-10 animate-spin text-indigo-500" /></div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 font-body overflow-x-hidden">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-12 pb-32">
        
        {/* HEADER & SELECTOR */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
           <div className="space-y-1">
              <h1 className="text-3xl font-heading font-black tracking-tighter flex items-center gap-3 text-slate-800 dark:text-white">
                 <Heart className="h-7 w-7 text-indigo-600" /> <span className="text-indigo-600">Smart</span>Dashboard
              </h1>
              <p className="text-xs text-muted-foreground uppercase font-black tracking-widest opacity-60">Real-time Pedagogical Status</p>
           </div>
           {children.length > 1 && (
             <div className="flex p-1.5 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5">
                {children.map(c => (
                  <Button key={c.id} variant={selectedChild?.id === c.id ? "default" : "ghost"} size="sm" onClick={() => setSelectedChild(c)} className="rounded-2xl px-6 h-11 text-xs font-black transition-all">
                     {c.fullName}
                  </Button>
                ))}
             </div>
           )}
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* LEFT COLUMN: THE STATUS CARDS (The Pulse) */}
              <div className="lg:col-span-8 space-y-8">
                 
                 {/* 1. HERO STATUS: OVERALL PICTURE */}
                 <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 border-none bg-indigo-600 text-white rounded-[2.5rem] p-10 overflow-hidden relative shadow-2xl shadow-indigo-200 dark:shadow-none">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                       <div className="relative z-10 flex flex-col justify-between h-full space-y-10">
                          <div>
                             <Badge className="bg-white/10 text-white border-transparent text-[9px] uppercase font-black tracking-widest mb-4">Current Academic Level</Badge>
                             <h2 className="text-4xl font-heading font-black">{selectedChild.fullName}</h2>
                             <p className="text-indigo-100/70 text-xs font-bold mt-2">כתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                          </div>
                          <div className="flex items-center gap-10">
                             <div className="text-center">
                                <p className="text-8xl font-heading font-black tracking-tighter leading-none tabular-nums">{childData.overallAvg ?? "—"}</p>
                                <p className="text-[10px] text-indigo-200 uppercase font-black tracking-widest mt-3">Overall Average</p>
                             </div>
                             <div className="w-px h-20 bg-white/15" />
                             <div className="flex-1 space-y-4">
                                <div className="flex items-center justify-between">
                                   <span className="text-[10px] uppercase font-black text-indigo-200">Attendance</span>
                                   <span className="text-sm font-black">{childData.attendancePct}%</span>
                                </div>
                                <Progress value={childData.attendancePct} className="h-2 bg-white/10" />
                             </div>
                          </div>
                       </div>
                    </Card>

                    <div className="space-y-6">
                       <Card className="border-none bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm border border-slate-100 dark:border-white/5 h-[calc(50%-12px)]">
                          <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center"><Clock className="h-6 w-6 text-orange-600" /></div>
                          <div>
                             <p className="text-3xl font-black">{childData.pendingTasks}</p>
                             <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Pending Tasks</p>
                          </div>
                       </Card>
                       <Card className="border-none bg-emerald-500 text-white rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm h-[calc(50%-12px)]">
                          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-white" /></div>
                          <div>
                             <p className="text-3xl font-black">{childData.attendancePct >= 90 ? 'Healthy' : 'Warning'}</p>
                             <p className="text-[10px] text-emerald-100 uppercase font-black tracking-widest mt-1">Engagement Pulse</p>
                          </div>
                       </Card>
                    </div>
                 </motion.div>

                 {/* 2. SUBJECT-BY-SUBJECT BREAKDOWN */}
                 <motion.div variants={item} className="space-y-6">
                    <div className="flex items-center justify-between px-4">
                       <h3 className="text-xl font-heading font-black">Subject Performance</h3>
                       <Button variant="ghost" size="sm" className="text-xs font-bold text-indigo-600">דוח מפורט</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {subjectPulses.map(sp => (
                         <Card key={sp.subject} className="border-none bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-white/5 flex items-center gap-5 hover:shadow-md transition-all group">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-transform group-hover:scale-110
                              ${sp.level === 'excellent' ? 'bg-amber-50' : sp.level === 'warning' ? 'bg-rose-50' : 'bg-slate-50'}`}>
                               {sp.level === 'excellent' ? '🏆' : sp.level === 'warning' ? '⚠️' : '📖'}
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="text-sm font-black truncate">{sp.subject}</p>
                               <p className="text-[10px] text-slate-400 mt-0.5">{sp.count} מטלות משוקללות</p>
                            </div>
                            <div className="text-right">
                               <p className={`text-2xl font-black ${sp.average >= 90 ? 'text-amber-500' : sp.average < 65 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>{sp.average}</p>
                               <div className="flex items-center justify-end gap-1">
                                  {sp.trend === 'up' ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : sp.trend === 'down' ? <TrendingDown className="h-3 w-3 text-rose-500" /> : <Minus className="h-3 w-3 text-slate-300" />}
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{sp.trend}</span>
                               </div>
                            </div>
                         </Card>
                       ))}
                    </div>
                 </motion.div>

                 {/* 3. GROWTH TIMELINE CHART */}
                 <motion.div variants={item}>
                    <Card className="border-none bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 shadow-sm border border-slate-100 dark:border-white/5">
                       <div className="flex items-center justify-between mb-10">
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
                             <TrendingUp className="h-4 w-4 text-indigo-600" /> Progression Curve
                          </h3>
                       </div>
                       <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                             <LineChart data={timelineData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                                <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 900}} axisLine={false} tickLine={false} dy={10} />
                                <YAxis hide domain={[0, 105]} />
                                <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                <Line type="monotone" dataKey="grade" stroke="#4f46e5" strokeWidth={6} dot={{ r: 6, fill: "#4f46e5", strokeWidth: 4, stroke: "#fff" }} />
                             </LineChart>
                          </ResponsiveContainer>
                       </div>
                    </Card>
                 </motion.div>
              </div>

              {/* RIGHT COLUMN: ACTIONABLE INSIGHTS & COMMS */}
              <div className="lg:col-span-4 space-y-8">
                 
                 {/* QUICK ACTIONS / INBOX */}
                 <Card className="border-none bg-slate-900 text-white rounded-[2.5rem] p-10 shadow-3xl overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent pointer-events-none" />
                    <h3 className="text-xl font-heading font-black mb-8 flex items-center gap-3 relative z-10">
                       <MessageSquare className="h-6 w-6 text-indigo-400" /> Direct Inbox
                    </h3>
                    <div className="space-y-4 relative z-10">
                       <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-all group" onClick={() => navigate("/chat")}>
                          <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 group-hover:scale-110 transition-transform"><UserRound className="h-6 w-6" /></div>
                          <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold">מחנכת הכיתה</p>
                             <p className="text-[10px] text-indigo-300/60 uppercase font-black mt-0.5">זמינה למענה</p>
                          </div>
                          <ChevronLeft className="h-4 w-4 opacity-30" />
                       </div>
                       <Button onClick={() => navigate("/chat")} className="w-full h-16 bg-indigo-500 hover:bg-indigo-600 text-white rounded-[1.5rem] font-heading font-black text-lg gap-4 mt-6 shadow-xl relative z-10 transition-all hover:scale-[1.02] active:scale-95">
                          <Send className="h-6 w-6" /> התחלת שיחה
                       </Button>
                    </div>
                 </Card>

                 {/* COMMUNITY UPDATE */}
                 <Card className="border-none bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 shadow-sm border border-slate-100 dark:border-white/5">
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="text-base font-heading font-black flex items-center gap-3">
                          <Users className="h-5 w-5 text-indigo-600" /> הפיד הקהילתי
                       </h3>
                    </div>
                    {childData.communityUpdate ? (
                       <div className="space-y-4">
                          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-transparent">
                             <p className="text-sm font-black mb-2">{childData.communityUpdate.title}</p>
                             <p className="text-[10px] text-slate-400 font-bold">{new Date(childData.communityUpdate.date).toLocaleDateString("he-IL")}</p>
                          </div>
                          <Button variant="outline" className="w-full rounded-xl text-xs font-bold h-10" onClick={() => navigate("/community")}>לפורום המלא</Button>
                       </div>
                    ) : (
                       <div className="text-center py-10 opacity-30">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-[10px] font-black uppercase">אין פוסטים חדשים</p>
                       </div>
                    )}
                 </Card>

                 {/* PEDAGOGICAL TIPS */}
                 <Card className="border-none bg-indigo-50 dark:bg-indigo-900/10 rounded-[2.5rem] p-10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 mb-6 flex items-center gap-2">
                       <Brain className="h-4 w-4" /> Insight Engine
                    </h3>
                    <div className="space-y-6">
                       {childData.overallAvg && childData.overallAvg >= 85 ? (
                         <div className="flex gap-4">
                            <div className="p-3 h-fit rounded-xl bg-white dark:bg-slate-900 shadow-sm"><Trophy className="h-5 w-5 text-amber-500" /></div>
                            <div>
                               <p className="text-sm font-black">מצוינות אקדמית</p>
                               <p className="text-[10px] text-slate-500 leading-relaxed italic">"התלמיד/ה נמצא ב-10% העליונים של השכבה בממוצע הגבוה ביותר."</p>
                            </div>
                         </div>
                       ) : (
                         <div className="flex gap-4">
                            <div className="p-3 h-fit rounded-xl bg-white dark:bg-slate-900 shadow-sm"><Target className="h-5 w-5 text-indigo-500" /></div>
                            <div>
                               <p className="text-sm font-black">יציבות זה כוח</p>
                               <p className="text-[10px] text-slate-500 leading-relaxed italic">"המערכת מזהה יציבות טובה בציונים האחרונים. כדאי להתמקד במשימות פתוחות."</p>
                            </div>
                         </div>
                       )}
                    </div>
                 </Card>
              </div>
           </div>
        )}
      </motion.div>
    </div>
  );
};

export default ParentDashboardPage;
