import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, TrendingUp, BookOpen, Clock, MessageSquare, 
  Calendar, Heart, Target, ChevronLeft, UserRound,
  HeartHandshake, ClipboardList, Sparkles, Activity, Percent, ArrowRight,
  CheckCircle2, FileText, ArrowLeft, Zap, Info, ShieldCheck,
  ChevronRight, Award, GraduationCap, XCircle, CalendarDays
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

interface WeeklyItem {
  id: string;
  title: string;
  type: 'exam' | 'holiday' | 'event';
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
    absentCount: 0,
    overdueCount: 0,
    weeklyRoadmap: [] as WeeklyItem[],
    educators: { teacherId: "", educatorName: "", counselorId: "", counselorName: "" },
  });

  const loadData = useCallback(async (child: ChildInfo) => {
    setChildLoading(true);
    
    // a. Academic Benchmarks (Safe calculation)
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

    // b. PEER Class Average (Filtered by ClassId)
    let peerAvg = null;
    if (child.classId) {
       const { data: pSubs } = await supabase.from("submissions")
         .select("grade, assignments!inner(max_grade, class_id)")
         .eq("assignments.class_id", child.classId)
         .eq("status", "graded");
       if (pSubs?.length) {
         peerAvg = Math.round(pSubs.reduce((acc, r) => acc + (r.grade / (r.assignments?.max_grade || 100)) * 100, 0) / pSubs.length);
       }
    }

    // c. Educator Check
    let staff = { teacherId: "", educatorName: "", counselorId: "", counselorName: "" };
    if (child.classId) {
       const { data: ed } = await supabase.from("user_roles").select("user_id").eq("homeroom_class_id", child.classId).eq("role", "educator").maybeSingle();
       if (ed) {
          staff.teacherId = ed.user_id;
          const { data: p } = await supabase.from("profiles").select("full_name").eq("id", ed.user_id).maybeSingle();
          if (p) staff.educatorName = p.full_name;
       }
    }

    // d. Calendar Merge (Exams + School Holidays)
    const [{ data: evs }, { data: hl }, { data: allAssigns }, { data: childSubs }, { data: attHistory }] = await Promise.all([
       supabase.from("grade_events").select("id, title, event_date").eq("school_id", child.schoolId).eq("grade", child.grade).gte("event_date", new Date().toISOString().split('T')[0]).limit(4),
       supabase.from("school_events").select("id, title, start_date").eq("is_holiday", true).gte("start_date", new Date().toISOString().split('T')[0]).limit(4),
       supabase.from("assignments").select("id").eq("class_id", child.classId).eq("published", true),
       supabase.from("submissions").select("assignment_id").eq("student_id", child.id),
       supabase.from("attendance").select("status").eq("student_id", child.id)
    ]);

    const combinedRoadmap: WeeklyItem[] = [];
    evs?.forEach(e => combinedRoadmap.push({ id: e.id, title: e.title, type: 'exam', date: e.event_date, dayLabel: new Date(e.event_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
    hl?.forEach(h => combinedRoadmap.push({ id: h.id, title: h.title, type: 'holiday', date: h.start_date, dayLabel: new Date(h.start_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
    combinedRoadmap.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const doneIds = new Set((childSubs || []).map(s => s.assignment_id));
    const overdueCount = (allAssigns || []).filter(a => !doneIds.has(a.id)).length;
    
    // Attendance Facts
    const absences = (attHistory || []).filter(a => a.status === "absent").length;
    const attPercent = attHistory?.length ? Math.round(((attHistory.length - absences) / attHistory.length) * 100) : 100;

    setState(s => ({
      ...s,
      overallAvg: cAvgVal,
      classAvg: peerAvg,
      attendancePct: attPercent,
      absentCount: absences,
      overdueCount,
      weeklyRoadmap: combinedRoadmap.slice(0, 5),
      educators: staff
    }));
    setChildLoading(false);
  }, []);

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

  if (loading) return <div className="h-screen flex items-center justify-center font-black text-indigo-600 animate-pulse text-xl">Guardian Core Sync...</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-8 pb-32" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
           <div className="space-y-4 text-right">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-4">
                 <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Heart className="h-6 w-6" /></div>
                 Guardian<span className="text-indigo-600">Cockpit</span>
              </h1>
              <div className="flex flex-wrap gap-3">
                 {children.map(c => (
                   <button key={c.id} onClick={() => setSelectedChild(c)} className={`px-6 py-2 rounded-xl text-xs font-black transition-all border ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border-slate-100"}`}>
                      {c.fullName}
                   </button>
                 ))}
              </div>
           </div>
           <Button onClick={() => navigate("/dashboard/grades")} className="w-full md:w-auto h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-3 shadow-lg">
              <FileText className="h-5 w-5" />ממשק דוחות וציונים
           </Button>
        </div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* MAIN CONTENT */}
              <div className="lg:col-span-2 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Performance Card */}
                    <Card className="border-none bg-indigo-600 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between group">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
                       <div className="relative z-10 space-y-6 text-right">
                          <div>
                             <h2 className="text-2xl font-black">{selectedChild.fullName}</h2>
                             <p className="text-[10px] text-indigo-100 font-bold opacity-70">כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                          </div>
                          <div className="flex items-center gap-10">
                             <div className="text-center">
                                <p className="text-7xl font-black tabular-nums">{state.overallAvg ?? "—"}</p>
                                <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300">GPA משוקלל</p>
                             </div>
                             <div className="w-px h-16 bg-white/10" />
                             <div className="text-center">
                                <p className="text-3xl font-black text-indigo-200 tabular-nums">{state.classAvg ?? "—"}</p>
                                <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300">ממוצע כיתה</p>
                             </div>
                          </div>
                       </div>
                    </Card>

                    <div className="grid grid-cols-2 gap-6">
                       <Card className="bg-white dark:bg-slate-900 border-none rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                          <XCircle className={`h-8 w-8 mb-4 ${state.absentCount > 0 ? "text-rose-500" : "text-indigo-400"}`} />
                          <p className="text-5xl font-black tabular-nums">{state.absentCount}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-2">היעדרויות סה"כ</p>
                       </Card>
                       <Card className="bg-white dark:bg-slate-900 border-none rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                          <Percent className="h-8 w-8 mb-4 text-emerald-500" />
                          <p className="text-5xl font-black tabular-nums">{state.attendancePct}%</p>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-2">נוכחות שנתית</p>
                       </Card>
                    </div>
                 </div>

                 {/* CALENDAR */}
                 <div className="space-y-4">
                    <h3 className="text-lg font-black flex items-center gap-3 px-2 text-right">
                       <CalendarDays className="h-5 w-5 text-indigo-600" /> מבחנים, חגים ואירועים (סינכרון מלא)
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2">
                       {["א'", "ב'", "ג'", "ד'", "ה'"].map(day => {
                          const items = state.weeklyRoadmap.filter(r => r.dayLabel === day);
                          return (
                            <div key={day} className="flex-none w-40 space-y-3">
                               <p className="text-[11px] font-black text-slate-300 border-b border-slate-100 pb-2 text-center">{day}</p>
                               {items.map(i => (
                                 <div key={i.id} className={`p-4 rounded-2xl text-[10px] font-bold text-center leading-tight border ${i.type === 'exam' ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"}`}>
                                    {i.title}
                                 </div>
                               ))}
                               {items.length === 0 && <div className="h-20 w-full border-2 border-dashed border-slate-50 rounded-2xl opacity-40" />}
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>

              {/* SIDEBAR */}
              <div className="space-y-8">
                 <Card className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
                    <h3 className="text-lg font-black mb-8 text-right">קשר ישיר לצוות</h3>
                    <div className="space-y-4">
                       <button onClick={() => navigate("/dashboard/chat", { state: { targetUserId: state.educators.teacherId } })} className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300"><UserRound className="h-5 w-5" /></div>
                          <div className="flex-1 text-right">
                             <p className="text-[8px] text-indigo-400 uppercase font-black tracking-widest mb-1">מחנכת הכיתה</p>
                             <p className="text-sm font-black">{state.educators.educatorName || "—"}</p>
                          </div>
                          <ChevronLeft className="h-4 w-4 opacity-30" />
                       </button>
                    </div>
                 </Card>

                 <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 shadow-sm space-y-6">
                    <h4 className="text-[11px] font-black uppercase text-indigo-600 tracking-widest text-right">קהילת הורים</h4>
                    <div className="space-y-3">
                       <button onClick={() => navigate("/dashboard/chat", { state: { initialType: 'parent_class' } })} className="w-full h-14 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all flex items-center justify-between px-6 text-[10px] font-black border border-slate-100">
                         קבוצת הורי כיתה {selectedChild.grade}'{selectedChild.classNumber}
                         <ArrowLeft className="h-4 w-4 text-indigo-600" />
                       </button>
                       <button onClick={() => navigate("/dashboard/chat", { state: { initialType: 'parent_grade' } })} className="w-full h-14 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-between px-6 text-[10px] font-black">
                         פורום הורי שכבת {selectedChild.grade}
                         <ArrowLeft className="h-4 w-4 text-indigo-600" />
                       </button>
                    </div>
                 </div>

                 <div className="p-8 rounded-3xl bg-indigo-50 border border-indigo-100 shadow-sm text-right">
                    <div className="flex items-center gap-3 mb-4 justify-end">
                       <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">תובנות פדגוגיות</p>
                       <Sparkles className="h-4 w-4 text-indigo-600 animate-bounce" />
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed italic border-r-2 border-indigo-300 pr-5">
                       {state.overdueCount > 0 
                         ? `נמצאו מטלות להשלמה. מראה נוכחות של ${state.attendancePct}% מעיד על רמת מעורבות טובה.`
                         : "סנכרון מלא: כל המבחנים והאירועים מופיעים בלוח."}
                    </p>
                 </div>
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default ParentDashboardPage;
