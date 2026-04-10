import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, TrendingUp, TrendingDown, Award, BarChart3,
  BookOpen, Loader2, MessageSquare, Send, Sparkles,
  BrainCircuit, Trophy, CheckCircle2, AlertCircle, Info, ArrowUpRight
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ─── Types ───────────────────────────────────────────── */
interface GradeEntry {
  id: string;
  assignmentId: string;
  title: string;
  subject: string;
  type: string;
  grade: number;
  maxGrade: number;
  weight: number;
  gradedAt: string;
  feedback: string | null;
  classAvg?: number | null;
  normalizedGrade: number;
}

interface SubjectSummary {
  subject: string;
  average: number;
  classAverage: number | null;
  count: number;
  trend: "up" | "down" | "stable";
  isTopPerformer: boolean;
  grades: GradeEntry[];
}

const TYPE_LABELS: Record<string, string> = {
  homework: "שיעורי בית", exam: "מבחן", quiz: "בוחן", project: "פרויקט", exercise: "תרגיל",
};

const StudentGradesPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { studentId: paramId } = useParams();
  const studentId = paramId || profile.id;
  const isParentView = !!paramId && paramId !== profile.id;
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [appealGrade, setAppealGrade] = useState<GradeEntry | null>(null);
  const [appealText, setAppealText] = useState("");
  const [sendingAppeal, setSendingAppeal] = useState(false);
  const [studentName, setStudentName] = useState<string>("");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  /* ── Academic Pulse (NO FILLERS) ────────────────────── */
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      let targetId = studentId;

      // Parent Context Recovery: If no ID in URL, find first child
      if (profile.role === 'parent' && !paramId) {
        const { data: kids } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id).limit(1);
        if (kids?.[0]?.student_id) targetId = kids[0].student_id;
      }

      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", targetId).single();
      if (p) setStudentName(p.full_name);

      const { data: subs, error } = await supabase
        .from("submissions")
        .select("id, grade, graded_at, feedback, assignment_id, assignments(id, title, subject, type, weight_percent, max_grade)")
        .eq("student_id", targetId)
        .not("grade", "is", null)
        .order("graded_at", { ascending: false });

      if (error || !subs) { setLoading(false); return; }

      const assignmentIds = subs.map((s: any) => s.assignment_id).filter(Boolean);
      let avgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: classData } = await supabase.rpc('get_assignment_averages', { p_assignment_ids: assignmentIds });
        if (classData) (classData as any[]).forEach(row => avgMap.set(row.assignment_id, row.avg_grade));
      }

      const enriched: GradeEntry[] = subs.map((s: any) => {
        const assign = Array.isArray(s.assignments) ? s.assignments[0] : s.assignments;
        return {
          id: s.id,
          assignmentId: s.assignment_id,
          title: assign?.title || "ללא כותרת",
          subject: assign?.subject || "כללי",
          type: assign?.type || "homework",
          grade: s.grade,
          maxGrade: assign?.max_grade || 100,
          weight: assign?.weight_percent || 0,
          gradedAt: s.graded_at,
          feedback: s.feedback,
          classAvg: avgMap.has(s.assignment_id) ? Math.round(avgMap.get(s.assignment_id)!) : null,
          normalizedGrade: Math.round((s.grade / (assign?.max_grade || 100)) * 100),
        };
      });

      setGrades(enriched);
      setLoading(false);
    };
    loadData();
  }, [studentId, isParentView]);

  /* ── Subject Analysis ────────────────────────────────── */
  const subjectSummaries = useMemo<SubjectSummary[]>(() => {
    const map = new Map<string, GradeEntry[]>();
    grades.forEach(g => { const l = map.get(g.subject) || []; l.push(g); map.set(g.subject, l); });

    return Array.from(map.entries()).map(([subject, entries]) => {
      const avg = Math.round(entries.reduce((s, g) => s + g.normalizedGrade, 0) / entries.length);
      const cAvg = entries.some(g => g.classAvg !== null) 
                   ? Math.round(entries.reduce((s, g) => s + (g.classAvg || 0), 0) / entries.filter(g => g.classAvg !== null).length) 
                   : null;
      let trend: "up" | "down" | "stable" = "stable";
      if (entries.length >= 2) {
        const diff = entries[0].normalizedGrade - entries[1].normalizedGrade;
        if (diff > 5) trend = "up"; else if (diff < -5) trend = "down";
      }
      return { 
        subject, average: avg, classAverage: cAvg, count: entries.length, trend, 
        isTopPerformer: cAvg !== null && avg > cAvg + 10,
        grades: entries 
      };
    }).sort((a, b) => b.average - a.average);
  }, [grades]);

  const overallAvg = useMemo(() => 
    subjectSummaries.length === 0 ? 0 : Math.round(subjectSummaries.reduce((s, ss) => s + ss.average, 0) / subjectSummaries.length),
    [subjectSummaries]
  );

  const chartData = useMemo(() => {
    return [...grades].reverse().slice(-10).map((g, i) => ({
      name: i + 1,
      grade: g.normalizedGrade,
      avg: g.classAvg || 0,
      title: g.title
    }));
  }, [grades]);

  const sendAppeal = async () => {
    if (!appealGrade || !appealText.trim()) return;
    setSendingAppeal(true);
    const { error } = await supabase.from("submissions").update({
      feedback: `[ערעור הורה/תלמיד]: ${appealText}\n${appealGrade.feedback || ""}`
    }).eq("id", appealGrade.id);
    
    if (!error) {
      toast({ title: "הערעור נשלח לבדיקת מורה" });
      setAppealGrade(null); setAppealText("");
    }
    setSendingAppeal(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-100 font-black text-indigo-500 animate-pulse">Loading Academic Records...</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 font-body p-4 md:p-12 pb-40">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto space-y-12">
        
        {/* HEADER */}
        <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-end gap-10">
           <div className="space-y-2">
              <h1 className="text-4xl font-heading font-black tracking-tightest flex items-center gap-4 text-slate-800 dark:text-white">
                 <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Award className="h-6 w-6" /></div>
                 הישגים פדגוגיים
              </h1>
              <p className="text-sm text-slate-400 font-bold italic">
                 {isParentView ? `דוח מפורט עבור ${studentName}` : "סקירה היסטורית של כלל המשימות והמבחנים"}
              </p>
           </div>
           <div className="flex gap-4">
              <Button variant="outline" className="rounded-2xl gap-2 font-bold h-12 px-6" onClick={() => navigate(-1)}>חזרה</Button>
              <Button className="bg-indigo-600 text-white rounded-2xl gap-2 font-black h-12 px-8 shadow-2xl shadow-indigo-100">
                 הפק גיליון ציונים
              </Button>
           </div>
        </motion.div>

        {/* TOP SUMMARY */}
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-8">
           <Card className="md:col-span-1 bg-indigo-600 text-white rounded-[3rem] p-10 flex flex-col items-center justify-center text-center shadow-3xl shadow-indigo-100 dark:shadow-none space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">ממוצע שנתי</p>
              <p className="text-8xl font-heading font-black tracking-tighter tabular-nums leading-none">{overallAvg}%</p>
           </Card>
           
           <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-8">
              {subjectSummaries.slice(0, 3).map((ss, i) => (
                <Card key={ss.subject} className="bg-white dark:bg-slate-900 border-none rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                   {ss.isTopPerformer && <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />}
                   <div className="flex justify-between items-start">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                         {ss.isTopPerformer ? <Trophy className="h-6 w-6 text-emerald-500" /> : <BookOpen className="h-6 w-6 text-indigo-500" />}
                      </div>
                      <Badge className={ss.trend === "up" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50"}>
                         {ss.trend === "up" ? "בשיפור" : "יציב"}
                      </Badge>
                   </div>
                   <div className="mt-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{ss.subject}</p>
                      <div className="flex items-end gap-3 mt-1">
                         <p className="text-4xl font-black">{ss.average}</p>
                         {ss.classAverage && (
                           <p className={`text-[10px] font-bold mb-1.5 ${ss.average > ss.classAverage ? "text-emerald-500" : "text-rose-500"}`}>
                              ({ss.average > ss.classAverage ? `+${ss.average - ss.classAverage}` : `-${ss.classAverage - ss.average}`} מהכיתה)
                           </p>
                         )}
                      </div>
                   </div>
                </Card>
              ))}
           </div>
        </motion.div>

        {/* COMPARATIVE TREND CHART */}
        <motion.div variants={item}>
           <Card className="bg-white dark:bg-slate-900 border-none rounded-[3.5rem] p-12 shadow-sm relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
                 <div>
                    <h3 className="text-xl font-black flex items-center gap-4">
                       <BarChart3 className="h-6 w-6 text-indigo-600" /> עקומת למידה השוואתית
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">ביצועים אישיים מול ממוצע הכיתה (10 מטלות אחרונות)</p>
                 </div>
                 <div className="flex gap-6">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-600" /> <span className="text-[10px] font-black uppercase">הילד</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-200" /> <span className="text-[10px] font-black uppercase">ממוצע כיתה</span></div>
                 </div>
              </div>
              <div className="h-64">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                       <defs>
                          <linearGradient id="colorChild" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                             <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                       <XAxis dataKey="name" hide />
                       <YAxis domain={[0, 100]} hide />
                       <Tooltip 
                         contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                         labelFormatter={(label, payload) => payload[0]?.payload?.title || ""}
                       />
                       <Area type="monotone" dataKey="grade" stroke="#4f46e5" strokeWidth={5} fillOpacity={1} fill="url(#colorChild)" />
                       <Area type="monotone" dataKey="avg" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="10 5" fill="none" />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
           </Card>
        </motion.div>

        {/* DETAILED GRADE TABLE */}
        <motion.div variants={item} className="space-y-8">
           <div className="flex items-center justify-between px-4">
              <h3 className="text-xl font-black">פירוט ציונים מלא</h3>
              <div className="flex gap-4">
                 <Badge variant="outline" className="rounded-xl px-4 py-1.5 font-bold h-9 bg-white">סה"כ {grades.length} מטלות</Badge>
              </div>
           </div>
           
           <div className="space-y-4">
              {grades.map(g => (
                <Card key={g.id} className="bg-white dark:bg-slate-900 border-none rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                   <div className="flex flex-col md:flex-row items-center gap-10">
                      
                      {/* Score Indicator */}
                      <div className="w-20 h-20 shrink-0 relative flex items-center justify-center">
                         <div className={`absolute inset-0 rounded-3xl rotate-12 group-hover:rotate-0 transition-transform ${g.normalizedGrade >= 90 ? "bg-emerald-500/10" : "bg-indigo-500/10"}`} />
                         <p className={`text-4xl font-heading font-black ${g.normalizedGrade >= 90 ? "text-emerald-500" : "text-indigo-600"}`}>{g.normalizedGrade}</p>
                      </div>

                      {/* Content */}
                      <div className="flex-1 text-center md:text-right">
                         <div className="flex items-center justify-center md:justify-end gap-3 mb-1">
                            <Badge className="bg-slate-50 text-slate-400 border-none text-[8px] font-black uppercase tracking-widest">{TYPE_LABELS[g.type] || g.type}</Badge>
                            <h4 className="text-xl font-black tracking-tight">{g.title}</h4>
                         </div>
                         <div className="flex items-center justify-center md:justify-end gap-4 text-xs font-bold text-slate-400">
                            <span>{g.subject}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-100" />
                            <span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span>
                         </div>
                      </div>

                      {/* Comparison Metrics */}
                      <div className="flex items-center gap-8 md:border-r border-slate-50 dark:border-white/5 md:pr-10">
                         <div className="text-center">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">ממוצע כיתה</p>
                            <p className="text-2xl font-black">{g.classAvg ?? "—"}</p>
                         </div>
                         {g.classAvg && (
                           <div className="text-center">
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">סטייה</p>
                              <div className={`flex items-center gap-1 font-black ${g.normalizedGrade >= g.classAvg ? "text-emerald-500" : "text-rose-500"}`}>
                                 {g.normalizedGrade >= g.classAvg ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                 <span className="text-xl">{Math.abs(g.normalizedGrade - g.classAvg)}</span>
                              </div>
                           </div>
                         )}
                      </div>

                      {/* Active Insights / Feedback */}
                      <div className="flex items-center gap-3">
                         {g.feedback && (
                           <Button variant="ghost" size="icon" className="rounded-2xl hover:bg-indigo-50" onClick={() => toast({ title: "משוב מורה", description: g.feedback })}>
                              <Sparkles className="h-5 w-5 text-indigo-400" />
                           </Button>
                         )}
                         <Button variant="ghost" size="icon" className="rounded-2xl hover:bg-slate-50" onClick={() => setAppealGrade(g)}>
                            <MessageSquare className="h-5 w-5 text-slate-300" />
                         </Button>
                      </div>
                   </div>
                </Card>
              ))}
           </div>
        </motion.div>
        
        {/* MODAL: PEDAGOGICAL APPEAL */}
        <Dialog open={!!appealGrade} onOpenChange={o => !o && setAppealGrade(null)}>
           <DialogContent className="rounded-[3rem] p-10 max-w-lg text-right border-none shadow-4xl" dir="rtl">
              <DialogHeader className="mb-8">
                 <DialogTitle className="text-3xl font-heading font-black flex items-center gap-4">
                    <BrainCircuit className="h-8 w-8 text-indigo-600" /> הגשת ערעור פדגוגי
                 </DialogTitle>
              </DialogHeader>
              <div className="space-y-8">
                 <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between">
                    <div>
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">מטלה נבחרת</p>
                       <p className="text-lg font-black">{appealGrade?.title}</p>
                    </div>
                    <Badge className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-lg font-black">{appealGrade?.grade}/{appealGrade?.maxGrade}</Badge>
                 </div>
                 <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-4">הסבר מפורט לבחינה חוזרת</p>
                    <Textarea 
                       value={appealText} 
                       onChange={e => setAppealText(e.target.value)} 
                       placeholder="הסבירו מדוע לדעתכם חלה טעות בבדיקה או בציון..." 
                       className="rounded-[2rem] border-slate-100 bg-slate-50/50 min-h-[160px] p-6 text-sm font-bold shadow-inner"
                    />
                 </div>
                 <div className="flex gap-4">
                    <Button onClick={() => setAppealGrade(null)} variant="ghost" className="rounded-2xl flex-1 h-14 font-black">ביטול</Button>
                    <Button onClick={sendAppeal} disabled={sendingAppeal || !appealText.trim()} className="rounded-2xl flex-1 h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black gap-3 shadow-2xl shadow-indigo-100 transition-all">
                       {sendingAppeal ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rotate-180" />}
                       שלח לבדיקה
                    </Button>
                 </div>
              </div>
           </DialogContent>
        </Dialog>

      </motion.div>
    </div>
  );
};

export default StudentGradesPage;
