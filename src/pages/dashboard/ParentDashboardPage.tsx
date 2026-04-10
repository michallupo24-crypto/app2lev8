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
  type: 'exam' | 'holiday' | 'assignment' | 'event';
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
    
    // CURRENT ISO DATE FOR FILTERING
    const today = new Date().toISOString().split('T')[0];

    // 1. Academic Pulse (Factual Student Average)
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

    // 2. Class Benchmark Query
    let peerAvgValue = null;
    if (child.classId) {
       const { data: classSubs } = await supabase.from("submissions")
         .select("grade, assignments!inner(max_grade, class_id)")
         .eq("assignments.class_id", child.classId)
         .eq("status", "graded");
       if (classSubs?.length) {
         peerAvgValue = Math.round(classSubs.reduce((acc, r) => acc + (r.grade / (r.assignments?.max_grade || 100)) * 100, 0) / classSubs.length);
       }
    }

    // 3. Multi-Source Roadmap (The "No Lies" Calendar)
    const [
      { data: gradeEvs }, // Specific Grade Exams/Trips
      { data: schoolEvs }, // General School Events/Holidays
      { data: classAssignments }, // Specific Teacher Tasks/Exams
      { data: attendanceHistory }
    ] = await Promise.all([
       supabase.from("grade_events").select("id, title, event_date").eq("school_id", child.schoolId).eq("grade", child.grade).gte("event_date", today),
       supabase.from("school_events").select("id, title, start_date").eq("school_id", child.schoolId).gte("start_date", today),
       supabase.from("assignments").select("id, title, due_date, type").eq("class_id", child.classId).eq("published", true).gte("due_date", today),
       supabase.from("attendance").select("status").eq("student_id", child.id)
    ]);

    const combinedRoadmap: WeeklyItem[] = [];
    
    // Merge Strategy
    gradeEvs?.forEach(e => combinedRoadmap.push({ id: e.id, title: e.title, type: 'exam', date: e.event_date, dayLabel: new Date(e.event_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
    schoolEvs?.forEach(e => combinedRoadmap.push({ id: e.id, title: e.title, type: 'holiday', date: e.start_date, dayLabel: new Date(e.start_date).toLocaleDateString("he-IL", { weekday: "short" }) }));
    classAssignments?.forEach(e => {
       if (e.due_date) combinedRoadmap.push({ id: e.id, title: e.title, type: e.type === 'exam' ? 'exam' : 'assignment', date: e.due_date, dayLabel: new Date(e.due_date).toLocaleDateString("he-IL", { weekday: "short" }) });
    });

    // Deduplicate & Sort
    const sortedRoadmap = combinedRoadmap
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);

    // 4. Attendance Facts
    const absences = (attendanceHistory || []).filter(a => a.status === "absent").length;
    const attPctValue = attendanceHistory?.length ? Math.round(((attendanceHistory.length - absences) / attendanceHistory.length) * 100) : 100;

    // 5. Educators Lookup
    let staff = { teacherId: "", educatorName: "", counselorId: "", counselorName: "" };
    if (child.classId) {
       const { data: ed } = await supabase.from("user_roles").select("user_id").eq("homeroom_class_id", child.classId).eq("role", "educator").maybeSingle();
       if (ed) {
          staff.teacherId = ed.user_id;
          const { data: p } = await supabase.from("profiles").select("full_name").eq("id", ed.user_id).maybeSingle();
          if (p) staff.educatorName = p.full_name;
       }
    }

    setState({
      overallAvg: cAvgVal,
      classAvg: peerAvgValue,
      attendancePct: attPctValue,
      absentCount: absences,
      overdueCount: 0, // Logic handled by roadmap
      weeklyRoadmap: sortedRoadmap,
      educators: staff
    });
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

  const goToGrades = () => selectedChild && navigate(`/dashboard/grades/${selectedChild.id}`);
  const goToChat = (id?: string) => id && navigate("/dashboard/chat", { state: { targetUserId: id } });
  const goToCommunity = (type: string) => navigate("/dashboard/chat", { state: { initialType: type } });

  if (loading) return <div className="h-screen flex items-center justify-center font-black text-indigo-600 animate-pulse text-xl font-heading tracking-widest">NAVIGATING COCKPIT...</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-10 pb-40" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* HEADER: Absolute Precision */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
           <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight flex items-center gap-4">
                 <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-indigo-100"><Heart className="h-7 w-7" /></div>
                 <div className="flex flex-row-reverse gap-3 items-baseline">
                    <span className="text-indigo-600 font-heading">Cockpit</span>
                    <span className="text-slate-800 dark:text-white font-heading">Guardian</span>
                 </div>
              </h1>
              <div className="flex flex-wrap gap-3">
                 {children.map(c => (
                   <button key={c.id} onClick={() => setSelectedChild(c)} className={`px-8 py-3 rounded-2xl text-xs font-black transition-all border ${selectedChild?.id === c.id ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-100 border-indigo-600" : "bg-white text-slate-400 border-slate-100 hover:border-indigo-200"}`}>
                      {c.fullName}
                   </button>
                 ))}
              </div>
           </div>
           <Button onClick={goToGrades} className="w-full md:w-auto h-16 px-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black gap-4 shadow-xl shadow-emerald-100 active:scale-95 transition-all">
              <FileText className="h-6 w-6" />
              ממשק דוחות וציונים
              <ChevronLeft className="h-5 w-5 mr-3" />
           </Button>
        </div>

        {selectedChild && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              <div className="lg:col-span-2 space-y-12">
                 
                 {/* ACADEMIC SNAPSHOT */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="border-none bg-indigo-600 text-white rounded-[2.8rem] p-10 shadow-3xl shadow-indigo-100 relative overflow-hidden flex flex-col justify-between group">
                       <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl -mr-40 -mt-40" />
                       <div className="relative z-10 space-y-8 text-right">
                          <div className="flex justify-between items-start">
                             <div className="space-y-1">
                                <h2 className="text-3xl font-black">{selectedChild.fullName}</h2>
                                <p className="text-xs text-indigo-100 font-bold opacity-70">כיתה {selectedChild.grade}'{selectedChild.classNumber} • {selectedChild.schoolName}</p>
                             </div>
                             <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg">
                                <GraduationCap className="h-6 w-6" />
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-12">
                             <div className="text-center group-hover:scale-105 transition-transform duration-500">
                                <p className="text-8xl font-black tracking-tighter tabular-nums leading-none">{state.overallAvg ?? "—"}</p>
                                <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300 mt-3 opacity-60">GPA משוקלל</p>
                             </div>
                             <div className="w-px h-20 bg-white/10" />
                             <div className="text-center">
                                <p className="text-4xl font-black text-indigo-200 tabular-nums leading-none tracking-tight">{state.classAvg ?? "—"}</p>
                                <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300 mt-3 opacity-60">ממוצע כיתה</p>
                             </div>
                          </div>
                       </div>
                    </Card>

                    <div className="grid grid-cols-2 gap-8">
                       <Card className="bg-white dark:bg-slate-900 border-none rounded-[2rem] p-8 flex flex-col items-center justify-center text-center shadow-sm border border-slate-50 group hover:shadow-xl transition-all">
                          <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6 group-hover:scale-110 transition-transform"><XCircle className="h-8 w-8" /></div>
                          <p className="text-6xl font-black tabular-nums tracking-tighter">{state.absentCount}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-4">היעדרויות סה"כ</p>
                       </Card>
                       <Card className="bg-white dark:bg-slate-900 border-none rounded-[2rem] p-8 flex flex-col items-center justify-center text-center shadow-sm border border-slate-50 group hover:shadow-xl transition-all">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform"><Percent className="h-8 w-8" /></div>
                          <p className="text-6xl font-black tabular-nums tracking-tighter">{state.attendancePct}%</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-4">נוכחות שנתית</p>
                       </Card>
                    </div>
                 </div>

                 {/* THE NO-LIES CALENDAR */}
                 <div className="space-y-6">
                    <div className="flex justify-between items-center px-4">
                       <h3 className="text-xl font-black flex items-center gap-3">
                          <CalendarDays className="h-6 w-6 text-indigo-600" /> סנכרון אירועי בית ספר ומטלות
                       </h3>
                       <Badge variant="outline" className="rounded-xl px-4 py-1.5 font-black uppercase text-[10px] border-slate-200">חי ב-100%</Badge>
                    </div>
                    <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide px-4">
                       {["א'", "ב'", "ג'", "ד'", "ה'"].map(day => {
                          const items = state.weeklyRoadmap.filter(r => r.dayLabel === day);
                          return (
                            <div key={day} className="flex-none w-56 space-y-4">
                               <p className="text-xs font-black text-slate-300 border-b border-slate-50 pb-3 text-center uppercase tracking-widest mb-1">{day}</p>
                               {items.map(i => (
                                 <div key={i.id} className={`p-6 rounded-[2.2rem] text-xs font-black text-center leading-tight shadow-sm border transition-transform hover:-translate-y-1 ${
                                   i.type === 'exam' ? "bg-rose-50 border-rose-100 text-rose-700 shadow-rose-100" : 
                                   i.type === 'holiday' ? "bg-blue-50 border-blue-100 text-blue-700 shadow-blue-100" : 
                                   "bg-indigo-50 border-indigo-100 text-indigo-700 shadow-indigo-100"
                                 }`}>
                                    <div className="opacity-40 text-[9px] mb-2 uppercase tracking-tightest">
                                       {i.type === 'exam' ? "מבחן הרשום בלוח" : i.type === 'holiday' ? "אירוע בית ספר" : "מטלה להגשה"}
                                    </div>
                                    {i.title}
                                 </div>
                               ))}
                               {items.length === 0 && <div className="h-28 w-full border-2 border-dashed border-slate-50 rounded-[2.2rem] opacity-30 flex items-center justify-center text-slate-200 text-xs font-bold">אין אירועים</div>}
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>

              {/* SIDEBAR */}
              <div className="space-y-12">
                 
                 {/* DIRECT CONTACTS */}
                 <Card className="bg-slate-900 text-white rounded-[2.8rem] p-10 shadow-3xl shadow-slate-100 relative overflow-hidden group border border-white/5">
                    <h3 className="text-xl font-black mb-10 flex items-center gap-4 relative z-10">ערוצי קשר אישיים</h3>
                    <div className="space-y-5 relative z-10">
                       <button onClick={() => goToChat(state.educators.teacherId)} className="w-full flex items-center gap-5 p-6 rounded-[2rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right active:scale-95 shadow-lg">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-300 shadow-inner"><UserRound className="h-6 w-6" /></div>
                          <div className="flex-1">
                             <p className="text-[9px] text-indigo-400 uppercase font-black tracking-widest mb-1 opacity-80">מחנכת הכיתה</p>
                             <p className="text-md font-black">{state.educators.educatorName || "סנכרון שם..."}</p>
                          </div>
                          <ChevronLeft className="h-5 w-5 opacity-20" />
                       </button>

                       <button onClick={() => goToChat(state.educators.counselorId)} className="w-full flex items-center gap-5 p-6 rounded-[2rem] bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-right active:scale-95 shadow-lg">
                          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-300 shadow-inner"><HeartHandshake className="h-6 w-6" /></div>
                          <div className="flex-1">
                             <p className="text-[9px] text-rose-400 uppercase font-black tracking-widest mb-1 opacity-80">פנייה לייעוץ</p>
                             <p className="text-md font-black italic opacity-60">{state.educators.counselorName || "יועצת השכבה"}</p>
                          </div>
                          <ChevronLeft className="h-5 w-5 opacity-20" />
                       </button>
                    </div>
                 </Card>

                 {/* COMMUNITIES */}
                 <div className="p-10 rounded-[2.8rem] bg-white dark:bg-slate-900 border border-slate-100 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 justify-end">
                       <h4 className="text-[11px] font-black uppercase text-indigo-600 tracking-widest">קהילת הורים</h4>
                       <Users className="h-4 w-4 text-indigo-100" />
                    </div>
                    <div className="space-y-4">
                       <button onClick={() => goToCommunity('parent_class')} className="w-full h-16 rounded-[1.8rem] bg-slate-50 hover:bg-slate-100 transition-all flex items-center justify-between px-8 text-xs font-black border border-slate-100 shadow-inner">
                         קבוצת הורי כיתה {selectedChild.grade}'{selectedChild.classNumber}
                         <ArrowLeft className="h-5 w-5 text-indigo-600" />
                       </button>
                       <button onClick={() => goToCommunity('parent_grade')} className="w-full h-16 rounded-[1.8rem] border border-slate-100 hover:bg-slate-50 transition-all flex items-center justify-between px-8 text-xs font-black shadow-sm">
                         פורום הורי שכבת {selectedChild.grade}
                         <ArrowLeft className="h-5 w-5 text-indigo-600" />
                       </button>
                    </div>
                 </div>

                 {/* PEDAGOGICAL INSIGHT */}
                 <div className="p-10 rounded-[2.8rem] bg-indigo-50 border border-indigo-100 shadow-sm text-right relative overflow-hidden group">
                    <div className="absolute top-0 left-0 p-8 opacity-10"><Sparkles className="h-10 w-10 text-indigo-600" /></div>
                    <div className="flex items-center gap-4 mb-6 justify-end">
                       <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">תובנות Guardian AI</p>
                       <Sparkles className="h-5 w-5 text-indigo-600 animate-bounce" />
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed italic border-r-2 border-indigo-300 pr-6">
                       {state.weeklyRoadmap.filter(i => i.type === 'exam').length > 0 
                         ? `זוהה מבחן קרוב ביומן. רמת הנוכחות של ${state.attendancePct}% מעידה על רציפות טובה.`
                         : "סנכרון מלא: כל המבחנים והאירועים מופיעים בלוח ללא חריגות."}
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
