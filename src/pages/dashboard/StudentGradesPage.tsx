import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  FileText, TrendingUp, TrendingDown, Minus, Award, BarChart3,
  BookOpen, Target, Loader2, MessageSquare, Send, Sparkles,
  ChevronRight, BrainCircuit, Star, Printer, Zap, Trophy,
  ChevronLeft,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
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
  count: number;
  trend: "up" | "down" | "stable";
  grades: GradeEntry[];
}

const TYPE_LABELS: Record<string, string> = {
  homework: "שיעורי בית",
  exam: "מבחן",
  quiz: "בוחן",
  project: "פרויקט",
  exercise: "תרגיל",
};

const StudentGradesPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { studentId: paramId } = useParams();
  const studentId = paramId || profile.id; // Support parent viewing child
  const isParentView = !!paramId && paramId !== profile.id;
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [appealGrade, setAppealGrade] = useState<GradeEntry | null>(null);
  const [appealText, setAppealText] = useState("");
  const [sendingAppeal, setSendingAppeal] = useState(false);
  const [studentName, setStudentName] = useState<string>("");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  /* ── Data Fetching ────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      
      // Get student info if parent
      if (isParentView) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", studentId).single();
        if (p) setStudentName(p.full_name);
      }

      const { data: subs, error } = await supabase
        .from("submissions")
        .select("id, grade, graded_at, feedback, assignment_id, assignments(id, title, subject, type, weight_percent, max_grade)")
        .eq("student_id", studentId)
        .eq("status", "graded")
        .order("graded_at", { ascending: false });

      if (error || !subs) { setLoading(false); return; }

      const assignmentIds = subs.map((s: any) => s.assignment_id).filter(Boolean);
      let avgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: rpcAvgs } = await supabase.rpc('get_assignment_averages', { p_assignment_ids: assignmentIds });
        if (rpcAvgs) (rpcAvgs as any[]).forEach(row => avgMap.set(row.assignment_id, row.avg_grade));
      }

      const enriched: GradeEntry[] = subs.map((s: any) => ({
        id: s.id,
        assignmentId: s.assignment_id,
        title: s.assignments?.title || "ללא כותרת",
        subject: s.assignments?.subject || "כללי",
        type: s.assignments?.type || "homework",
        grade: s.grade,
        maxGrade: s.assignments?.max_grade || 100,
        weight: s.assignments?.weight_percent || 0,
        gradedAt: s.graded_at,
        feedback: s.feedback,
        classAvg: avgMap.get(s.assignment_id) ?? null,
        normalizedGrade: Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100),
      }));

      setGrades(enriched);
      setLoading(false);
    };
    load();
  }, [studentId, isParentView]);

  /* ── Calculations ─────────────────────────────────────── */
  const subjectSummaries = useMemo<SubjectSummary[]>(() => {
    const map = new Map<string, GradeEntry[]>();
    grades.forEach(g => { const l = map.get(g.subject) || []; l.push(g); map.set(g.subject, l); });

    return Array.from(map.entries()).map(([subject, entries]) => {
      const avg = Math.round(entries.reduce((s, g) => s + g.normalizedGrade, 0) / entries.length);
      let trend: "up" | "down" | "stable" = "stable";
      if (entries.length >= 2) {
        const diff = entries[0].normalizedGrade - entries[1].normalizedGrade;
        if (diff > 4) trend = "up"; else if (diff < -4) trend = "down";
      }
      return { subject, average: avg, count: entries.length, trend, grades: entries };
    }).sort((a, b) => b.average - a.average);
  }, [grades]);

  const overallAvg = useMemo(() => 
    subjectSummaries.length === 0 ? 0 : Math.round(subjectSummaries.reduce((s, ss) => s + ss.average, 0) / subjectSummaries.length),
    [subjectSummaries]
  );

  const filteredGrades = selectedSubject === "all" ? grades : grades.filter(g => g.subject === selectedSubject);

  const chartData = useMemo(() => {
    return [...filteredGrades].reverse().map((g, i) => ({
      name: g.subject.slice(0, 3) + (filteredGrades.length > 5 ? i : ""),
      grade: g.normalizedGrade,
      avg: g.classAvg
    }));
  }, [filteredGrades]);

  const gradeColor = (g: number) => {
    if (g >= 90) return "text-emerald-500";
    if (g >= 75) return "text-indigo-600";
    if (g >= 60) return "text-amber-500";
    return "text-rose-500";
  };

  const sendAppeal = async () => {
    if (!appealGrade || !appealText.trim()) return;
    setSendingAppeal(true);
    const { error } = await supabase.from("submissions").update({
      feedback: `[ערעור]: ${appealText}\n${appealGrade.feedback || ""}`
    }).eq("id", appealGrade.id);
    
    if (!error) {
      toast({ title: "הערעור נשלח למורה" });
      setAppealGrade(null);
      setAppealText("");
    }
    setSendingAppeal(false);
  };

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto px-4 py-8 space-y-10 pb-32">
      
      {/* 1. HEADER: PEDAGOGICAL TITLE */}
      <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
           <h1 className="text-3xl font-heading font-black tracking-tighter flex items-center gap-3">
              <FileText className="h-8 w-8 text-indigo-600" /> תיק הישגים פדגוגי
           </h1>
           <p className="text-sm text-slate-500 font-bold">
              {isParentView ? `דוח נוכחי עבור: ${studentName}` : "סקירה מקיפה של ההתקדמות הלימודית שלך"}
           </p>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="outline" className="rounded-2xl gap-2 font-bold text-xs" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" /> חזרה
           </Button>
           <Button className="bg-indigo-600 text-white rounded-2xl gap-2 font-black shadow-lg shadow-indigo-100 px-6">
              <Printer className="h-4 w-4" /> הפק תעודה
           </Button>
        </div>
      </motion.div>

      {/* 2. TOP METRICS: THE SUMMARY */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <Card className="bg-indigo-600 text-white rounded-[2rem] p-8 border-none shadow-xl shadow-indigo-100 flex flex-col items-center justify-center text-center space-y-2">
            <p className="text-[10px] uppercase font-black tracking-widest text-indigo-200">ממוצע כללי משוקלל</p>
            <p className="text-7xl font-heading font-black tracking-tighter">{overallAvg}%</p>
            <Badge className="bg-white/10 text-white border-transparent">ציון יציב</Badge>
         </Card>
         <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: "מקצועות פעילים", val: subjectSummaries.length, icon: <BookOpen className="h-6 w-6 text-indigo-600" /> },
              { label: "מגמת התקדמות", val: subjectSummaries[0]?.trend === "up" ? "בשיפור" : "יציבה", icon: <TrendingUp className="h-6 w-6 text-emerald-500" /> },
              { label: "ציוני קצה", val: grades.filter(g => g.normalizedGrade >= 90).length, icon: <Trophy className="h-6 w-6 text-amber-500" /> }
            ].map((m, i) => (
              <Card key={i} className="bg-white dark:bg-slate-900 border-none rounded-[2rem] p-7 shadow-sm flex flex-col justify-between">
                 <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">{m.icon}</div>
                 <div>
                    <p className="text-2xl font-black">{m.val}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider mt-1">{m.label}</p>
                 </div>
              </Card>
            ))}
         </div>
      </motion.div>

      {/* 3. CHART & ANALYSIS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <Card className="lg:col-span-8 bg-white dark:bg-slate-900 border-none rounded-[2.5rem] p-10 shadow-sm">
            <div className="flex items-center justify-between mb-10">
               <h3 className="text-base font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-indigo-600" /> עקומת הישגים יחסית
               </h3>
               <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> <span className="text-[10px] font-black italic">הילד</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-200" /> <span className="text-[10px] font-black italic">ממוצע כיתה</span></div>
               </div>
            </div>
            <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorGrade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 900}} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="grade" stroke="#4f46e5" strokeWidth={5} fillOpacity={1} fill="url(#colorGrade)" />
                    <Area type="monotone" dataKey="avg" stroke="#e2e8f0" strokeWidth={2} strokeDasharray="10 5" fill="none" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </Card>

         <Card className="lg:col-span-4 bg-indigo-50/30 dark:bg-indigo-900/10 border-none rounded-[2.5rem] p-8 flex flex-col gap-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
               <BrainCircuit className="h-4 w-4" /> תובנות מנטור
            </h3>
            {subjectSummaries.slice(0, 3).map((ss, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-indigo-50 flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl shrink-0">{i === 0 ? "👑" : "🔥"}</div>
                 <div>
                    <p className="text-xs font-black">{ss.subject}</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed italic mt-0.5">
                       {ss.average >= 90 ? "יציבות יוצאת דופן במקצוע זה." : "שיפור עקבי במטלות האחרונות."}
                    </p>
                 </div>
              </div>
            ))}
            <div className="mt-4 p-4 bg-indigo-600 text-white rounded-2xl flex items-center gap-4">
               <Trophy className="h-8 w-8 opacity-50" />
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">יעד הבא</p>
                  <p className="text-sm font-black">הגעה לממוצע 90 בכללי</p>
               </div>
            </div>
         </Card>
      </div>

      {/* 4. DETAILED LIST WITH TABS */}
      <Tabs value={selectedSubject} onValueChange={setSelectedSubject} className="space-y-8">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <h3 className="text-xl font-heading font-black">פירוט ציונים מלא</h3>
            <TabsList className="bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto max-w-full">
               <TabsTrigger value="all" className="rounded-xl px-5 font-black text-xs h-9">הכל</TabsTrigger>
               {subjectSummaries.map(ss => (
                 <TabsTrigger key={ss.subject} value={ss.subject} className="rounded-xl px-5 font-black text-xs h-9">{ss.subject}</TabsTrigger>
               ))}
            </TabsList>
         </div>

         <div className="grid grid-cols-1 gap-4">
            {filteredGrades.map((g, i) => (
               <motion.div key={g.id} variants={item}>
                  <Card className="bg-white dark:bg-slate-900 border-none rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                     <div className="flex flex-col md:flex-row items-center gap-8">
                        
                        {/* Score Circular Indicator */}
                        <div className="relative w-16 h-16 shrink-0">
                           <svg className="w-full h-full rotate-[-90deg]">
                              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" strokeDasharray={176} strokeDashoffset={176 - (176 * g.normalizedGrade) / 100} strokeLinecap="round" fill="transparent" className={g.normalizedGrade >= 90 ? "text-emerald-500" : "text-indigo-600"} />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center font-heading font-black text-lg">
                              {g.normalizedGrade}
                           </div>
                        </div>

                        {/* Title & Info */}
                        <div className="flex-1 min-w-0 space-y-2 text-center md:text-right">
                           <div className="flex items-center justify-center md:justify-end gap-3">
                              <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent text-[8px] font-black uppercase">{TYPE_LABELS[g.type] || g.type}</Badge>
                              <h4 className="text-lg font-black tracking-tight">{g.title}</h4>
                           </div>
                           <div className="flex items-center justify-center md:justify-end gap-3 text-xs font-bold text-slate-400">
                              <span>{g.subject}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              <span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span>
                           </div>
                        </div>

                        {/* Relative Comparison */}
                        <div className="flex items-center gap-6 md:border-r border-slate-100 dark:border-white/5 md:pr-8">
                           <div className="text-center">
                              <p className="text-[9px] uppercase font-black text-slate-400 mb-1">ממוצע כיתה</p>
                              <p className="text-xl font-black">{g.classAvg ?? "—"}</p>
                           </div>
                           <div className="text-center">
                              <p className="text-[9px] uppercase font-black text-slate-400 mb-1">סטייה</p>
                              <Badge className={`rounded-xl px-3 py-1 text-xs font-black ${g.classAvg && g.normalizedGrade >= g.classAvg ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} border-transparent`}>
                                 {g.classAvg ? (g.normalizedGrade >= g.classAvg ? `+${g.normalizedGrade - g.classAvg}` : `-${g.classAvg - g.normalizedGrade}`) : "—"}
                              </Badge>
                           </div>
                        </div>

                        {/* Teacher's Voice Action */}
                        <div className="flex items-center gap-2">
                           {g.feedback && (
                             <Button variant="ghost" size="icon" className="rounded-full hover:bg-indigo-50" onClick={() => toast({ title: "משוב מורה", description: g.feedback })}>
                                <Sparkles className="h-5 w-5 text-indigo-400" />
                             </Button>
                           )}
                           <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100" onClick={() => setAppealGrade(g)}>
                              <MessageSquare className="h-5 w-5 text-slate-400" />
                           </Button>
                        </div>
                     </div>

                     {/* Hidden Teacher feedback reveal on hover-like logic or explicit action */}
                     {g.feedback && (
                       <div className="mt-4 pt-4 border-t border-slate-50 dark:border-white/5 opacity-80 decoration-indigo-300 italic text-xs leading-relaxed text-indigo-900/60 dark:text-indigo-200/60">
                          " {g.feedback} "
                       </div>
                     )}
                  </Card>
               </motion.div>
            ))}
         </div>
      </Tabs>

      {/* APPEAL MODAL */}
      <Dialog open={!!appealGrade} onOpenChange={o => !o && setAppealGrade(null)}>
         <DialogContent className="rounded-[2.5rem] p-10 max-w-md text-right" dir="rtl">
            <DialogHeader className="mb-6">
               <DialogTitle className="text-2xl font-black font-heading flex items-center gap-3">
                  <MessageSquare className="h-7 w-7 text-indigo-600" /> ערעור על מטלה
               </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
               <div className="p-5 bg-indigo-50 rounded-[1.5rem] border border-indigo-100">
                  <p className="text-sm font-black">{appealGrade?.title}</p>
                  <p className="text-xs text-indigo-500 font-bold mt-1">{appealGrade?.subject} • ציון {appealGrade?.grade}/{appealGrade?.maxGrade}</p>
               </div>
               <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">הסבר הערעור</p>
                  <Textarea 
                     value={appealText} 
                     onChange={e => setAppealText(e.target.value)} 
                     placeholder="כתוב כאן בצורה מכובדת למה לדעתך הציון דורש בדיקה חוזרת..." 
                     className="rounded-2xl border-slate-100 bg-slate-50/50 min-h-[120px] p-4 text-sm"
                  />
               </div>
               <Button onClick={sendAppeal} disabled={sendingAppeal || !appealText.trim()} className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black gap-3 shadow-xl shadow-indigo-100 transition-all">
                  {sendingAppeal ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rotate-180" />}
                  שלח ערעור פדגוגי
               </Button>
            </div>
         </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default StudentGradesPage;
