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
  ArrowUpRight, Activity, Percent
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

interface RealActivity {
  id: string;
  title: string;
  timestamp: string;
  type: "grade" | "attendance" | "note";
  date: Date;
}

interface DashboardState {
  overallAvg: number | null;
  classAvg: number | null;
  attendancePct: number;
  pendingTasksCount: number;
  tasks: TaskHighlight[];
  weeklyEvents: { id: string; title: string; day: string }[];
  educators: { teacherId?: string; educatorName?: string; counselorId?: string; counselorName?: string };
  activityFeed: RealActivity[];
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
    pendingTasksCount: 0,
    tasks: [],
    weeklyEvents: [],
    educators: {},
    activityFeed: []
  });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  /* ── Initial Load: Children (100% Real) ──────────────── */
  useEffect(() => {
    const loadIds = async () => {
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
        schoolId: p.school_id || null,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    loadIds();
  }, [profile.id]);

  /* ── Child Pulse Loader (The Smarter System) ──────────── */
  const loadChildData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    
    // 1. Child Average
    const { data: childSubs } = await supabase.from("submissions").select("grade, assignments(max_grade)").eq("student_id", child.id).eq("status", "graded");
    const childAvg = childSubs?.length ? Math.round(childSubs.reduce((s, row) => s + (row.grade / (row.assignments?.max_grade || 100)) * 100, 0) / childSubs.length) : null;

    // 2. CLASS AVERAGE (Comparative Data)
    let classAvgResult = null;
    if (child.classId) {
       // Query all submissions for assignments belonging to the child's class
       const { data: cAssignments } = await supabase.from("assignments").select("id").eq("class_id", child.classId);
       if (cAssignments && cAssignments.length > 0) {
          const aIds = cAssignments.map(a => a.id);
          const { data: classSubs } = await supabase.from("submissions").select("grade, assignments(max_grade)").in("assignment_id", aIds).eq("status", "graded");
          if (classSubs && classSubs.length > 0) {
             classAvgResult = Math.round(classSubs.reduce((s, row) => s + (row.grade / (row.assignments?.max_grade || 100)) * 100, 0) / classSubs.length);
          }
       }
    }

    // 3. Real Attendance
    const { data: att } = await supabase.from("attendance").select("status, created_at").eq("student_id", child.id);
    const attPct = att?.length ? Math.round(((att.length - att.filter(a => a.status === "absent").length) / att.length) * 100) : 100;

    // 4. Real Active Deadlines
    let realTasks: TaskHighlight[] = [];
    if (child.classId) {
      const [{ data: assigns }, { data: done }] = await Promise.all([
        supabase.from("assignments").select("id, title, subject, due_date").eq("class_id", child.classId).eq("published", true).order("due_date", { ascending: true }),
        supabase.from("submissions").select("assignment_id").eq("student_id", child.id)
      ]);
      const doneIds = new Set((done || []).map(d => d.assignment_id));
      realTasks = (assigns || [])
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

    // 5. Real Educators Identification
    let educators: DashboardState["educators"] = {};
    if (child.classId) {
       // Search for the educator that is assigned to this class
       const { data: teacherProf } = await supabase.from("profiles").select("id, full_name").eq("class_id", child.classId).maybeSingle();
       if (teacherProf) educators = { teacherId: teacherProf.id, educatorName: teacherProf.full_name };
    }
    if (child.schoolId) {
       // Search for the counselor in the school
       const { data: counselProf } = await supabase.from("profiles").select("id, full_name").eq("school_id", child.schoolId).contains("roles", ["counselor"]).limit(1).maybeSingle();
       if (counselProf) { educators.counselorId = counselProf.id; educators.counselorName = counselProf.full_name; }
    }

    // 6. Activity Feed
    const feed: RealActivity[] = [];
    (childSubs || []).slice(0, 3).forEach((s: any) => {
       feed.push({ id: `sub-${s.id}`, title: `ציון ${s.grade} ב-${s.assignments?.title || "משימה"}`, type: "grade", date: new Date(), timestamp: "היום" });
    });
    (att || []).filter(a => a.status !== "present").slice(0, 3).forEach((a: any) => {
       feed.push({ id: `att-${a.id}`, title: `דווח אירוע נוכחות ביומן`, type: "attendance", date: new Date(a.created_at), timestamp: new Date(a.created_at).toLocaleDateString("he-IL") });
    });

    setState({
      overallAvg: childAvg,
      classAvg: classAvgResult,
      attendancePct: attPct,
      pendingTasksCount: realTasks.length,
      tasks: realTasks.slice(0, 3),
      weeklyEvents: [], // Filter real lessons here if needed
      educators,
      activityFeed: feed.slice(0, 5)
    });
    setChildLoading(false);
  }, []);

  useEffect(() => { if (selectedChild) loadChildData(selectedChild); }, [selectedChild, loadChildData]);

  const openTalk = (staffId?: string, type: string = "teacher") => {
    if (!staffId) return toast({ title: "מידע חסר", description: `לא הוגדרה ${type === "teacher" ? "מחנכת" : "יועצת"} במערכת עבור כיתה זו.` });
    navigate("/chat", { state: { targetUserId: staffId, initialType: type === "teacher" ? "parent_teacher" : "counseling" } });
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-100 font-heading text-indigo-600">Loading Academic History...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-body p-6 md:p-12">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-12">
        
        {/* HEADER */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
           <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-4">
                 <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><Users className="h-6 w-6" /></div>
                 Guardian<span className="text-indigo-600">Perspective</span>
              </h1>
              <p className="text-xs text-slate-400 font-black uppercase tracking-widest mt-2">Real Performance Context</p>
           </div>
           {children.length > 1 && (
             <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm">
                {children.map(c => (
                  <Button key={c.id} variant={selectedChild?.id === c.id ? "default" : "ghost"} onClick={() => setSelectedChild(c)} className="rounded-xl px-8 h-12 text-xs font-bold">
                     {c.fullName}
                  </Button>
                ))}
             </div>
           )}
        </motion.div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* PRIMARY COLUMN */}
              <div className="lg:col-span-8 space-y-12">
                 
                 {/* COMPARATIVE CARD */}
                 <motion.div variants={item}>
                    <Card className="border-none bg-indigo-600 text-white rounded-[3.5rem] p-12 overflow-hidden shadow-2xl relative">
                       <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                          <div className="space-y-6">
                             <h2 className="text-4xl font-black">{selectedChild.fullName}</h2>
                             <p className="text-indigo-100/60 font-bold italic underline decoration-indigo-300">כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                             
                             <div className="flex items-center gap-8 pt-4">
                                <div className="text-center">
                                   <p className="text-8xl font-black tabular-nums tracking-tighter">{state.overallAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-2">ממוצע שלר</p>
                                </div>
                                <div className="w-px h-16 bg-white/20" />
                                <div className="text-center">
                                   <p className="text-4xl font-black text-indigo-200 tabular-nums">{state.classAvg ?? "—"}</p>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mt-2">ממוצע כיתה</p>
                                </div>
                             </div>
                          </div>
                          
                          <div className="flex-1 w-full md:max-w-xs space-y-6">
                             <div className="flex justify-between text-xs font-black">
                                <span>נוכחות</span>
                                <span>{state.attendancePct}%</span>
                             </div>
                             <div className="h-3 bg-white/10 rounded-full overflow-hidden p-1 shadow-inner">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${state.attendancePct}%` }} className="h-full bg-white rounded-full" />
                             </div>
                             {state.overallAvg && state.classAvg && (
                               <div className="p-4 bg-white/5 rounded-3xl border border-white/10 text-xs font-black text-indigo-100">
                                  {state.overallAvg >= state.classAvg 
                                    ? `נמצא כרגע ב-+${state.overallAvg - state.classAvg} מעל ממוצע הכיתה.` 
                                    : `חסרים ${state.classAvg - state.overallAvg} נקודות להגעה לממוצע הכיתה.`}
                               </div>
                             )}
                          </div>
                       </div>
                    </Card>
                 </motion.div>

                 {/* ACTIVE TASKS */}
                 <motion.div variants={item} className="space-y-6">
                    <h3 className="text-xl font-black px-4 flex items-center gap-3">
                       <Target className="h-6 w-6 text-indigo-600" /> משימות להגשה (Real Deadlines)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       {state.tasks.map(t => (
                         <Card key={t.id} className="bg-white dark:bg-slate-900 border-none p-8 rounded-[2.5rem] shadow-sm space-y-4">
                            <div className="flex justify-between">
                               <Badge className={t.status === "overdue" ? "bg-rose-50 text-rose-600" : "bg-slate-50"}>
                                  {t.status === "overdue" ? "חלף" : "בקרוב"}
                               </Badge>
                               <span className="text-[10px] text-slate-300 font-black uppercase">{t.subject}</span>
                            </div>
                            <h4 className="font-black text-sm">{t.title}</h4>
                            <p className="text-[10px] text-indigo-500 font-bold italic">{t.status === "overdue" ? "משימה באיחור" : `נותרו ${t.daysLeft} ימים`}</p>
                         </Card>
                       ))}
                       {state.tasks.length === 0 && (
                          <div className="md:col-span-3 py-10 text-center border border-dashed border-slate-200 rounded-3xl text-slate-400 font-black italic">כל המשימות הוגשו כנדרש.</div>
                       )}
                    </div>
                 </motion.div>

                 {/* REAL ACTIVITY */}
                 <motion.div variants={item} className="space-y-6">
                    <h3 className="text-xl font-black px-4 flex items-center gap-3">
                       <Activity className="h-6 w-6 text-indigo-600" /> פעילות אחרונה
                    </h3>
                    <div className="space-y-3">
                       {state.activityFeed.map(act => (
                          <div key={act.id} className="p-5 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm border border-slate-50 flex items-center gap-6">
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${act.type === 'grade' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                                {act.type === 'grade' ? <TrendingUp className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                             </div>
                             <div className="flex-1">
                                <p className="text-sm font-black">{act.title}</p>
                                <p className="text-[10px] text-slate-400 font-bold italic">{act.timestamp}</p>
                             </div>
                          </div>
                       ))}
                       {state.activityFeed.length === 0 && <p className="text-center py-6 text-slate-300 italic font-black">אין פעילות מתועדת מהימים האחרונים.</p>}
                    </div>
                 </motion.div>
              </div>

              {/* CHANNELS AND COMM */}
              <div className="lg:col-span-4 space-y-10">
                 
                 <Card className="bg-slate-900 text-white rounded-[3.5rem] p-10 shadow-2xl relative overflow-hidden">
                    <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                       <MessageSquare className="h-6 w-6 text-indigo-400" /> ניהול קשר ישיר
                    </h3>
                    <div className="space-y-4">
                       <button onClick={() => openTalk(state.educators.teacherId, "teacher")} className="w-full flex items-center gap-5 p-6 rounded-[2.5rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-300"><UserRound className="h-7 w-7" /></div>
                          <div>
                             <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest opacity-60 mb-1">מחנכת הכיתה</p>
                             <p className="text-sm font-black">{state.educators.educatorName || "לא הוגדרה מחנכת"}</p>
                          </div>
                          <ChevronLeft className="h-6 w-6 mr-auto opacity-30" />
                       </button>

                       <button onClick={() => openTalk(state.educators.counselorId, "counselor")} className="w-full flex items-center gap-5 p-6 rounded-[2.5rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right">
                          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 flex items-center justify-center text-rose-300"><HeartHandshake className="h-7 w-7" /></div>
                          <div>
                             <p className="text-[10px] text-rose-300 uppercase font-black tracking-widest opacity-60 mb-1">פנייה לייעוץ</p>
                             <p className="text-sm font-black">{state.educators.counselorName || "לא הוגדרה יועצת"}</p>
                          </div>
                          <ChevronLeft className="h-5 w-5 mr-auto opacity-30" />
                       </button>
                    </div>
                 </Card>

                 {/* REAL COMMUNITY */}
                 <div className="p-8 rounded-[3rem] bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-white/5 space-y-6">
                    <h4 className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">מעגלי הורים</h4>
                    <div className="space-y-4">
                       <div onClick={() => navigate("/community")} className="p-4 bg-white dark:bg-slate-900 rounded-3xl text-[10px] font-black shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                          קהילת הורי כיתה {selectedChild.grade} פעילה. לחצו למעבר לפורומים, סקרים ועדכונים.
                       </div>
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
