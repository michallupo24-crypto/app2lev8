import { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, TrendingUp, TrendingDown, Minus, BookOpen, AlertTriangle,
  CheckCircle2, Clock, MessageSquare, Send, Loader2, BarChart3,
  Calendar, Heart, Brain, Target, Trophy, ChevronRight,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { getStudentGrades, SubjectGradeReport } from "@/utils/gradingEngine";

interface ChildInfo {
  id: string;
  fullName: string;
  grade: string | null;
  classNumber: number | null;
  schoolName: string | null;
  schoolId: string | null;
  classId: string | null;
  isApproved: boolean;
  level?: number;
}

interface SubjectStat {
  subject: string;
  avg: number;
  count: number;
  classAvg: number | null;
  trend: "up" | "down" | "stable";
  status: "excellent" | "good" | "stable" | "warning" | "critical";
  statusLabel: string;
}

interface AttendanceStat {
  total: number;
  present: number;
  absent: number;
  late: number;
  absencePct: number;
  presencePct: number;
  redLine: boolean;
}

interface GradeEntry {
  title: string;
  subject: string;
  grade: number;
  maxGrade: number;
  gradedAt: string;
  classAvg: number | null;
  teacherTip?: string | null;
  relativeStrength: "top" | "above" | "middle" | "struggling" | "context_high";
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  type: "exam" | "event" | "holiday";
}

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [attendance, setAttendance] = useState<AttendanceStat | null>(null);
  const [recentGrades, setRecentGrades] = useState<GradeEntry[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [childLoading, setChildLoading] = useState(false);
  const [liveAlert, setLiveAlert] = useState<{ studentName: string; status: "absent" | "late"; time: string } | null>(null);
  const realtimeRef = useRef<any>(null);

  const [messageDialog, setMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: links } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", profile.id);

      if (!links || links.length === 0) { setLoading(false); return; }

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
        level: 4, // Simulation for now
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  useEffect(() => {
    if (!selectedChild) return;
    const load = async () => {
      setChildLoading(true);

      const { data: subs } = await supabase
        .from("submissions")
        .select("grade, feedback, graded_at, assignments(id, title, subject, max_grade, class_id)")
        .eq("student_id", selectedChild.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .order("graded_at", { ascending: false })
        .limit(30);

      const assignmentIds = (subs || []).map((s: any) => s.assignments?.id).filter(Boolean);
      let classAvgMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const { data: avgData } = await supabase.rpc("get_class_avgs", { assignment_uids: assignmentIds });
        if (avgData) (avgData as any[]).forEach(row => classAvgMap.set(row.assignment_id, Number(row.class_avg)));
      }

      const recent: GradeEntry[] = (subs || []).slice(0, 10).map((s: any) => {
        const norm = Math.round((s.grade / (s.assignments?.max_grade || 100)) * 100);
        const classAvg = classAvgMap.get(s.assignments?.id) ?? null;
        let relativeStrength: GradeEntry["relativeStrength"] = "middle";
        if (classAvg !== null) {
          const diff = norm - classAvg;
          if (diff > 15) relativeStrength = "top";
          else if (diff > 5) relativeStrength = "above";
          else if (diff < -15) relativeStrength = "struggling";
        }
        if (classAvg !== null && classAvg < 50 && norm > classAvg + 10) relativeStrength = "context_high";
        return {
          title: s.assignments?.title || "",
          subject: s.assignments?.subject || "",
          grade: s.grade,
          maxGrade: s.assignments?.max_grade || 100,
          gradedAt: s.graded_at,
          classAvg,
          teacherTip: s.feedback,
          relativeStrength,
        };
      });
      setRecentGrades(recent);

      const bySubject = new Map<string, { grades: number[]; gradesBytime: { grade: number; date: string }[] }>();
      (subs || []).forEach((s: any) => {
        const subj = s.assignments?.subject;
        const maxG = s.assignments?.max_grade || 100;
        if (!subj) return;
        const norm = Math.round((s.grade / maxG) * 100);
        const entry = bySubject.get(subj) || { grades: [], gradesBytime: [] };
        entry.grades.push(norm);
        entry.gradesBytime.push({ grade: norm, date: s.graded_at });
        bySubject.set(subj, entry);
      });

      const stats: SubjectStat[] = [];
      bySubject.forEach(({ grades, gradesBytime }, subj) => {
        const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
        const sorted = gradesBytime.sort((a, b) => a.date.localeCompare(b.date));
        let trend: "up" | "down" | "stable" = "stable";
        if (sorted.length >= 2) {
          const diff = sorted[sorted.length - 1].grade - sorted[sorted.length - 2].grade;
          if (diff > 3) trend = "up"; else if (diff < -3) trend = "down";
        }
        let status: SubjectStat["status"] = "stable";
        let statusLabel = "יציב";
        if (avg >= 90) { status = "excellent"; statusLabel = "מצטיין/ת"; }
        else if (avg >= 80) { status = "good"; statusLabel = "טוב מאוד"; }
        else if (avg < 60) { status = "critical"; statusLabel = "דרוש שיפור"; }
        else if (trend === "down") { status = "warning"; statusLabel = "במגמת ירידה"; }
        stats.push({ subject: subj, avg, count: grades.length, classAvg: null, trend, status, statusLabel });
      });
      setSubjectStats(stats.sort((a, b) => b.avg - a.avg));

      const { data: attRecs } = await supabase.from("attendance").select("status").eq("student_id", selectedChild.id).limit(200);
      if (attRecs && attRecs.length > 0) {
        const total = attRecs.length;
        const present = attRecs.filter((a: any) => a.status === "present").length;
        const absent = attRecs.filter((a: any) => a.status === "absent").length;
        const late = attRecs.filter((a: any) => a.status === "late").length;
        const absencePct = Math.round((absent / total) * 100);
        setAttendance({ total, present, absent, late, absencePct, presencePct: 100 - absencePct, redLine: absencePct >= 12 });
      }

      if (selectedChild.classId) {
        const { data: assigns } = await supabase.from("assignments").select("id").eq("class_id", selectedChild.classId).eq("published", true);
        const assignIds = (assigns || []).map((a: any) => a.id);
        if (assignIds.length > 0) {
          const { data: submitted } = await supabase.from("submissions").select("assignment_id").eq("student_id", selectedChild.id).in("assignment_id", assignIds);
          const submittedIds = new Set((submitted || []).map((s: any) => s.assignment_id));
          setPendingTasks(assignIds.filter(id => !submittedIds.has(id)).length);
        }
      }
      setChildLoading(false);
    };
    load();
  }, [selectedChild]);

  const overallAvg = useMemo(() =>
    subjectStats.length === 0 ? null : Math.round(subjectStats.reduce((s, ss) => s + ss.avg, 0) / subjectStats.length),
    [subjectStats]
  );
  
  const trendChartData = useMemo(() => recentGrades.slice().reverse().map(g => ({
    name: g.subject.slice(0, 6),
    grade: Math.round((g.grade / g.maxGrade) * 100),
    classAvg: g.classAvg ?? undefined,
  })), [recentGrades]);

  const gradeColor = (g: number) => g >= 90 ? "text-green-600" : g >= 75 ? "text-indigo-600" : g >= 60 ? "text-yellow-600" : "text-destructive";

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedChild) return;
    setSendingMsg(true);
    try {
      const { data: classData } = await supabase.from("profiles").select("class_id").eq("id", selectedChild.id).single();
      const { data: teacherLink } = await supabase.from("teacher_classes").select("user_id").eq("class_id", classData?.class_id).eq("is_homeroom", true).maybeSingle();
      if (!teacherLink?.user_id) throw new Error("לא נמצא מחנך");
      await supabase.from("messages").insert({ sender_id: profile.id, content: messageText });
      toast({ title: "ההודעה נשלחה למחנך! ✅" });
      setMessageDialog(false);
      setMessageText("");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally { setSendingMsg(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 max-w-7xl mx-auto px-4 py-6">
      {/* 1. Header Pulse */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <Card className="md:col-span-8 border-none bg-gradient-to-br from-indigo-700 to-purple-800 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <CardContent className="py-10 px-8 relative z-10">
            <p className="text-indigo-200 uppercase tracking-widest text-xs font-bold mb-3 opacity-80">Parent Insight Portal</p>
            <h1 className="text-4xl font-heading font-black mb-2 leading-none">הדופק היומי של {selectedChild?.fullName}</h1>
            <div className="flex items-center gap-3 text-indigo-100/80 text-sm mt-4">
               <Badge className="bg-white/20 text-white border-transparent hover:bg-white/30 backdrop-blur-sm">כיתה {selectedChild?.grade}'{selectedChild?.classNumber}</Badge>
               <span className="opacity-50">|</span>
               <span className="flex items-center gap-1"><Heart className="h-4 w-4 text-red-300 fill-red-300" /> מצב לימודי: יציב מאוד</span>
            </div>
          </CardContent>
        </Card>
        
        <div className="md:col-span-4 grid grid-cols-2 gap-4">
           {[
             { label: "ממוצע", val: overallAvg ?? "—", color: "text-white bg-indigo-600", icon: <TrendingUp className="h-4 w-4" /> },
             { label: "נוכחות", val: `${attendance?.presencePct ?? 100}%`, color: "bg-white", icon: <CheckCircle2 className="h-4 w-4" /> },
             { label: "מטלות", val: pendingTasks, color: "bg-white", icon: <Clock className="h-4 w-4" /> },
             { label: "רמה", val: `LVL ${selectedChild?.level || 4}`, color: "bg-white", icon: <Trophy className="h-4 w-4" /> },
           ].map((kpi, idx) => (
             <motion.div key={idx} variants={item} className={`${kpi.color} rounded-3xl p-6 flex flex-col justify-between border border-slate-100 shadow-sm`}>
                <div className="opacity-60">{kpi.icon}</div>
                <div>
                   <p className="text-3xl font-heading font-black leading-none">{kpi.val}</p>
                   <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">{kpi.label}</p>
                </div>
             </motion.div>
           ))}
        </div>
      </motion.div>

      {/* 2. Panoramic Insights */}
      {selectedChild && !childLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {/* Section: Academic Smart Analysis */}
           <motion.div variants={item} className="space-y-6">
              <div className="flex items-center justify-between mb-2 px-2">
                 <h2 className="text-xl font-heading font-black flex items-center gap-2 italic">
                    <Brain className="h-6 w-6 text-indigo-600" /> תמונה פדגוגית חכמה
                 </h2>
                 <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 font-bold" onClick={() => navigate("/grades")}>
                    דוח מלא <ChevronRight className="h-4 w-4" />
                 </Button>
              </div>

              {subjectStats.slice(0, 3).map((ss, idx) => (
                <Card key={ss.subject} className="border-none bg-white/50 backdrop-blur-md shadow-lg shadow-indigo-100/20 overflow-hidden group hover:scale-[1.01] transition-transform">
                   <CardContent className="p-0">
                      <div className="flex">
                         <div className={`w-2 ${ss.avg >= 90 ? 'bg-green-500' : ss.avg >= 70 ? 'bg-indigo-500' : 'bg-red-500'}`} />
                         <div className="p-5 flex-1">
                            <div className="flex justify-between items-start mb-2">
                               <div>
                                  <h3 className="font-heading font-black text-lg">{ss.subject}</h3>
                                  <Badge variant="secondary" className="text-[10px] py-0">{ss.statusLabel}</Badge>
                               </div>
                               <div className={`text-2xl font-black ${gradeColor(ss.avg)}`}>{ss.avg}</div>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed font-body">
                               {ss.status === "excellent" ? "הפגנת שליטה ורבלית וניתוחית מעולה. נחשב מהמובילים בתחום זה." :
                                ss.status === "warning" ? "נצפתה ירידה קלה בביצועים האחרונים. מומלץ לוודא הבנת החומר." :
                                "שומר על יציבות לימודית ומשתתף באופן פעיל."}
                            </p>
                         </div>
                      </div>
                   </CardContent>
                </Card>
              ))}
           </motion.div>

           {/* Section: Real-time Pulse & Communication */}
           <motion.div variants={item} className="space-y-6">
              <h2 className="text-xl font-heading font-black flex items-center gap-2 italic px-2">
                 <MessageSquare className="h-6 w-6 text-purple-600" /> מסרים ותקשורת
              </h2>
              
              <Card className="border-none bg-indigo-50/50 p-6 flex flex-col h-full min-h-[400px]">
                 <div className="space-y-4 flex-1">
                    {recentGrades.slice(0, 3).map((g, idx) => (
                      <div key={idx} className="relative pr-6 border-r-2 border-indigo-200">
                         <div className="absolute top-1.5 right-[-6px] w-3 h-3 rounded-full bg-indigo-600 shadow-sm" />
                         <div className="mb-6">
                            <div className="flex justify-between font-heading text-sm font-bold">
                               <span>{g.title}</span>
                               <span className={gradeColor(Math.round((g.grade/g.maxGrade)*100))}>{g.grade}</span>
                            </div>
                            {g.teacherTip && (
                               <div className="mt-2 text-xs text-indigo-900 bg-white p-3 rounded-2xl rounded-tr-none shadow-sm font-body">
                                  <b>מסר פדגוגי:</b> "{g.teacherTip}"
                               </div>
                            )}
                         </div>
                      </div>
                    ))}
                 </div>
                 <div className="pt-6">
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-14 text-lg font-heading rounded-2xl shadow-xl shadow-indigo-100"
                      onClick={() => { setMessageDialog(true); setMessageText(""); }}>
                       שלח מסר למחנך/ת
                    </Button>
                 </div>
              </Card>
           </motion.div>
        </div>
      )}

      {/* 3. Trends & Growth */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-20">
         <Card className="p-8 border-none bg-white shadow-xl shadow-slate-100">
            <h3 className="text-sm font-heading font-bold text-slate-400 uppercase tracking-widest mb-6">מגמת ציונים</h3>
            <div className="h-48">
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis dataKey="name" tick={{fontSize: 10, fill: "#94a3b8"}} axisLine={false} tickLine={false} />
                     <YAxis hide domain={[0, 100]} />
                     <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                     <Line type="monotone" dataKey="grade" stroke="#4f46e5" strokeWidth={5} dot={{ r: 6, fill: "#4f46e5", strokeWidth: 3, stroke: "#fff" }} />
                     <ReferenceLine y={overallAvg ?? 80} stroke="#e2e8f0" strokeDasharray="5 5" />
                  </LineChart>
               </ResponsiveContainer>
            </div>
         </Card>

         <Card className="p-8 border-none bg-white shadow-xl shadow-slate-100">
            <h3 className="text-sm font-heading font-bold text-slate-400 uppercase tracking-widest mb-6">סטטיסטיקת נוכחות</h3>
            <div className="flex items-center gap-10">
               <div className="relative w-32 h-32 shrink-0">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                     <path className="text-slate-100" strokeDasharray="100, 100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                     <path className="text-indigo-600" strokeDasharray={`${attendance?.presencePct ?? 100}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-2xl font-black text-slate-800">{attendance?.presencePct ?? 100}%</span>
                  </div>
               </div>
               <div className="space-y-4 flex-1">
                  <div>
                     <div className="flex justify-between text-xs font-bold mb-1">
                        <span>נוכחות</span>
                        <span>{attendance?.present || 0} שיעורים</span>
                     </div>
                     <Progress value={attendance?.presencePct || 100} className="h-1.5" />
                  </div>
                  <div>
                     <div className="flex justify-between text-xs font-bold mb-1">
                        <span>ביצועי הגשה</span>
                        <span>{100 - pendingTasks * 10}%</span>
                     </div>
                     <Progress value={100 - pendingTasks * 10} className="h-1.5 bg-slate-100" />
                  </div>
               </div>
            </div>
         </Card>
      </motion.div>

      {/* Message Dialog */}
      <Dialog open={messageDialog} onOpenChange={setMessageDialog}>
        <DialogContent className="max-w-md rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-indigo-600" />
              מסר למחנך של {selectedChild?.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <Textarea
              placeholder="כתוב הודעה אישית..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              className="font-body text-md resize-none h-32 rounded-2xl bg-indigo-50/30 border-none focus-visible:ring-indigo-500"
            />
            <Button className="w-full h-14 rounded-2xl gap-2 font-heading text-lg bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100" 
              onClick={sendMessage} disabled={sendingMsg || !messageText.trim()}>
              {sendingMsg ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              שלח הודעה עכשיו
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ParentDashboardPage;
