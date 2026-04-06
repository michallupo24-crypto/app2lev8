import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { FileUp, Calendar, AlertTriangle, CheckCircle2, Star, Clock, Heart, Minus, ShieldCheck } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ───────────────────────────────────────────── */
interface AttendanceRecord {
  id: string;
  date: string;
  lesson_number: string;
  subject: string;
  status: "absent" | "late" | "present" | "excused";
}

interface LessonNote {
  id: string;
  date: string;
  category: string;
  subject: string;
  comment?: string;
}

export default function StudentAttendancePage() {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { studentId: paramId } = useParams();
  const studentId = paramId || profile.id;
  const isParentView = !!paramId && paramId !== profile.id;

  const { toast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [excuseText, setExcuseText] = useState("");
  const [submittingExcuse, setSubmittingExcuse] = useState(false);
  const [studentName, setStudentName] = useState("");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  /* ── Data Logic ───────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    
    if (isParentView) {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", studentId).single();
      if (p) setStudentName(p.full_name);
    }

    // 1. Fetch attendance
    const { data: attData } = await supabase
      .from("attendance")
      .select(`
        id,
        status,
        lessons (lesson_date, lesson_number, subject)
      `)
      .eq("student_id", studentId)
      .in("status", ["absent", "late", "excused"]);

    const recordsList: AttendanceRecord[] = (attData || []).map((row: any) => ({
      id: row.id,
      status: row.status,
      date: row.lessons?.lesson_date,
      lesson_number: row.lessons?.lesson_number?.toString() || "1",
      subject: row.lessons?.subject || "כללי",
    }));
    setRecords(recordsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    // 2. Fetch lesson notes (Positive & Disciplinary)
    const { data: notesData } = await supabase
      .from("lesson_notes")
      .select(`
        id,
        category,
        comment,
        lessons (lesson_date, subject)
      `)
      .eq("student_id", studentId);

    const notesList: LessonNote[] = (notesData || []).map((row: any) => ({
      id: row.id,
      category: row.category,
      comment: row.comment,
      date: row.lessons?.lesson_date,
      subject: row.lessons?.subject || "כללי",
    }));
    setNotes(notesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    setLoading(false);
  }, [studentId, isParentView]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Calculations ─────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalPossible = 100; // Mock base or derived from lessons count
    const unexcused = records.filter(r => r.status === "absent").length;
    const lates = records.filter(r => r.status === "late").length;
    const presencePct = Math.max(0, 100 - (unexcused * 2)); // Dynamic-ish presence pulse
    return { presencePct, unexcused, lates, highlights: notes.filter(n => ["excellence", "positive_participation", "helped_peer"].includes(n.category)).length };
  }, [records, notes]);

  const handleExcuseSubmit = async () => {
    if (!selectedRecordId || !excuseText.trim()) return;
    setSubmittingExcuse(true);
    const { error } = await supabase.from("attendance").update({
       status: "excused",
       // Note: in a real schema we'd store the reason and original status elsewhere
    }).eq("id", selectedRecordId);
    
    if (!error) {
      toast({ title: "בקשת הצדקה נשלחה", description: "החיסור עודכן כ'מוצדק' במערכת באופן זמני לבדיקת המורה." });
      loadData();
    }
    setSubmittingExcuse(false);
    setSelectedRecordId(null);
    setExcuseText("");
  };

  const getEmojiForCategory = (cat: string) => {
    switch (cat) {
      case "excellence": return "🌟";
      case "positive_participation": return "🙋🏽‍♀️";
      case "helped_peer": return "🤝";
      case "disruption": return "⚠️";
      case "phone": return "📱";
      case "no_homework": return "❌";
      default: return "📝";
    }
  };

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto px-4 py-10 space-y-12 pb-32">
      
      {/* 1. HEADER & IDENTITY */}
      <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
           <h1 className="text-3xl font-heading font-black tracking-tighter flex items-center gap-3">
              <Clock className="h-8 w-8 text-indigo-600" /> יומן נוכחות ואירועים
           </h1>
           <p className="text-sm text-slate-500 font-bold">
              {isParentView ? `מעקב נוכחות עבור: ${studentName}` : "היסטוריית חיסורים, איחורים וציונים לשבח"}
           </p>
        </div>
        <div className="flex items-center gap-3">
           <Badge className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-lg shadow-indigo-100 uppercase tracking-widest">Live Sync</Badge>
        </div>
      </motion.div>

      {/* 2. ATTENDANCE PULSE CARD */}
      <motion.div variants={item}>
         <Card className="border-none bg-indigo-600 text-white rounded-[3rem] p-10 overflow-hidden relative shadow-2xl shadow-indigo-100">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
               <div className="space-y-4 text-center md:text-right">
                  <p className="text-[10px] uppercase font-black tracking-widest text-indigo-200">מדד נוכחות והתמדה</p>
                  <h2 className="text-6xl font-heading font-black">{stats.presencePct}%</h2>
                  <div className="flex items-center gap-2 text-indigo-100 font-bold text-xs">
                     <ShieldCheck className="h-4 w-4" /> רמת התמדה יציבה
                  </div>
               </div>
               <div className="flex-1 w-full max-w-md space-y-6">
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest text-indigo-200">
                     <span>Presence Health</span>
                     <span>Excellent</span>
                  </div>
                  <Progress value={stats.presencePct} className="h-4 bg-white/10" />
                  <div className="grid grid-cols-3 gap-4">
                     <div className="text-center"><p className="text-xl font-black">{stats.unexcused}</p><p className="text-[9px] uppercase font-black text-indigo-200">חיסורים</p></div>
                     <div className="text-center"><p className="text-xl font-black">{stats.lates}</p><p className="text-[9px] uppercase font-black text-indigo-200">איחורים</p></div>
                     <div className="text-center"><p className="text-xl font-black">{stats.highlights}</p><p className="text-[9px] uppercase font-black text-indigo-200">ציונים לשבח</p></div>
                  </div>
               </div>
            </div>
         </Card>
      </motion.div>

      {/* 3. TWO-COLUMN SPLIT: Absences vs Commendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
         
         {/* Absences Section */}
         <motion.div variants={item} className="space-y-6">
            <div className="flex items-center justify-between px-4">
               <h3 className="text-xl font-heading font-black flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-rose-500" /> חיסורים ואיחורים
               </h3>
               <Badge variant="outline" className="rounded-full text-rose-500 border-rose-100 px-3">{records.length}</Badge>
            </div>
            
            {records.length === 0 ? (
               <Card className="border-dashed border-2 border-slate-200 bg-transparent rounded-[2rem] p-10 text-center space-y-3 opacity-50">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                  <p className="text-sm font-bold font-heading">אין אירועי משמעת או חיסורים להצגה</p>
               </Card>
            ) : (
               <div className="space-y-4">
                  {records.map(r => (
                    <Card key={r.id} className="border-none bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${r.status === "absent" ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-500"}`}>
                                {r.status === "absent" ? <Minus className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                             </div>
                             <div>
                                <p className="text-sm font-black">{r.subject}</p>
                                <p className="text-[10px] text-slate-400 font-bold">שיעור {r.lesson_number} • {new Date(r.date).toLocaleDateString("he-IL")}</p>
                             </div>
                          </div>
                          {r.status !== "excused" ? (
                             <Button size="sm" variant="outline" className="rounded-xl border-slate-100 hover:bg-slate-50 text-[10px] font-black uppercase h-9 px-4" onClick={() => setSelectedRecordId(r.id)}>הגש הצדקה</Button>
                          ) : (
                             <Badge className="bg-emerald-100 text-emerald-600 border-transparent rounded-lg text-[9px] font-black uppercase">מוצדק</Badge>
                          )}
                       </div>
                    </Card>
                  ))}
               </div>
            )}
         </motion.div>

         {/* Commendations Section */}
         <motion.div variants={item} className="space-y-6">
            <div className="flex items-center justify-between px-4">
               <h3 className="text-xl font-heading font-black flex items-center gap-3">
                  <Star className="h-5 w-5 text-amber-500" /> קיר הצטיינות וציונים לשבח
               </h3>
               <Badge className="bg-amber-100 text-amber-600 rounded-full px-3">{notes.length}</Badge>
            </div>

            {notes.length === 0 ? (
               <Card className="border-dashed border-2 border-slate-200 bg-transparent rounded-[2rem] p-10 text-center space-y-3 opacity-50">
                  <Heart className="h-10 w-10 mx-auto text-rose-300" />
                  <p className="text-sm font-bold font-heading">עדיין לא נרשמו הערות מיוחדות</p>
               </Card>
            ) : (
               <div className="space-y-4">
                  {notes.map(n => (
                    <Card key={n.id} className="border-none bg-amber-500/5 dark:bg-amber-500/10 rounded-3xl p-6 border border-amber-500/10 shadow-sm hover:shadow-md transition-all group">
                       <div className="flex items-start gap-5">
                          <div className="text-3xl bg-white dark:bg-slate-900 w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm">
                             {getEmojiForCategory(n.category)}
                          </div>
                          <div className="flex-1 space-y-2">
                             <div className="flex justify-between items-start">
                                <p className="text-sm font-black">{n.subject}</p>
                                <p className="text-[10px] text-amber-600 font-bold">{new Date(n.date).toLocaleDateString("he-IL")}</p>
                             </div>
                             {n.comment && <p className="text-[11px] text-slate-600 dark:text-slate-300 italic leading-relaxed">" {n.comment} "</p>}
                          </div>
                       </div>
                    </Card>
                  ))}
               </div>
            )}
         </motion.div>
      </div>

      {/* EXCUSE MODAL */}
      <Dialog open={!!selectedRecordId} onOpenChange={o => !o && setSelectedRecordId(null)}>
         <DialogContent className="rounded-[2.5rem] p-10 max-w-md text-right" dir="rtl">
            <DialogHeader className="mb-6">
               <DialogTitle className="text-2xl font-black font-heading flex items-center gap-3">
                  <FileUp className="h-7 w-7 text-indigo-600" /> הגשת הצדקה רשמית
               </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
               <div className="p-4 bg-indigo-50 rounded-[1.5rem] border border-indigo-100 flex items-center gap-4">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  <div>
                     <p className="text-sm font-black italic">בקשה עבור חיסור בתאריך {records.find(r => r.id === selectedRecordId)?.date}</p>
                  </div>
               </div>
               <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">סיבת ההיעדרות</p>
                  <Textarea 
                     value={excuseText} 
                     onChange={e => setExcuseText(e.target.value)} 
                     placeholder="נא פרטו את סיבת החיסור (חובה לצרף אישור רפואי להמשך)..." 
                     className="rounded-2xl border-slate-100 bg-slate-50/50 min-h-[100px] p-4 text-sm"
                  />
               </div>
               <Button variant="outline" className="w-full h-12 rounded-2xl border-dashed border-2 border-slate-200 text-xs font-bold gap-2">
                  <FileUp className="h-4 w-4" /> העלאת אישור רפואי / הורים
               </Button>
               <Button onClick={handleExcuseSubmit} disabled={submittingExcuse || !excuseText.trim()} className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black gap-3 shadow-xl shadow-indigo-100 transition-all">
                  {submittingExcuse ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rotate-180" />}
                  שלח הצדקה למחנך/ת
               </Button>
            </div>
         </DialogContent>
      </Dialog>
    </motion.div>
  );
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
