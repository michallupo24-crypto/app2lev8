import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, TrendingUp, BookOpen, Clock, MessageSquare, 
  Calendar, Heart, Target, ChevronLeft, UserRound,
  HeartHandshake, ClipboardList, Sparkles, Activity, Percent, ArrowRight,
  CheckCircle2, FileText, ArrowLeft, MoreHorizontal, Bell, Zap
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
  schoolId: string | null;
}

interface TaskHighlight {
  id: string;
  title: string;
  subject: string;
  dueDate: string | null;
  daysLeft: number | null;
  status: "urgent" | "pending" | "overdue";
}

interface WeeklyItem {
  id: string;
  title: string;
  type: 'exam' | 'lesson' | 'holiday' | 'event';
  date: string;
  dayLabel: string;
}

interface DashboardState {
  overallAvg: number | null;
  classAvg: number | null;
  attendancePct: number;
  overdueCount: number;
  pendingTasksCount: number;
  tasks: TaskHighlight[];
  weeklyRoadmap: WeeklyItem[];
  educators: { teacherId?: string; educatorName?: string; counselorId?: string; counselorName?: string };
  syncingGroups: boolean;
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
    classAvg: null,
    attendancePct: 100,
    overdueCount: 0,
    pendingTasksCount: 0,
    tasks: [],
    weeklyRoadmap: [],
    educators: {},
    syncingGroups: false
  });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0 } };

  /* ── 1. Proactive Group Sync (The Linkage Fix) ───────── */
  const syncCommunityGroups = useCallback(async (child: ChildInfo) => {
    if (!child.classId) return;
    setState(s => ({ ...s, syncingGroups: true }));
    
    // Check if parent-class or parent-grade conversations exist for this class
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, type")
      .or(`class_id.eq.${child.classId},and(type.eq.parent_grade,school_id.eq.${child.schoolId})`);

    if (convos && convos.length > 0) {
      // Ensure parent is a participant in these
      const participantRows = convos.map(c => ({ conversation_id: c.id, user_id: profile.id }));
      for (const p of participantRows) {
        await supabase.from("conversation_participants").upsert(p, { onConflict: 'conversation_id,user_id' });
      }
    }
    setState(s => ({ ...s, syncingGroups: false }));
  }, [profile.id]);

  /* ── 2. Data Pulse (Hard Facts) ──────────────────────── */
  const loadChildData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    await syncCommunityGroups(child);
    
    // a. Weighted GPA Reality
    const { data: subData } = await supabase.from("submissions").select("grade, assignments(max_grade, weight_percent)").eq("student_id", child.id).eq("status", "graded");
    let childAvg = null;
    if (subData?.length) {
      let weightedSum = 0, weightTotal = 0;
      subData.forEach((s: any) => {
        const w = s.assignments?.weight_percent || 10;
        weightedSum += (s.grade / (s.assignments?.max_grade || 100)) * 100 * w;
        weightTotal += w;
      });
      childAvg = Math.round(weightedSum / weightTotal);
    }

    // b. Class Performance Analysis
    let cAvg = null;
    if (child.classId) {
      const { data: ca } = await supabase.from("assignments").select("id").eq("class_id", child.classId).eq("published", true);
      if (ca?.length) {
        const { data: cs } = await supabase.from("submissions").select("grade, assignments(max_grade)").in("assignment_id", ca.map(a => a.id)).eq("status", "graded");
        if (cs?.length) cAvg = Math.round(cs.reduce((acc, r) => acc + (r.grade / (r.assignments?.max_grade || 100)) * 100, 0) / cs.length);
      }
    }

    // c. Authorized Educator Connection
    let educators: DashboardState["educators"] = {};
    if (child.classId) {
       const { data: role } = await supabase.from("user_roles").select("user_id, profiles!inner(full_name)").eq("homeroom_class_id", child.classId).eq("role", "educator").maybeSingle();
       if (role) { educators.teacherId = role.user_id; educators.educatorName = (role.profiles as any)?.full_name; }
    }
    if (child.schoolId) {
       const { data: counsel } = await supabase.from("user_roles").select("user_id, profiles!inner(full_name)").eq("role", "counselor").eq("profiles.school_id", child.schoolId).limit(1).maybeSingle();
       if (counsel) { educators.counselorId = counsel.user_id; educators.counselorName = (counsel.profiles as any)?.full_name; }
    }

    // d. Tasks Intersection
    let pending: TaskHighlight[] = [];
    let overdueSize = 0;
    if (child.classId) {
      const [{ data: assignments }, { data: subs }] = await Promise.all([
        supabase.from("assignments").select("id, title, subject, due_date").eq("class_id", child.classId).eq("published", true),
        supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
      ]);
      const doneIds = new Set((subs || []).map(s => s.assignment_id));
      pending = (assignments || []).filter(a => !doneIds.has(a.id)).map(a => {
        const due = a.due_date ? new Date(a.due_date) : null;
        const diff = due ? Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
        if (diff !== null && diff < 0) overdueSize++;
        return { id: a.id, title: a.title, subject: a.subject, dueDate: a.due_date, daysLeft: diff, status: (diff !== null && diff < 0) ? "overdue" : "pending" };
      });
    }

    // e. Real Roadmap (Exams, Holidays)
    let roadmap: WeeklyItem[] = [];
    if (child.schoolId && child.grade) {
      const [{ data: ex }, { data: hl }] = await Promise.all([
        supabase.from("grade_events").select("id, title, event_date").eq("school_id", child.schoolId).eq("grade", child.grade).gte("event_date", new Date().toISOString().split('T')[0]).limit(5),
        supabase.from("school_events").select("id, title, start_date").eq("is_holiday", true).gte("start_date", new Date().toISOString().split('T')[0]).limit(5)
      ]);
      ex?.forEach(e => roadmap.push({ id: e.id, title: e.title, type: 'exam', date: e.event_date, dayLabel: new Date(e.event_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
      hl?.forEach(h => roadmap.push({ id: h.id, title: h.title, type: 'holiday', date: h.start_date, dayLabel: new Date(h.start_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
      roadmap.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // f. Attendance Pulse
    const { data: attHistory } = await supabase.from("attendance").select("status").eq("student_id", child.id);
    const score = attHistory?.length ? Math.round(((attHistory.length - attHistory.filter(a => a.status === "absent").length) / attHistory.length) * 100) : 100;

    setState(s => ({
      ...s,
      overallAvg: childAvg,
      classAvg: cAvg,
      attendancePct: score,
      overdueCount: overdueSize,
      pendingTasksCount: pending.length,
      tasks: pending.sort((a,b) => (a.daysLeft || 0) - (b.daysLeft || 0)).slice(0, 3),
      weeklyRoadmap: roadmap,
      educators
    }));
    setChildLoading(false);
  }, [syncCommunityGroups]);

  /* ── 3. Initialization ─────────────────────────────── */
  useEffect(() => {
    const fetchKids = async () => {
      setLoading(true);
      const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
      if (!links?.length) { setLoading(false); return; }
      const ids = links.map(l => l.student_id);
      const { data: profs } = await supabase.from("profiles").select("id, full_name, class_id, school_id, schools(name), classes(grade, class_number)").in("id", ids);
      if (!profs) { setLoading(false); return; }
      const kids = profs.map((p: any) => ({
        id: p.id, fullName: p.full_name, grade: p.classes?.grade || null, classNumber: p.classes?.class_number || null,
        schoolName: p.schools?.name || null, classId: p.class_id || null, schoolId: p.school_id || null,
      }));
      setChildren(kids);
      if (kids.length) setSelectedChild(kids[0]);
      setLoading(false);
    };
    fetchKids();
  }, [profile.id]);

  useEffect(() => { if (selectedChild) loadChildData(selectedChild); }, [selectedChild, loadChildData]);

  const openProfessionalChat = (id?: string) => {
    if (!id) return toast({ title: "שגיאת סיווג", description: "איש הצוות לא מזוהה כרגע.", variant: "destructive" });
    navigate("/chat", { state: { targetUserId: id } });
  };

  const openCommunityGroup = (type: 'parent_class' | 'parent_grade') => {
    navigate("/chat", { state: { initialType: type } });
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-heading text-indigo-600 animate-pulse text-2xl">Syncing Reality...</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 font-body p-6 md:p-12 pb-40">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-16">
        
        {/* TITANIUM HEADER */}
        <motion.div variants={item} className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
           <div className="space-y-4">
              <h1 className="text-5xl font-black tracking-tightest flex items-center gap-5">
                 <div className="w-16 h-16 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white shadow-3xl shadow-indigo-100">
                    <Heart className="h-10 w-10" />
                 </div>
                 Guardian<span className="text-indigo-600">Core</span>
              </h1>
              <div className="flex gap-4">
                 {children.map(c => (
                   <button key={c.id} onClick={() => setSelectedChild(c)} className={`px-10 h-14 rounded-2xl text-xs font-black transition-all ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-100 scale-105" : "bg-slate-50 text-slate-400 hover:text-slate-600"}`}>
                      {c.fullName}
                   </button>
                 ))}
                 {state.syncingGroups && <Badge className="bg-emerald-50 text-emerald-600 animate-pulse font-black px-4">Community Syncing...</Badge>}
              </div>
           </div>
           
           <Button onClick={() => navigate("/dashboard/grades")} className="h-18 px-12 rounded-[2.5rem] bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-5 shadow-3xl shadow-emerald-100 group transition-all hover:scale-105">
              <FileText className="h-7 w-7 group-hover:rotate-12 transition-transform" />
              דוח ציונים מפורט ומרכז הישגים
           </Button>
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* PRIMARY VISUAL COCKPIT */}
              <div className="lg:col-span-8 space-y-16">
                 
                 {/* ACADEMIC REALITY GRID */}
                 <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <Card className="md:col-span-3 border-none bg-indigo-600 text-white rounded-[4.5rem] p-14 overflow-hidden shadow-4xl shadow-indigo-100/30 relative h-full flex flex-col justify-between">
                       <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                       <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-10">
                          <div>
                             <h2 className="text-6xl font-black tracking-tightest leading-none">{selectedChild.fullName}</h2>
                             <p className="text-indigo-200 font-bold mt-4 uppercase text-[10px] tracking-widest opacity-70 border-b border-indigo-500/30 pb-2 inline-block">
                                כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}
                             </p>
                             
                             <div className="flex items-end gap-12 mt-12">
                                <div className="text-center group/avg">
                                   <p className="text-[14rem] font-black leading-none tabular-nums tracking-tighter group-hover/avg:scale-110 transition-transform">{state.overallAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-6 opacity-60">Weighted GPA</p>
                                </div>
                                <div className="w-px h-32 bg-white/10" />
                                <div className="text-center">
                                   <p className="text-5xl font-black text-indigo-200 tabular-nums">{state.classAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-6 opacity-60">ממוצע כיתה</p>
                                </div>
                             </div>
                          </div>
                          
                          <div className="flex-1 w-full md:max-w-[260px] space-y-10">
                             <div className="space-y-5">
                                <div className="flex justify-between items-center text-[11px] font-black uppercase text-indigo-200">
                                   <span className="flex items-center gap-2"><Percent className="h-4 w-4" /> Presence Score</span>
                                   <span>{state.attendancePct}%</span>
                                </div>
                                <div className="h-5 bg-white/10 rounded-full overflow-hidden p-1.5 shadow-inner">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${state.attendancePct}%` }} className="h-full bg-white rounded-full shadow-sm" />
                                </div>
                             </div>
                             <div className="p-7 bg-white/5 rounded-[3rem] border border-white/10 text-xs font-bold leading-relaxed text-indigo-50 backdrop-blur-xl">
                                <Activity className="h-5 w-5 mb-3 text-emerald-400" />
                                {state.overallAvg && state.classAvg && state.overallAvg >= state.classAvg 
                                  ? `הילדה שומרת על מצוינות אקדמית יציבה עם פער חיובי של ${state.overallAvg - state.classAvg} נקודות.` 
                                  : "המערכת מזהה הזדמנות לצמצום פערים ביחס לממוצע הכיתתי במטלות האחרונות."}
                             </div>
                          </div>
                       </div>
                    </Card>

                    <Card className="bg-slate-50 dark:bg-slate-900 border-none rounded-[4.5rem] p-12 flex flex-col items-center justify-center text-center shadow-inner hover:scale-105 transition-transform group">
                       <Clock className={`h-16 w-16 mb-8 transition-all ${state.overdueCount > 0 ? "text-rose-500 animate-bounce" : "text-indigo-600 opacity-20 group-hover:opacity-100"}`} />
                       <p className="text-9xl font-black tabular-nums leading-none tracking-tighter">{state.overdueCount}</p>
                       <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-6">משימות שלא נעשו</p>
                    </Card>
                 </motion.div>

                 {/* TRUE REALM CALENDAR */}
                 <motion.div variants={item} className="space-y-10">
                    <h3 className="text-3xl font-black px-6 flex items-center gap-5">
                       <Calendar className="h-9 w-9 text-indigo-600" /> יומן אירועים (Operational Roadmap)
                    </h3>
                    <Card className="bg-white dark:bg-slate-900 border-none rounded-[4.5rem] p-16 shadow-2xl shadow-slate-100/50">
                       <div className="flex gap-14 min-w-[800px] overflow-hidden">
                          {["א'", "ב'", "ג'", "ד'", "ה'"].map(day => {
                             const dayItems = state.weeklyRoadmap.filter(r => r.dayLabel === day);
                             return (
                               <div key={day} className="flex-1 space-y-8 text-center">
                                  <p className="text-[12px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50 w-full pb-6">{day}</p>
                                  {dayItems.map(i => (
                                     <div key={i.id} className={`w-full p-8 rounded-[2.5rem] text-[12px] font-black flex flex-col gap-3 items-center ${i.type === 'exam' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                                        <Badge className="bg-white/80 shadow-sm text-[10px] font-black px-4">{i.type === 'exam' ? "מבחן/בוחן" : "פעילות"}</Badge>
                                        <span className="leading-tight">{i.title}</span>
                                     </div>
                                  ))}
                                  {dayItems.length === 0 && <div className="h-40 w-full border-4 border-dashed border-slate-50 rounded-[4rem] opacity-20" />}
                                </div>
                             );
                          })}
                       </div>
                    </Card>
                 </motion.div>
              </div>

              {/* SIDEBAR: COMMUNITY & CHANNELS */}
              <div className="lg:col-span-4 space-y-14">
                 
                 {/* VERIFIED PROFESSIONAL DM */}
                 <Card className="bg-slate-900 text-white rounded-[4.5rem] p-14 shadow-4xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
                    <h3 className="text-2xl font-black mb-12 flex items-center gap-5 relative z-10">
                       <MessageSquare className="h-7 w-7 text-indigo-400" /> ערוצי קשר רשמיים
                    </h3>
                    <div className="space-y-8 relative z-10">
                       <button onClick={() => openProfessionalChat(state.educators.teacherId)} className="w-full flex items-center gap-8 p-9 rounded-[3.5rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right group/btn relative">
                          <div className="w-20 h-20 rounded-[2.25rem] bg-indigo-500/20 flex items-center justify-center text-indigo-300 group-hover/btn:rotate-6 transition-all shadow-2xl"><UserRound className="h-10 w-10" /></div>
                          <div>
                             <p className="text-[11px] text-indigo-400 uppercase font-black tracking-widest opacity-70 mb-2">מחנכת הכיתה</p>
                             <p className="text-lg font-black">{state.educators.educatorName || "—"}</p>
                          </div>
                          {!state.educators.educatorName && <Zap className="h-4 w-4 absolute top-6 left-6 text-amber-500 animate-pulse" />}
                       </button>

                       <button onClick={() => openProfessionalChat(state.educators.counselorId)} className="w-full flex items-center gap-8 p-9 rounded-[3.5rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right group/btn">
                          <div className="w-20 h-20 rounded-[2.25rem] bg-rose-500/20 flex items-center justify-center text-rose-300 group-hover/btn:rotate-6 transition-all shadow-2xl"><HeartHandshake className="h-10 w-10" /></div>
                          <div>
                             <p className="text-[11px] text-rose-400 uppercase font-black tracking-widest opacity-70 mb-2">מערך הייעוץ</p>
                             <p className="text-lg font-black">{state.educators.counselorName || "—"}</p>
                          </div>
                       </button>
                    </div>
                 </Card>

                 {/* PARENT COMMUNITY HUBS (FACTUAL DEEP LINKS) */}
                 <div className="p-14 rounded-[4.5rem] bg-white dark:bg-slate-900 border-2 border-slate-50 shadow-2xl space-y-12">
                    <h4 className="text-[12px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-4">
                       <Users className="h-5 w-5" /> קהילת הורים (Real-Time)
                    </h4>
                    <div className="space-y-6">
                       <button onClick={() => openCommunityGroup('parent_class')} className="w-full h-20 rounded-[2rem] bg-slate-50 hover:bg-slate-100 transition-all flex items-center justify-between px-10 text-sm font-black group shadow-sm hover:shadow-md">
                          <span>קבוצת הורי כיתה {selectedChild.grade}</span>
                          <ArrowLeft className="h-6 w-6 text-indigo-600 group-hover:-translate-x-3 transition-all" />
                       </button>
                       <button onClick={() => openCommunityGroup('parent_grade')} className="w-full h-20 rounded-[2rem] border-2 border-slate-50 hover:bg-slate-50 transition-all flex items-center justify-between px-10 text-sm font-black group shadow-sm hover:shadow-md">
                          <span>פורום הורי שכבת {selectedChild.grade}</span>
                          <ArrowLeft className="h-6 w-6 text-indigo-600 group-hover:-translate-x-3 transition-all" />
                       </button>
                    </div>
                 </div>

                 {/* AI OVERVIEW (TITANIUM EDITION) */}
                 <div className="p-14 rounded-[4.5rem] bg-indigo-50 border border-indigo-100 shadow-xl space-y-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-20 transition-opacity"><Sparkles className="h-12 w-12 text-indigo-600" /></div>
                    <div className="flex items-center gap-4">
                       <Sparkles className="h-6 w-6 text-indigo-600 animate-pulse" />
                       <p className="text-[12px] font-black uppercase text-indigo-600 tracking-widest">Pedagogical Insights</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed italic border-r-4 border-indigo-500/20 pr-8">
                       {state.overdueCount > 0 
                         ? `נראו ${state.overdueCount} חובות הגשה. מומלץ לוודא השלמה לפני המבחן ב-${state.tasks[0]?.subject}.`
                         : "סנכרון מלא: הילדה שומרת על מגמת צמיחה חיובית. כל המשימות הוגשו וממוצע הציונים יציב."}
                    </p>
                    <div className="pt-8 border-t border-indigo-200/40 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <span className="text-[11px] font-black text-indigo-600">DB Live-Sync</span>
                       </div>
                       <Button variant="ghost" onClick={() => navigate("/dashboard/grades")} className="text-[11px] font-black text-indigo-600 gap-3 group/link">
                          לדוח המלא <ChevronLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                       </Button>
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
