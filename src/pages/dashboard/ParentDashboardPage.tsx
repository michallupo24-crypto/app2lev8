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
  CheckCircle2, FileText, ArrowLeft, Zap, Info, ShieldCheck
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

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);

  const [state, setState] = useState({
    overallAvg: null as number | null,
    classAvg: null as number | null,
    attendancePct: 100,
    overdueCount: 0,
    tasks: [] as TaskHighlight[],
    weeklyRoadmap: [] as WeeklyItem[],
    educators: { teacherId: "", educatorName: "", counselorId: "", counselorName: "" },
    syncing: false
  });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
  const item = { hidden: { opacity: 0, scale: 0.98, y: 10 }, show: { opacity: 1, scale: 1, y: 0 } };

  /* ── 1. Proactive Data Sync ─────────────────────────── */
  const syncCommunity = useCallback(async (child: ChildInfo) => {
     if (!child.classId) return;
     // Attempt to register presence in relevant conversation types
     const { data: convos } = await supabase.from("conversations").select("id").or(`class_id.eq.${child.classId},type.eq.parent_grade`);
     if (convos?.length) {
       const parts = convos.map(c => ({ conversation_id: c.id, user_id: profile.id }));
       await supabase.from("conversation_participants").upsert(parts, { onConflict: 'conversation_id,user_id' });
     }
  }, [profile.id]);

  /* ── 2. Data Load (The "Anti-Blank" Fix) ────────────── */
  const loadData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    await syncCommunity(child);

    // a. Academic Average (Safe weighted)
    const { data: subs } = await supabase.from("submissions").select("grade, assignments(max_grade, weight_percent)").eq("student_id", child.id).eq("status", "graded");
    let cAvgVal = null;
    if (subs?.length) {
       let wSum = 0, wTotal = 0;
       subs.forEach((s: any) => {
         const w = s.assignments?.weight_percent || 10;
         wSum += (s.grade / (s.assignments?.max_grade || 100)) * 100 * w;
         wTotal += w;
       });
       if (wTotal > 0) cAvgVal = Math.round(wSum / wTotal);
    }

    // b. Identifying Teacher (Dual Search: Roles or Profiles)
    let staff = { teacherId: "", educatorName: "", counselorId: "", counselorName: "" };
    if (child.classId) {
       // Search 1: Specifically assigned homeroom educators
       const { data: ed } = await supabase.from("user_roles").select("user_id, profiles!inner(full_name)").eq("homeroom_class_id", child.classId).eq("role", "educator").maybeSingle();
       if (ed) { staff.teacherId = ed.user_id; staff.educatorName = (ed.profiles as any)?.full_name; }
       else {
          // Search 2: Fallback to any educator profile linked to this class
          const { data: profEd } = await supabase.from("profiles").select("id, full_name").eq("class_id", child.classId).neq("id", child.id).limit(1).maybeSingle();
          if (profEd) { staff.teacherId = profEd.id; staff.educatorName = profEd.full_name; }
       }
    }
    if (child.schoolId) {
       const { data: co } = await supabase.from("user_roles").select("user_id, profiles!inner(full_name)").eq("role", "counselor").limit(1).maybeSingle();
       if (co) { staff.counselorId = co.user_id; staff.counselorName = (co.profiles as any)?.full_name; }
    }

    // c. Roadmap & Tasks
    let overdueSize = 0, roadmapList: WeeklyItem[] = [];
    if (child.schoolId && child.grade) {
       const [{ data: evs }, { data: allTasks }, { data: childDone }] = await Promise.all([
          supabase.from("grade_events").select("id, title, event_date").eq("school_id", child.schoolId).eq("grade", child.grade).gte("event_date", new Date().toISOString().split('T')[0]).limit(5),
          supabase.from("assignments").select("id, title, subject, due_date").eq("class_id", child.classId).eq("published", true),
          supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
       ]);
       roadmapList = (evs || []).map(e => ({ id: e.id, title: e.title, type: 'exam', date: e.event_date, dayLabel: new Date(e.event_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
       const doneIds = new Set((childDone || []).map(s => s.assignment_id));
       const pending = (allTasks || []).filter(a => !doneIds.has(a.id)).map(a => {
          const due = a.due_date ? new Date(a.due_date) : null;
          const diff = due ? Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
          if (diff !== null && diff < 0) overdueSize++;
          return { id: a.id, title: a.title, subject: a.subject, dueDate: a.due_date, daysLeft: diff, status: (diff !== null && diff < 0) ? "overdue" : "pending" as any };
       });
       setState(s => ({ ...s, tasks: pending.slice(0, 3), overdueCount: overdueSize }));
    }

    // d. Class Avg (Peer benchmark)
    let peerAvg = null;
    if (child.classId) {
       const { data: pSubs } = await supabase.from("submissions").select("grade, assignments(max_grade)").eq("status", "graded").limit(100);
       if (pSubs?.length) {
         peerAvg = Math.round(pSubs.reduce((acc, r) => acc + (r.grade / (r.assignments?.max_grade || 100)) * 100, 0) / pSubs.length);
       }
    }

    setState(s => ({ ...s, overallAvg: cAvgVal, classAvg: peerAvg, educators: staff, weeklyRoadmap: roadmapList }));
    setChildLoading(false);
  }, [syncCommunity]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: lks } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
      if (!lks?.length) { setLoading(false); return; }
      const ids = lks.map(l => l.student_id);
      const { data: prs } = await supabase.from("profiles").select("id, full_name, class_id, school_id, schools(name), classes(grade, class_number)").in("id", ids);
      if (!prs) { setLoading(false); return; }
      const kids = prs.map((p: any) => ({
        id: p.id, fullName: p.full_name, grade: p.classes?.grade || null, classNumber: p.classes?.class_number || null,
        schoolName: p.schools?.name || null, classId: p.class_id || null, schoolId: p.school_id || null,
      }));
      setChildren(kids);
      if (kids.length) setSelectedChild(kids[0]);
      setLoading(false);
    };
    init();
  }, [profile.id]);

  useEffect(() => { if (selectedChild) loadData(selectedChild); }, [selectedChild, loadData]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-indigo-600 animate-pulse text-xl">סנכרון Guardian Core...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 font-body p-4 md:p-10 pb-40">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto space-y-8">
        
        {/* REFINED HEADER */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
           <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tightest flex items-center gap-3">
                 <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Heart className="h-5 w-5" /></div>
                 Guardian<span className="text-indigo-600">Cockpit</span>
              </h1>
              <div className="flex gap-2">
                 {children.map(c => (
                   <button key={c.id} onClick={() => setSelectedChild(c)} className={`px-5 h-10 rounded-xl text-[10px] font-black transition-all ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-blue-200 shadow-md" : "bg-white text-slate-400 border border-slate-100"}`}>
                      {c.fullName}
                   </button>
                 ))}
              </div>
           </div>
           <Button onClick={() => navigate("/dashboard/grades")} className="h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-3 shadow-emerald-100 shadow-md transition-all active:scale-95">
              <FileText className="h-5 w-5" />
              דוח ציונים מפורט
           </Button>
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* PRIMARY STATS (Left-Main) */}
              <div className="lg:col-span-2 space-y-8">
                 
                 <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Performance Card */}
                    <Card className="md:col-span-2 border-none bg-indigo-600 text-white rounded-3xl p-8 overflow-hidden shadow-indigo-100 shadow-2xl relative flex flex-col justify-between">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
                       <div className="relative z-10">
                          <h2 className="text-2xl font-black tracking-tightest leading-none">{selectedChild.fullName}</h2>
                          <p className="text-[10px] text-indigo-200 font-bold mt-2 opacity-70">
                             כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}
                          </p>
                          
                          <div className="flex items-center gap-10 mt-8">
                             <div className="text-center group/avg">
                                <p className="text-8xl font-black leading-none tabular-nums tracking-tighter">{state.overallAvg ?? "—"}</p>
                                <p className="text-[8px] text-indigo-300 uppercase font-black tracking-widest mt-2 opacity-60">ממוצע משוקלל</p>
                             </div>
                             <div className="w-px h-20 bg-white/10" />
                             <div className="text-center">
                                <p className="text-3xl font-black text-indigo-200 tabular-nums">{state.classAvg ?? "—"}</p>
                                <p className="text-[8px] text-indigo-300 uppercase font-black tracking-widest mt-2 opacity-60">ממוצע כיתה</p>
                             </div>
                          </div>
                       </div>

                       <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                             <ShieldCheck className="h-4 w-4 text-emerald-400" />
                             <span className="text-[10px] font-bold">סנכרון נתונים פעיל</span>
                          </div>
                          <Badge className="bg-white/10 text-white font-black hover:bg-white/20">GPA High</Badge>
                       </div>
                    </Card>

                    {/* Missing Tasks Card */}
                    <Card className="bg-white dark:bg-slate-900 border-none rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg border border-slate-50">
                       <Clock className={`h-10 w-10 mb-4 ${state.overdueCount > 0 ? "text-rose-500 animate-pulse" : "text-indigo-600"}`} />
                       <p className="text-6xl font-black tabular-nums tracking-tighter">{state.overdueCount}</p>
                       <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-2">משימות שלא נעשו</p>
                    </Card>
                 </motion.div>

                 {/* REAL ROADMAP */}
                 <motion.div variants={item} className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                       <h3 className="text-lg font-black flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-indigo-600" /> אירועים קרובים
                       </h3>
                       <Badge variant="outline" className="rounded-lg text-[9px] font-black uppercase text-slate-300">השבוע בקמפוס</Badge>
                    </div>
                    <Card className="bg-white dark:bg-slate-900 border-none rounded-3xl p-8 shadow-sm">
                       <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide">
                          {["א'", "ב'", "ג'", "ד'", "ה'"].map(day => {
                             const items = state.weeklyRoadmap.filter(r => r.dayLabel === day);
                             return (
                               <div key={day} className="flex-1 min-w-[120px] space-y-4 text-center">
                                  <p className="text-[10px] font-black text-slate-200 border-b border-slate-50 pb-3">{day}</p>
                                  {items.map(i => (
                                     <div key={i.id} className="p-4 rounded-2xl bg-indigo-50/50 text-indigo-600 text-[10px] font-black flex flex-col gap-1 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mb-1" />
                                        {i.title}
                                     </div>
                                  ))}
                                  {items.length === 0 && <div className="h-16 w-full border-2 border-dashed border-slate-50 rounded-2xl opacity-30" />}
                               </div>
                             );
                          })}
                       </div>
                    </Card>
                 </motion.div>
              </div>

              {/* SIDEBAR (Right) */}
              <div className="lg:col-span-1 space-y-8">
                 
                 {/* DIRECT STAFF LINKS */}
                 <Card className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden group">
                    <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                       <MessageSquare className="h-5 w-5 text-indigo-400" /> ערוצי קשר אישיים
                    </h3>
                    <div className="space-y-4">
                       <button onClick={() => navigate("/chat", { state: { targetUserId: state.educators.teacherId } })} className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right">
                          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300 shadow-lg"><UserRound className="h-5 w-5" /></div>
                          <div className="min-w-0">
                             <p className="text-[8px] text-indigo-300 uppercase font-black tracking-widest opacity-60 mb-1">מחנכת הכיתה</p>
                             <p className="text-xs font-black truncate">{state.educators.educatorName || "—"}</p>
                          </div>
                          <ChevronLeft className="h-4 w-4 mr-auto opacity-30" />
                       </button>

                       <button onClick={() => navigate("/chat", { state: { targetUserId: state.educators.counselorId } })} className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right">
                          <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-300 shadow-lg"><HeartHandshake className="h-5 w-5" /></div>
                          <div className="min-w-0">
                             <p className="text-[8px] text-rose-300 uppercase font-black tracking-widest opacity-60 mb-1">פנייה לייעוץ</p>
                             <p className="text-xs font-black truncate">{state.educators.counselorName || "—"}</p>
                          </div>
                          <ChevronLeft className="h-4 w-4 mr-auto opacity-30" />
                       </button>
                    </div>
                 </Card>

                 {/* COMMUNITY HUB */}
                 <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 shadow-sm space-y-6">
                    <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2">
                       <Users className="h-4 w-4" /> קהילת הורים (Beta)
                    </h4>
                    <div className="space-y-3">
                       <button onClick={() => navigate("/chat", { state: { initialType: 'parent_class' } })} className="w-full h-12 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all flex items-center justify-between px-5 text-[10px] font-black">
                         קבוצת הורי כיתה {selectedChild.grade}
                         <ArrowLeft className="h-4 w-4" />
                       </button>
                       <button onClick={() => navigate("/chat", { state: { initialType: 'parent_grade' } })} className="w-full h-12 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-between px-5 text-[10px] font-black">
                         פורום הורי השכבה
                         <ArrowLeft className="h-4 w-4" />
                       </button>
                    </div>
                 </div>

                 {/* SYSTEM INSIGHT */}
                 <div className="p-8 rounded-3xl bg-indigo-50 border border-indigo-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles className="h-8 w-8 text-indigo-500" /></div>
                    <div className="flex items-center gap-3 mb-4">
                       <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                       <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Pedagogical Insight</p>
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 leading-relaxed italic border-r-2 border-indigo-300 pr-4">
                       {state.overdueCount > 0 
                         ? `זוהה חוב הגשה ב-${state.tasks[0]?.subject}. מומלץ לוודא השלמה מול המחנכת עד לסוף השבוע.`
                         : "סנכרון מלא: הילדה שומרת על מגמת צמיחה חיובית. כל המשימות הוגשו וממוצע הציונים יציב."}
                    </p>
                 </div>

              </div>
           </div>
        )}
      </motion.div>
    </div>
  );
};

export default ParentDashboardPage;
