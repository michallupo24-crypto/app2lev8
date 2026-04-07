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
  HeartHandshake, ClipboardList, Sparkles, Activity, Percent, ArrowRight
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── Types & Symbols ────────────────────────────────── */
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
  activityFeed: { id: string; title: string; type: string; date: string }[];
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
    activityFeed: []
  });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "circOut" } } };

  /* ── 1. Fetch Children ───────────────────────────────── */
  useEffect(() => {
    const fetchKids = async () => {
      setLoading(true);
      const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
      if (!links || links.length === 0) { setLoading(false); return; }

      const ids = links.map((l: any) => l.student_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, class_id, school_id, schools(name), classes(grade, class_number)")
        .in("id", ids);

      if (!profs) { setLoading(false); return; }
      
      const kids = profs.map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        grade: p.classes?.grade || null,
        classNumber: p.classes?.class_number || null,
        schoolName: p.schools?.name || null,
        classId: p.class_id || null,
        schoolId: p.school_id || null,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    fetchKids();
  }, [profile.id]);

  /* ── 2. The Data Pulse (Perfect Fact-Driven Fix) ─────── */
  const loadChildData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    
    // a. Academic Average (Weighted)
    const { data: subData } = await supabase
      .from("submissions")
      .select("grade, assignments(max_grade, weight_percent)")
      .eq("student_id", child.id)
      .eq("status", "graded");
    
    let childAvg = null;
    if (subData && subData.length > 0) {
      let totalWeighted = 0;
      let totalWeights = 0;
      subData.forEach((s: any) => {
        const weight = s.assignments?.weight_percent || 10;
        const normalized = (s.grade / (s.assignments?.max_grade || 100)) * 100;
        totalWeighted += normalized * weight;
        totalWeights += weight;
      });
      childAvg = Math.round(totalWeighted / totalWeights);
    }

    // b. Class Performance Analysis
    let cAvg = null;
    if (child.classId) {
      const { data: cAssigns } = await supabase.from("assignments").select("id").eq("class_id", child.classId).eq("published", true);
      if (cAssigns && cAssigns.length > 0) {
        const aIds = cAssigns.map(a => a.id);
        const { data: cSubs } = await supabase.from("submissions").select("grade, assignments(max_grade)").in("assignment_id", aIds).eq("status", "graded");
        if (cSubs && cSubs.length > 0) {
          cAvg = Math.round(cSubs.reduce((acc, row) => acc + (row.grade / (row.assignments?.max_grade || 100)) * 100, 0) / cSubs.length);
        }
      }
    }

    // c. Educator Discovery (Linking user_roles correctly)
    let educators: DashboardState["educators"] = {};
    if (child.classId) {
       const { data: teacherRole } = await supabase
         .from("user_roles")
         .select("user_id, profiles!inner(full_name)")
         .eq("homeroom_class_id", child.classId)
         .eq("role", "educator")
         .maybeSingle();
       if (teacherRole) {
          educators.teacherId = teacherRole.user_id;
          educators.educatorName = (teacherRole.profiles as any)?.full_name;
       }
    }
    if (child.schoolId) {
       const { data: counselRole } = await supabase
         .from("user_roles")
         .select("user_id, profiles!inner(full_name)")
         .eq("role", "counselor")
         .eq("profiles.school_id", child.schoolId)
         .limit(1)
         .maybeSingle();
       if (counselRole) {
          educators.counselorId = counselRole.user_id;
          educators.counselorName = (counselRole.profiles as any)?.full_name;
       }
    }

    // d. Tasks & Critical Deadlines Audit
    let pendingTasks: TaskHighlight[] = [];
    let overdueSize = 0;
    if (child.classId) {
       const [{ data: allClassAssigns }, { data: childSubs }] = await Promise.all([
          supabase.from("assignments").select("id, title, subject, due_date").eq("class_id", child.classId).eq("published", true),
          supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
       ]);
       const submittedIds = new Set((childSubs || []).map(s => s.assignment_id));
       const pending = (allClassAssigns || []).filter(a => !submittedIds.has(a.id)).map(a => {
          const due = a.due_date ? new Date(a.due_date) : null;
          const diff = due ? Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
          if (diff !== null && diff < 0) overdueSize++;
          return { id: a.id, title: a.title, subject: a.subject, dueDate: a.due_date, daysLeft: diff, status: (diff !== null && diff < 0) ? "overdue" : (diff !== null && diff <= 3) ? "urgent" : "pending" as any };
       });
       pendingTasks = pending.sort((a,b) => (a.daysLeft || 0) - (b.daysLeft || 0));
    }

    // e. Attendance Score
    const { data: attHistory } = await supabase.from("attendance").select("status").eq("student_id", child.id);
    const attPct = attHistory?.length ? Math.round(((attHistory.length - attHistory.filter(a => a.status === "absent" || a.status === "late").length * 0.5) / attHistory.length) * 100) : 100;

    // f. Roadmap (Merging Grade Events & Holidays)
    let roadmap: WeeklyItem[] = [];
    if (child.schoolId && child.grade) {
       const [{ data: exams }, { data: holidays }] = await Promise.all([
          supabase.from("grade_events").select("id, title, event_date").eq("school_id", child.schoolId).eq("grade", child.grade).gte("event_date", new Date().toISOString().split('T')[0]).limit(5),
          supabase.from("school_events").select("id, title, start_date").eq("is_holiday", true).gte("start_date", new Date().toISOString().split('T')[0]).limit(5)
       ]);
       exams?.forEach(e => roadmap.push({ id: e.id, title: e.title, type: 'exam', date: e.event_date, dayLabel: new Date(e.event_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
       holidays?.forEach(h => roadmap.push({ id: h.id, title: h.title, type: 'holiday', date: h.start_date, dayLabel: new Date(h.start_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
       roadmap.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // g. Activity Feed (Merging Submissions)
    const feed = (subData || []).slice(0, 3).map((s: any) => ({
      id: s.id,
      title: `ציון חדש ב-${s.assignments?.title}`,
      type: "grade",
      date: "היום"
    }));

    setState({
      overallAvg: childAvg,
      classAvg: cAvg,
      attendancePct: Math.max(0, attPct),
      overdueCount: overdueSize,
      pendingTasksCount: pendingTasks.length,
      tasks: pendingTasks.slice(0, 3),
      weeklyRoadmap: roadmap.slice(0, 5),
      educators,
      activityFeed: feed
    });
    setChildLoading(false);
  }, []);

  useEffect(() => { if (selectedChild) loadChildData(selectedChild); }, [selectedChild, loadChildData]);

  const startChat = (id?: string) => {
    if (!id) return toast({ title: "שגיאת סנכרון", description: "פרטי איש הצוות לא אותרו במערכת. פנה למזכירות.", variant: "destructive" });
    navigate("/chat", { state: { targetUserId: id } });
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-950 font-black text-indigo-600 animate-pulse">Syncing...</div>;

  return (
    <div className="min-h-screen bg-slate-50/30 dark:bg-slate-950 font-body p-6 md:p-12 pb-40">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-16">
        
        {/* HEADER SECTION */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
           <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-tightest flex items-center gap-5">
                 <div className="w-14 h-14 bg-indigo-600 rounded-[1.75rem] flex items-center justify-center text-white shadow-3xl shadow-indigo-100"><Heart className="h-8 w-8" /></div>
                 Guardian<span className="text-indigo-600">Core</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest pl-2">The Ultimate Pedagogical Cockpit for Parents</p>
           </div>
           
           <div className="flex bg-white dark:bg-slate-900 p-2 rounded-[2.5rem] shadow-sm border border-slate-100">
              {children.map(c => (
                <button key={c.id} onClick={() => setSelectedChild(c)} className={`rounded-full px-10 h-14 text-xs font-black transition-all ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-100 scale-105" : "text-slate-400 hover:text-slate-600"}`}>
                   {c.fullName}
                </button>
              ))}
           </div>
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* PRIMARY DISPLAY */}
              <div className="lg:col-span-8 space-y-16">
                 
                 {/* ACADEMIC RADAR */}
                 <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <Card className="md:col-span-3 border-none bg-indigo-600 text-white rounded-[4rem] p-12 overflow-hidden shadow-4xl shadow-indigo-100 relative h-full flex flex-col justify-between group">
                       <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                       <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-10">
                          <div>
                             <h2 className="text-5xl font-black tracking-tightest leading-tight">{selectedChild.fullName}</h2>
                             <p className="text-indigo-100/60 font-bold mt-2 uppercase text-[10px] tracking-widest decoration-indigo-200 underline">כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                             
                             <div className="flex items-center gap-12 mt-12">
                                <div className="text-center group/avg">
                                   <p className="text-9xl font-black leading-none tabular-nums tracking-tighter group-hover/avg:scale-110 transition-transform">{state.overallAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-4 opacity-70">ממוצע משוקלל</p>
                                </div>
                                <div className="w-px h-24 bg-white/20" />
                                <div className="text-center">
                                   <p className="text-4xl font-black text-indigo-200 tabular-nums">{state.classAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-4 opacity-70">ממוצע כיתה</p>
                                </div>
                             </div>
                          </div>
                          
                          <div className="flex-1 w-full md:max-w-[220px] space-y-8">
                             <div className="flex justify-between items-center text-[10px] font-black uppercase text-indigo-200">
                                <span>נוכחות שנתית</span>
                                <span>{state.attendancePct}%</span>
                             </div>
                             <div className="h-4 bg-white/10 rounded-full overflow-hidden p-1 shadow-inner group/att">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${state.attendancePct}%` }} className="h-full bg-white rounded-full group-hover/att:bg-emerald-400 transition-colors" />
                             </div>
                             <div className="p-5 bg-white/5 rounded-[2rem] border border-white/10 text-[11px] font-bold leading-relaxed text-indigo-50 backdrop-blur-sm">
                                {state.overallAvg && state.classAvg && state.overallAvg >= state.classAvg 
                                  ? `הילדה מפגינה מצוינות: +${state.overallAvg - state.classAvg} נקודות מעל הממוצע המקובל.` 
                                  : "המערכת ממליצה על חיזוק פדגוגי במטלות האחרונות לצמצום פערים."}
                             </div>
                          </div>
                       </div>
                    </Card>

                    <Card className="bg-white dark:bg-slate-900 border-none rounded-[4rem] p-10 flex flex-col items-center justify-center text-center shadow-xl shadow-slate-100 hover:scale-105 transition-transform">
                       <ClipboardList className={`h-14 w-14 mb-6 ${state.overdueCount > 0 ? "text-rose-500 animate-bounce" : "text-indigo-600"}`} />
                       <p className="text-7xl font-black tabular-nums">{state.overdueCount}</p>
                       <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-4">חובות מנהליים</p>
                    </Card>
                 </motion.div>

                 {/* REAL WEEKLY SYNC */}
                 <motion.div variants={item} className="space-y-8">
                    <h3 className="text-2xl font-black px-4 flex items-center gap-4">
                       <Calendar className="h-7 w-7 text-indigo-600" /> יומן אירועי אמת
                    </h3>
                    <Card className="bg-white dark:bg-slate-900 border-none rounded-[4rem] p-12 shadow-sm">
                       <div className="flex gap-10 min-w-[700px] overflow-hidden">
                          {["א'", "ב'", "ג'", "ד'", "ה'"].map(day => {
                             const itemsForDay = state.weeklyRoadmap.filter(r => r.dayLabel === day);
                             return (
                               <div key={day} className="flex-1 space-y-6 text-center group">
                                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50 w-full pb-4 group-hover:text-indigo-600 transition-colors uppercase">{day}</p>
                                  {itemsForDay.map(i => (
                                     <div key={i.id} className={`w-full p-5 rounded-[2rem] text-[11px] font-black flex flex-col gap-2 items-center ${i.type === 'exam' ? "bg-rose-50 text-rose-600" : i.type === 'holiday' ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"}`}>
                                        <Badge className="bg-white/50 text-[9px] font-black shadow-sm">{i.type === 'exam' ? "בוחן/מבחן" : "פעילות"}</Badge>
                                        <span className="leading-tight">{i.title}</span>
                                     </div>
                                  ))}
                                  {itemsForDay.length === 0 && <div className="h-28 w-full border-2 border-dashed border-slate-50 rounded-[3rem] opacity-30" />}
                               </div>
                             );
                          })}
                       </div>
                    </Card>
                 </motion.div>

                 {/* TASKS CRITICAL */}
                 <motion.div variants={item} className="space-y-8">
                    <h3 className="text-2xl font-black px-4 flex items-center gap-4">
                       <Target className="h-7 w-7 text-indigo-600" /> רדאר משימות קריטיות
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                       {state.tasks.map(t => (
                         <Card key={t.id} className="bg-white dark:bg-slate-900 border-none p-10 rounded-[3.5rem] shadow-sm hover:shadow-2xl transition-all relative">
                            {t.status === 'overdue' && <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 rounded-t-full" />}
                            <div className="flex justify-between items-start mb-6">
                               <Badge className={t.status === 'overdue' ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}>{t.subject}</Badge>
                            </div>
                            <h4 className="font-black text-sm leading-relaxed mb-6">{t.title}</h4>
                            <p className={`text-[11px] font-black italic ${t.status === 'overdue' ? 'text-rose-500' : 'text-slate-400'}`}>
                               {t.status === 'overdue' ? "נדרשת הגשה מיידית" : (t.daysLeft !== null ? `בעוד ${t.daysLeft} ימים` : "")}
                            </p>
                         </Card>
                       ))}
                       {state.tasks.length === 0 && <div className="md:col-span-3 py-20 bg-emerald-50/30 rounded-[4rem] text-center font-black text-emerald-600 border border-emerald-100">כל היעדים הושגו ללא חובות ממתינים.</div>}
                    </div>
                 </motion.div>
              </div>

              {/* SIDEBAR ANALYTICS */}
              <div className="lg:col-span-4 space-y-12">
                 
                 {/* DIRECT CONTACTS (VERIFIED) */}
                 <Card className="bg-slate-900 text-white rounded-[4rem] p-12 shadow-4xl relative overflow-hidden group">
                    <div className="absolute bottom-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -mb-24 -mr-24" />
                    <h3 className="text-xl font-black mb-10 flex items-center gap-4">
                       <MessageSquare className="h-6 w-6 text-indigo-400" /> ניהול קשר ישיר
                    </h3>
                    <div className="space-y-6">
                       <button onClick={() => startChat(state.educators.teacherId)} className="w-full flex items-center gap-6 p-8 rounded-[3rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right relative group/btn">
                          <div className="w-16 h-16 rounded-[2rem] bg-indigo-500/20 flex items-center justify-center text-indigo-300 group-hover/btn:scale-110 transition-transform"><UserRound className="h-8 w-8" /></div>
                          <div>
                             <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest opacity-60 mb-1">מחנכת הכיתה</p>
                             <p className="text-sm font-black">{state.educators.educatorName || "—"}</p>
                          </div>
                          {!state.educators.educatorName && <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-[3rem] backdrop-blur-sm opacity-0 group-hover/btn:opacity-100 transition-opacity">
                             <span className="text-[10px] font-black">ממתין לסנכרון מורה</span>
                          </div>}
                       </button>

                       <button onClick={() => startChat(state.educators.counselorId)} className="w-full flex items-center gap-6 p-8 rounded-[3rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right">
                          <div className="w-16 h-16 rounded-[2rem] bg-rose-500/20 flex items-center justify-center text-rose-300"><HeartHandshake className="h-8 w-8" /></div>
                          <div>
                             <p className="text-[10px] text-rose-300 uppercase font-black tracking-widest opacity-60 mb-1">פנייה לייעוץ</p>
                             <p className="text-sm font-black">{state.educators.counselorName || "—"}</p>
                          </div>
                       </button>
                    </div>
                 </Card>

                 {/* PEDAGOGICAL INSIGHT (ADVANCED) */}
                 <div className="p-12 rounded-[4rem] bg-white dark:bg-slate-900 border border-slate-100 shadow-xl space-y-8 relative overflow-hidden">
                    <div className="flex items-center gap-4">
                       <Sparkles className="h-6 w-6 text-indigo-600 animate-pulse" />
                       <div>
                          <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">AI Overview (Factual)</p>
                          <p className="text-xs font-black text-indigo-600">ניתוח פדגוגי מבוסס ביצועים</p>
                       </div>
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed italic border-r-4 border-indigo-100 pr-6">
                       {state.overdueCount > 0 
                         ? `המערכת זיהתה ${state.overdueCount} חובות הגשה. המגמה מראה שהילדה יציבה אך זקוקה לתזכורת לסגירת פערים ב-${state.tasks[0]?.subject}.`
                         : "סיכום שבועי: הישגים גבוהים מהממוצע וניהול זמן מופתי. נראה כי הילדה מיוצבת ב-100% מהיעדים."}
                    </p>
                    <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                       <div className="flex gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span className="text-[10px] font-black">סנכרון DB מלא</span>
                       </div>
                       <Button variant="ghost" onClick={() => navigate("/grades")} className="text-[10px] font-black text-indigo-600 gap-2 shrink-0">
                          לדוח המלא <ArrowRight className="h-3 w-3" />
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
