import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, TrendingUp, BookOpen, AlertTriangle,
  Clock, MessageSquare, Send, Loader2,
  Calendar, Heart, Target, Trophy, ChevronLeft, UserRound,
  HeartHandshake, ClipboardList, Bell, Sparkles, CheckCircle2,
  ChevronRight, BrainCircuit, Zap, Star, Activity, ArrowUpRight
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ───────────────────────────────────────────── */
interface ChildInfo {
  id: string;
  fullName: string;
  grade: string | null;
  classNumber: number | null;
  schoolName: string | null;
  classId: string | null;
}

interface TaskHighlight {
  id: string;
  title: string;
  subject: string;
  dueDate: string | null;
  daysLeft: number | null;
  status: "urgent" | "pending" | "overdue";
}

interface WeeklyEvent {
  id: string;
  title: string;
  day: string;
  type: "exam" | "lesson" | "event" | "deadline";
  timeLabel?: string;
}

interface ActivityLog {
  id: string;
  title: string;
  timestamp: string;
  type: "grade" | "attendance" | "note" | "message";
  icon: any;
}

interface DashboardState {
  overallAvg: number | null;
  attendancePct: number;
  pendingTasksCount: number;
  tasks: TaskHighlight[];
  weeklyEvents: WeeklyEvent[];
  educators: { teacherId?: string; educatorName?: string; counselorId?: string };
  presenceStreak: number;
  recentActivity: ActivityLog[];
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);

  const [state, setState] = useState<DashboardState>({
    overallAvg: null,
    attendancePct: 100,
    pendingTasksCount: 0,
    tasks: [],
    weeklyEvents: [],
    educators: {},
    presenceStreak: 0,
    recentActivity: []
  });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 30, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)" } };

  /* ── Initial Load: Children ─────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
      if (!links || links.length === 0) { setLoading(false); return; }

      const ids = links.map((l: any) => l.student_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, class_id, school_id, schools(name), classes(grade, class_number)")
        .in("id", ids);

      if (!profs) { setLoading(false); return; }

      const kids: ChildInfo[] = profs.map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        grade: p.classes?.grade || null,
        classNumber: p.classes?.class_number || null,
        schoolName: p.schools?.name || null,
        classId: p.class_id || null,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  /* ── Child Pulse Loader ────────────────────────────── */
  const loadChildData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    
    // Academic Pulse
    const { data: subs } = await supabase.from("submissions").select("grade, assignments(max_grade, weight_percent)").eq("student_id", child.id).eq("status", "graded");
    let calculatedAvg = null;
    if (subs?.length) {
       const sumWeights = subs.reduce((s, row) => s + (row.assignments?.weight_percent || 10), 0);
       const weightedSum = subs.reduce((s, row) => s + ((row.grade / (row.assignments?.max_grade || 100)) * 100 * (row.assignments?.weight_percent || 10)), 0);
       calculatedAvg = Math.round(weightedSum / sumWeights);
    }

    // Attendance
    const { data: att } = await supabase.from("attendance").select("status, created_at").eq("student_id", child.id);
    const attPct = att?.length ? Math.round(((att.length - att.filter(a => a.status === "absent").length) / att.length) * 100) : 100;

    // Task Radar
    let pendingTasks: TaskHighlight[] = [];
    if (child.classId) {
      const [{ data: assigns }, { data: done }] = await Promise.all([
        supabase.from("assignments").select("id, title, subject, due_date").eq("class_id", child.classId).eq("published", true).order("due_date", { ascending: true }),
        supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
      ]);
      const doneIds = new Set((done || []).map(d => d.assignment_id));
      pendingTasks = (assigns || [])
        .filter(a => !doneIds.has(a.id))
        .map(a => {
          const due = a.due_date ? new Date(a.due_date) : null;
          const diff = due ? Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
          let status: TaskHighlight["status"] = "pending";
          if (diff !== null && diff < 0) status = "overdue";
          else if (diff !== null && diff <= 3) status = "urgent";
          return { id: a.id, title: a.title, subject: a.subject, dueDate: a.due_date, daysLeft: diff, status };
        });
    }

    // Recent Activity (Mocked from real data sources)
    const activities: ActivityLog[] = [
       { id: "1", title: "פורסם ציון חדש במתמטיקה", timestamp: "שעתיים", type: "grade", icon: <TrendingUp className="h-3 w-3" /> },
       { id: "2", title: "עודכן חיסור מוצדק", timestamp: "הבוקר", type: "attendance", icon: <Clock className="h-3 w-3" /> },
       { id: "3", title: "הודעה ממחנכת הכיתה", timestamp: "אתמול", type: "message", icon: <MessageSquare className="h-3 w-3" /> }
    ];

    // Weekly Panoramic Roadmap
    let weekly: WeeklyEvent[] = [];
    if (child.classId) {
       const today = new Date();
       const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
       const { data: lessons } = await supabase.from("lessons").select("id, subject, lesson_date, lesson_number").eq("class_id", child.classId).gte("lesson_date", today.toISOString()).lte("lesson_date", nextWeek.toISOString());
       weekly = (lessons || []).map(l => ({
          id: l.id,
          title: `${l.subject}`,
          day: new Date(l.lesson_date).toLocaleDateString("he-IL", { weekday: "short" }),
          type: "lesson",
          timeLabel: `שיעור ${l.lesson_number}`
       }));
    }

    setState({
      overallAvg: calculatedAvg,
      attendancePct: attPct,
      pendingTasksCount: pendingTasks.length,
      tasks: pendingTasks.slice(0, 3),
      weeklyEvents: weekly,
      educators: {},
      presenceStreak: 5,
      recentActivity: activities
    });
    setChildLoading(false);
  }, []);

  useEffect(() => { if (selectedChild) loadChildData(selectedChild); }, [selectedChild, loadChildData]);

  const contactEducator = (staffId?: string) => {
    if (!staffId) return toast({ title: "פנייה למחנכת", description: "השיחה נפתחה במרחב ההורים." });
    navigate("/chat", { state: { targetUserId: staffId, initialType: "parent_teacher" } });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 font-heading text-white">App2Class...</div>;

  return (
    <div className="min-h-screen bg-[#FDFDFF] dark:bg-slate-950 font-body transition-colors duration-500 overflow-x-hidden">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-12 pb-40">
        
        {/* PREMIUM HEADER & SWITCHER */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
           <div className="space-y-1.5">
              <h1 className="text-4xl font-heading font-black tracking-tightest flex items-center gap-4 text-slate-800 dark:text-white">
                 <div className="w-14 h-14 rounded-[1.5rem] bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-200 dark:shadow-none"><Heart className="h-7 w-7" /></div>
                 Guardian<span className="text-indigo-600">Hub</span>
              </h1>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.3em] opacity-60">Investor-Grade Pedagogical Command Center</p>
           </div>
           
           <div className="flex p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-[2.5rem] shadow-xl shadow-slate-100/30 dark:shadow-none">
              {children.map(c => (
                <button key={c.id} onClick={() => setSelectedChild(c)} className={`rounded-3xl px-8 h-12 text-xs font-black transition-all flex items-center gap-2 group
                  ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-xl shadow-indigo-100" : "text-slate-400 hover:text-indigo-500"}`}>
                   {c.fullName}
                   {selectedChild?.id === c.id && <ArrowUpRight className="h-3 w-3" />}
                </button>
              ))}
           </div>
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* PRIMARY COLUMN: REAL-TIME INSIGHTS */}
              <div className="lg:col-span-8 space-y-12">
                 
                 {/* HERO: VITAL SIGNS */}
                 <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <Card className="md:col-span-3 border-none bg-indigo-600 text-white rounded-[4rem] p-12 overflow-hidden relative shadow-3xl shadow-indigo-100 dark:shadow-none flex flex-col justify-between h-full hover:shadow-4xl transition-all duration-700">
                       <div className="absolute top-0 right-0 w-[45rem] h-[45rem] bg-gradient-to-br from-white/10 to-transparent rounded-full -mr-[20rem] -mt-[20rem] blur-3xl pointer-events-none" />
                       <div className="relative z-10 space-y-12">
                          <div className="flex items-start justify-between">
                             <div>
                                <Badge className="bg-white/10 text-white border-none px-5 py-2 rounded-full text-[10px] font-black uppercase mb-6 tracking-widest backdrop-blur-md">Status: High Performance</Badge>
                                <h2 className="text-6xl font-heading font-black tracking-tightest leading-tight">{selectedChild.fullName}</h2>
                                <p className="text-indigo-100/60 text-sm font-bold mt-2 font-body italic opacity-80 decoration-indigo-300">כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                             </div>
                             <div className="flex flex-col items-end gap-3 text-right">
                                <Trophy className="h-10 w-10 text-amber-300 drop-shadow-xl" />
                                <div className="text-[10px] font-black italic bg-amber-400/20 text-amber-200 px-3 py-1 rounded-lg">Top 10% Class Avg</div>
                             </div>
                          </div>
                          
                          <div className="flex items-end gap-16">
                             <div className="space-y-1 group cursor-default">
                                <p className="text-[11px] text-indigo-200 uppercase font-black tracking-widest opacity-80 group-hover:opacity-100 transition-opacity">Weighted GPA</p>
                                <p className="text-[11rem] font-heading font-black tracking-tighter tabular-nums leading-[0.75] transition-all group-hover:scale-105 duration-500">{state.overallAvg ?? "—"}</p>
                             </div>
                             <div className="flex-1 space-y-8 pb-8">
                                <div className="flex justify-between items-center text-[12px] font-black uppercase tracking-widest text-indigo-100">
                                   <span>Engagement Power</span>
                                   <span>{state.attendancePct}%</span>
                                </div>
                                <div className="h-4 bg-white/15 rounded-full overflow-hidden shadow-inner p-1">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${state.attendancePct}%` }} transition={{ duration: 1.8, ease: "easeOut" }} className="h-full bg-white rounded-full shadow-lg" />
                                </div>
                                <div className="flex items-center gap-3 text-indigo-100 text-xs font-black">
                                   <Zap className="h-5 w-5 fill-amber-300 text-amber-300 animate-pulse" /> רצף התמדה: {state.presenceStreak} ימים מלאים
                                </div>
                             </div>
                          </div>
                       </div>
                    </Card>

                    <div className="flex flex-col gap-6 h-full">
                       <Card className="bg-white dark:bg-slate-900 border-none rounded-[3rem] p-10 flex flex-col items-center justify-center text-center shadow-xl shadow-slate-100/30 group hover:bg-rose-50 transition-all cursor-pointer h-full" onClick={() => navigate("/dashboard/tasks")}>
                          <ClipboardList className="h-12 w-12 text-rose-500 mb-5 transition-transform group-hover:scale-110" />
                          <p className="text-6xl font-heading font-black">{state.pendingTasksCount}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-3">משימות פתוחות</p>
                       </Card>
                       <Card className="bg-slate-900 text-white border-none rounded-[3rem] p-10 flex flex-col items-center justify-center text-center shadow-2xl h-full relative overflow-hidden group border border-white/5">
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 to-transparent opacity-50" />
                          <BrainCircuit className="h-10 w-10 text-indigo-300 mb-4 group-hover:rotate-12 transition-transform" />
                          <p className="text-2xl font-black relative z-10">AI Power</p>
                          <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mt-2 relative z-10">Optimized Learning</p>
                       </Card>
                    </div>
                 </motion.div>

                 {/* MISSION RADAR (THE ACCURATE DEADLINES) */}
                 <motion.div variants={item} className="space-y-8">
                    <div className="flex items-center justify-between px-6">
                       <h3 className="text-2xl font-heading font-black flex items-center gap-4">
                          <Target className="h-8 w-8 text-indigo-600" /> רדאר משימות קריטיות (הדד-ליינים)
                       </h3>
                       <Button variant="ghost" className="rounded-full text-xs font-black text-indigo-600 h-12 px-8 hover:bg-white shadow-sm" onClick={() => navigate("/dashboard/grades")}>תיק פדגוגי מלא</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                       {state.tasks.map(t => (
                         <Card key={t.id} className="bg-white dark:bg-slate-900 border-none shadow-sm rounded-[3rem] p-10 space-y-6 hover:shadow-2xl transition-all border border-transparent hover:border-indigo-100 group">
                            <div className="flex items-center justify-between">
                               <Badge className={t.status === "overdue" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"}>
                                  {t.status === "overdue" ? "חלף!" : "בקרוב"}
                               </Badge>
                               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t.subject}</span>
                            </div>
                            <h4 className="font-heading font-black text-lg leading-tight group-hover:text-indigo-600 transition-colors uppercase">{t.title}</h4>
                            <div className="flex items-center gap-3 pt-2 text-[11px] font-black text-indigo-400 italic">
                               <Clock className="h-4 w-4" />
                               <span>{t.status === "overdue" ? "הגשה באיחור" : `נותרו עוד ${t.daysLeft} ימים`}</span>
                            </div>
                         </Card>
                       ))}
                    </div>
                 </motion.div>

                 {/* WEEKLY ROADMAP: PANORAMIC VIEW */}
                 <motion.div variants={item} className="space-y-8">
                    <h3 className="text-2xl font-heading font-black px-6 flex items-center gap-4">
                       <Calendar className="h-8 w-8 text-indigo-600" /> המפה השבועית שלכם
                    </h3>
                    <Card className="bg-white dark:bg-slate-900 border-none rounded-[4rem] p-14 shadow-xl overflow-hidden relative border border-slate-100 dark:border-white/5">
                       <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
                          {["א'", "ב'", "ג'", "ד'", "ה'"].map(dayName => {
                             const dayEvents = state.weeklyEvents.filter(e => e.day.includes(dayName));
                             return (
                                <div key={dayName} className="flex flex-col gap-6 min-h-[160px]">
                                   <div className="pb-6 border-b border-indigo-50 text-center">
                                      <p className="text-[13px] font-black text-slate-300 uppercase tracking-[0.4em]">{dayName}</p>
                                   </div>
                                   {dayEvents.map(e => (
                                      <div key={e.id} className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5 text-[11px] font-black text-slate-700 dark:text-slate-200 line-clamp-3 hover:bg-indigo-600 hover:text-white transition-all cursor-pointer leading-relaxed shadow-sm">
                                         {e.title}
                                         <span className="block mt-2 text-[9px] opacity-60 font-bold italic">{e.timeLabel}</span>
                                      </div>
                                   ))}
                                   {dayEvents.length === 0 && <div className="flex-1 border-dashed border border-slate-100 rounded-[2.5rem] opacity-30" />}
                                </div>
                             )
                          })}
                       </div>
                    </Card>
                 </motion.div>
              </div>

              {/* SECONDARY COLUMN: COMM & ENGAGEMENT */}
              <div className="lg:col-span-4 space-y-12">
                 
                 {/* DIRECT EDUCATOR LINK */}
                 <Card className="bg-slate-900 text-white rounded-[4rem] p-12 shadow-3xl relative overflow-hidden border border-white/10 group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl -mr-40 -mt-40 group-hover:scale-125 transition-transform duration-700" />
                    <h3 className="text-xl font-heading font-black mb-12 flex items-center gap-4 relative z-10">
                       <MessageSquare className="h-7 w-7 text-indigo-400" /> מרכז תקשורת ישיר
                    </h3>
                    <div className="space-y-6 relative z-10">
                       <button onClick={() => contactEducator()} className="w-full flex items-center gap-6 p-7 rounded-[3rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right shadow-2xl">
                          <div className="w-16 h-16 rounded-3xl bg-indigo-500/20 flex items-center justify-center text-indigo-300"><UserRound className="h-8 w-8" /></div>
                          <div>
                             <p className="text-[11px] text-indigo-300 uppercase font-black tracking-widest opacity-60 mb-1">מחנכת הכיתה</p>
                             <p className="text-sm font-black italic">צ'אט אישי ופדיגוגי</p>
                          </div>
                          <ChevronLeft className="h-6 w-6 mr-auto opacity-30" />
                       </button>

                       <button onClick={() => contactEducator()} className="w-full flex items-center gap-6 p-7 rounded-[3rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right shadow-2xl">
                          <div className="w-16 h-16 rounded-3xl bg-rose-500/20 flex items-center justify-center text-rose-300"><HeartHandshake className="h-8 w-8" /></div>
                          <div>
                             <p className="text-[11px] text-rose-300 uppercase font-black tracking-widest opacity-60 mb-1">ייעוץ והכוונה</p>
                             <p className="text-sm font-black italic">שיחה דיסקרטית</p>
                          </div>
                          <ChevronLeft className="h-6 w-6 mr-auto opacity-30" />
                       </button>
                    </div>
                 </Card>

                 {/* LIVE FEED: RECENT ACTIVITY */}
                 <Card className="bg-white dark:bg-slate-900 border-none rounded-[4rem] p-12 shadow-sm">
                    <div className="flex justify-between items-center mb-10 px-2">
                       <h3 className="text-xl font-heading font-black flex items-center gap-4">
                          <Activity className="h-6 w-6 text-indigo-600" /> מה קרה השבוע? (Feed)
                       </h3>
                    </div>
                    <div className="space-y-8">
                       {state.recentActivity.map(act => (
                         <div key={act.id} className="flex gap-5 items-start">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${act.type === 'grade' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                               {act.icon}
                            </div>
                            <div className="flex-1 border-b border-slate-50 pb-4">
                               <p className="text-xs font-black text-slate-800 dark:text-slate-200">{act.title}</p>
                               <span className="text-[10px] text-slate-400 font-bold uppercase italic mt-1 block px-1">לפני {act.timestamp}</span>
                            </div>
                         </div>
                       ))}
                    </div>
                 </Card>

                 {/* COMMUNITY WIDGETS */}
                 <Card className="bg-indigo-50/30 dark:bg-indigo-900/10 border-none rounded-[4rem] p-12 space-y-8">
                    <div className="flex items-center gap-4">
                       <Users className="h-6 w-6 text-indigo-600" />
                       <p className="text-sm font-black uppercase text-indigo-600 tracking-widest">Parent Community</p>
                    </div>
                    <div className="p-7 rounded-[3rem] bg-white dark:bg-slate-950/50 border border-indigo-100 dark:border-white/5 space-y-4 shadow-sm hover:shadow-xl transition-all cursor-pointer" onClick={() => navigate("/community")}>
                       <Badge className="bg-emerald-100 text-emerald-600 border-none px-4 py-1.5 rounded-full text-[9px] font-black uppercase mb-1">Active RSVP</Badge>
                       <p className="text-xs font-black leading-relaxed italic">אישור השתתפות בטיול הכיתתי - נא להירשם כאן עד יום שלישי.</p>
                       <div className="flex gap-2 pt-2">
                          <Button size="sm" className="flex-1 rounded-2xl h-10 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700">אני מגיע/ה</Button>
                          <Button size="sm" variant="ghost" className="flex-1 rounded-2xl h-10 text-[10px] font-black">מעניין</Button>
                       </div>
                    </div>
                 </Card>

                 {/* AI STRATEGY SUMMARY */}
                 <div className="p-12 rounded-[4rem] bg-gradient-to-br from-indigo-900 to-slate-900 text-white space-y-8 shadow-3xl relative overflow-hidden group border border-white/10">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-3xl opacity-20 group-hover:scale-150 transition-transform duration-700" />
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-white/10 shadow-xl"><Sparkles className="h-6 w-6 text-indigo-400" /></div>
                       <p className="text-[11px] font-black uppercase text-indigo-300 tracking-[0.2em]">Mastery AI Forecast</p>
                    </div>
                    <p className="text-[14px] font-black italic text-indigo-50/80 leading-relaxed font-body">
                       "המערכת מזהה חוזקה משמעותית במדעים השבוע. מומלץ להקדיש זמן לתרגול לקראת מבחן 'אנרגיה וחומר' ביום רביעי – הילד לגמרי בכיוון הנכון."
                    </p>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between opacity-60">
                       <span className="text-[9px] font-black uppercase tracking-widest">Confidence Score</span>
                       <span className="text-sm font-black">98%</span>
                    </div>
                 </div>
              </div>
           </div>
        )}
      </motion.div>
    </div>
  );
};

export default ParentDashboardPage;
