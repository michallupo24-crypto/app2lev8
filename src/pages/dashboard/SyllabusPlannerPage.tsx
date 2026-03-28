import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar as CalendarIcon, 
  FileText, 
  Settings, 
  Plus, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  BrainCircuit,
  Info,
  Trash2,
  ArrowRight,
  Calculator,
  Save,
  Clock,
  BookOpen
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/hooks/useAuth";
import { calculateActualLessons, analyzeSyllabusPace } from "@/utils/pedagogicalPlanUtils";

interface SyllabusTopic {
  id?: string;
  topic: string;
  estimated_hours: number;
  description?: string;
}

const SyllabusPlannerPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [topics, setTopics] = useState<SyllabusTopic[]>([]);
  const [targetDate, setTargetDate] = useState<string>(() => {
    const year = new Date().getFullYear();
    const isSpring = new Date().getMonth() < 7;
    return isSpring ? `${year}-06-20` : `${year + 1}-06-20`;
  });
  const [calculationResult, setCalculationResult] = useState<any>(null);

  const subjects = ["מתמטיקה", "אנגלית", "לשון", "היסטוריה", "תנ\"ך", "פיזיקה", "ביולוגיה", "כימיה", "ספרות", "אזרחות"];

  const isCoordinator = profile.roles.some(r => ["subject_coordinator", "grade_coordinator", "management", "system_admin"].includes(r));

  useEffect(() => {
    const loadClasses = async () => {
      setLoading(true);
      const { data: cls } = await supabase
        .from("classes")
        .select("id, grade, class_number")
        .eq("school_id", profile.schoolId);
      if (cls) setClasses(cls.map(c => ({ id: c.id, grade: c.grade, number: c.class_number })));
      setLoading(false);
    };
    loadClasses();
  }, [profile.schoolId]);

  const loadSyllabus = async () => {
    if (!selectedSubject || !selectedClass) return;
    setLoading(true);
    
    const cls = classes.find(c => c.id === selectedClass);
    if (!cls) return;

    const { data } = await supabase
      .from("syllabi")
      .select("*")
      .eq("school_id", profile.schoolId)
      .eq("subject", selectedSubject)
      .eq("grade", cls.grade as any)
      .order("order_index", { ascending: true });

    if (data && data.length > 0) {
      setTopics(data.map(t => ({
        id: t.id,
        topic: t.topic,
        estimated_hours: t.estimated_hours,
        description: t.description || ""
      })));
    } else {
      setTopics([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSyllabus();
  }, [selectedSubject, selectedClass]);

  const addTopic = () => {
    setTopics([...topics, { topic: "", estimated_hours: 1 }]);
  };

  const removeTopic = (index: number) => {
    setTopics(topics.filter((_, i) => i !== index));
  };

  const updateTopic = (index: number, field: keyof SyllabusTopic, value: any) => {
    const newTopics = [...topics];
    newTopics[index] = { ...newTopics[index], [field]: value };
    setTopics(newTopics);
  };

  const saveSyllabus = async () => {
    if (!selectedSubject || !selectedClass) {
      toast({ title: "בחר מקצוע וכיתה תחילה", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const cls = classes.find(c => c.id === selectedClass);
      
      // Delete old entries for this school/subject/grade mix
      await supabase.from("syllabi")
        .delete()
        .eq("school_id", profile.schoolId)
        .eq("subject", selectedSubject)
        .eq("grade", cls?.grade as any);

      // Insert new ones
      const toInsert = topics.map((t, i) => ({
        school_id: profile.schoolId,
        subject: selectedSubject,
        grade: cls?.grade as any,
        topic: t.topic,
        description: t.description,
        estimated_hours: t.estimated_hours,
        order_index: i
      }));

      const { error } = await supabase.from("syllabi").insert(toInsert);
      if (error) throw error;

      toast({ title: "הסילבוס נשמר בהצלחה! 💾", description: "כל המורים המלמדים מקצוע זה יוכלו לצפות בתכנון עכשיו." });
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const calculatePace = async () => {
    if (!selectedClass || !selectedSubject || topics.length === 0) {
      toast({ title: "הזן סילבוס ובחר כיתה לחישוב", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await calculateActualLessons(selectedClass, selectedSubject, new Date().toISOString(), targetDate);
      const analysis = await analyzeSyllabusPace(
        selectedClass, 
        selectedSubject, 
        topics.map(t => ({ topic: t.topic, hours: t.estimated_hours })), 
        targetDate
      );
      
      setCalculationResult({ ...result, ...analysis });
      toast({ title: "ניתוח הספק הושלם! 🚀" });
    } catch (e: any) {
      toast({ title: "שגיאה בחישוב", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "אנא נתח את הסילבוס המצורף. החזר לי רשימת נושאים בפורמט JSON בלבד: [{\"topic\": \"שם הנושא\", \"hours\": כמות שעות מוערכת}]. וודא שמות מקצועות בעברית תקינה." },
              { inline_data: { mime_type: file.type, data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const match = text?.match(/\[.*\]/s);
      if (match) {
        const result = JSON.parse(match[0]);
        setTopics(result.map((r: any) => ({ topic: r.topic, estimated_hours: r.hours || 1 })));
        toast({ title: "ה-AI זיהה את נושאי הלימוד! 🧠" });
      }
    } catch (e: any) {
      toast({ title: "שגיאה בניתוח AI", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isCoordinator) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 p-8">
        <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-heading font-bold">גישה מוגבלת</h2>
        <p className="text-muted-foreground text-center max-w-md">דף זה מיועד לרכזי מקצוע ומנהלים בלבד לצורך תכנון פדגוגי אסטרטגי.</p>
      </div>
    );
  }

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="p-4 md:p-8 space-y-8 dir-rtl text-right">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div variants={item}>
          <h1 className="text-4xl font-heading font-black text-primary flex items-center gap-4 tracking-tighter">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center rotate-3 shadow-inner">
              <BrainCircuit className="h-7 w-7 text-primary" />
            </div>
            תכנון סילבוס חכם
          </h1>
          <p className="text-slate-500 font-medium mt-2 flex items-center gap-2">
            <Calculator className="h-4 w-4" /> ניהול נושאי לימוד, שעות הוראה ואינטגרציית חגים
          </p>
        </motion.div>

        <motion.div variants={item} className="flex items-center gap-3">
           <Button 
            variant="outline" 
            className="rounded-xl gap-2 border-primary/20 bg-white/50 backdrop-blur-sm hover:bg-primary/5 transition-all"
            onClick={() => document.getElementById('syllabus-ai-upload')?.click()}
            disabled={analyzing}
           >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4 text-primary" />}
            ייבוא סילבוס ב-AI ⚡
           </Button>
           <input id="syllabus-ai-upload" type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
           
           <Button 
            onClick={saveSyllabus} 
            disabled={saving || topics.length === 0} 
            className="rounded-xl gap-2 shadow-lg shadow-primary/20"
           >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            שמור סילבוס
           </Button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* ─── LEFT: CONTROLS & TOPICS (8 COLS) ─── */}
        <div className="lg:col-span-8 space-y-6">
          <motion.div variants={item}>
            <Card className="border-none shadow-xl bg-white/60 backdrop-blur-md overflow-hidden ring-1 ring-black/[0.03]">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">מקצוע</label>
                        <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                          <SelectTrigger className="w-40 h-10 rounded-xl bg-white shadow-sm">
                            <SelectValue placeholder="בחר מקצוע" />
                          </SelectTrigger>
                          <SelectContent>
                            {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">כיתת השוואה</label>
                        <Select value={selectedClass} onValueChange={setSelectedClass}>
                          <SelectTrigger className="w-40 h-10 rounded-xl bg-white shadow-sm">
                            <SelectValue placeholder="בחר כיתה" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>)}
                          </SelectContent>
                        </Select>
                     </div>
                  </div>
                  <Button onClick={addTopic} variant="secondary" className="rounded-xl h-10 gap-2 bg-primary/10 text-primary hover:bg-primary/20">
                    <Plus className="h-4 w-4" /> הוסף פרק לימוד
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                 <div className="divide-y divide-slate-100">
                    <AnimatePresence>
                      {topics.length === 0 ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-12 text-center text-muted-foreground space-y-3">
                          <BookOpen className="h-12 w-12 mx-auto opacity-10" />
                          <p className="font-heading font-medium">אין נושאי לימוד בסילבוס כרגע</p>
                          <p className="text-xs">השתמש ב-AI או הוסף נושאים ידנית כדי להתחיל בתכנון</p>
                        </motion.div>
                      ) : (
                        topics.map((t, index) => (
                          <motion.div 
                            key={index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors group"
                          >
                            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors text-xs shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4">
                               <div className="md:col-span-8">
                                  <Input 
                                    placeholder="שם הפרק / הנושא" 
                                    value={t.topic} 
                                    onChange={(e) => updateTopic(index, 'topic', e.target.value)}
                                    className="h-10 bg-transparent border-none focus-visible:ring-0 font-heading font-bold p-0 text-base"
                                  />
                                  <Input 
                                    placeholder="תיאור קצר..." 
                                    value={t.description} 
                                    onChange={(e) => updateTopic(index, 'description', e.target.value)}
                                    className="h-6 bg-transparent border-none focus-visible:ring-0 text-xs text-muted-foreground p-0"
                                  />
                               </div>
                               <div className="md:col-span-4 flex items-center justify-end gap-3">
                                  <div className="flex items-center gap-2 bg-slate-100/50 p-1 px-3 rounded-lg ring-1 ring-slate-200">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    <Input 
                                      type="number" 
                                      value={t.estimated_hours} 
                                      onChange={(e) => updateTopic(index, 'estimated_hours', Number(e.target.value))}
                                      className="w-10 h-7 bg-transparent border-none focus-visible:ring-0 text-center font-bold p-0 text-sm"
                                    />
                                    <span className="text-[10px] font-bold text-slate-400">שעות</span>
                                  </div>
                                  <Button variant="ghost" size="icon" onClick={() => removeTopic(index)} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                               </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                 </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ─── RIGHT: ANALYTICS (4 COLS) ─── */}
        <div className="lg:col-span-4 space-y-6">
           <motion.div variants={item}>
              <Card className="border-none shadow-xl bg-gradient-to-br from-primary/10 via-background to-background ring-1 ring-primary/20">
                <CardHeader>
                  <CardTitle className="text-xl font-heading flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" /> מנוע חיזוי פדגוגי
                  </CardTitle>
                  <CardDescription>חישוב הספק מול לוח השנה</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">תאריך יעד לימודי (סוף מחצית/בגרות)</label>
                      <Input 
                        type="date" 
                        value={targetDate} 
                        onChange={(e) => setTargetDate(e.target.value)} 
                        className="rounded-xl border-slate-200"
                      />
                   </div>

                   <div className="p-4 bg-white/50 rounded-2xl border border-white space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-slate-600">סך שעות סילבוס</span>
                         <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          {topics.reduce((sum, t) => sum + t.estimated_hours, 0)} שעות
                         </Badge>
                      </div>
                      <Button onClick={calculatePace} disabled={loading || !selectedClass} className="w-full rounded-xl gap-2 shadow-sm">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "חשב התקדמות צפויה"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                   </div>

                   <AnimatePresence>
                      {calculationResult && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          className="space-y-4"
                        >
                           <div className="grid grid-cols-2 gap-3">
                              <div className="p-4 rounded-2xl bg-white shadow-sm border border-slate-100 text-center space-y-1">
                                 <p className="text-[10px] font-bold text-muted-foreground">שיעורים נטו</p>
                                 <p className="text-2xl font-heading font-black text-primary">{calculationResult.actualLessons}</p>
                              </div>
                              <div className="p-4 rounded-2xl bg-white shadow-sm border border-slate-100 text-center space-y-1">
                                 <p className="text-[10px] font-bold text-muted-foreground">מפגשים שיבוטלו</p>
                                 <p className="text-2xl font-heading font-black text-orange-500">{calculationResult.cancelledByHolidays + calculationResult.cancelledByEvents}</p>
                              </div>
                           </div>

                           <div className={`p-5 rounded-2xl border ${calculationResult.status === 'behind' ? 'bg-destructive/10 border-destructive/20' : calculationResult.status === 'ahead' ? 'bg-green-500/10 border-green-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                              <div className="flex items-start gap-3">
                                 {calculationResult.status === 'behind' ? <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" /> : <Info className="h-6 w-6 text-primary shrink-0 mt-0.5" />}
                                 <div className="space-y-1">
                                    <h4 className={`text-sm font-heading font-bold ${calculationResult.status === 'behind' ? 'text-destructive' : 'text-primary'}`}>חוות דעת פדגוגית</h4>
                                    <p className="text-xs leading-relaxed opacity-80">{calculationResult.message}</p>
                                 </div>
                              </div>
                              <Progress 
                                value={Math.min((calculationResult.actualLessons / topics.reduce((sum, t) => sum + t.estimated_hours, 1)) * 100, 100)} 
                                className="h-2 rounded-full mt-4" 
                              />
                           </div>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </CardContent>
              </Card>
           </motion.div>

           <motion.div variants={item}>
              <Card className="border-none shadow-lg bg-slate-900 text-white overflow-hidden">
                <CardContent className="p-6 relative">
                   <div className="absolute top-0 right-0 p-8 opacity-10">
                      <BrainCircuit className="h-24 w-24" />
                   </div>
                   <h4 className="text-sm font-heading font-bold mb-2">טיפ חכם מה-AI 🤖</h4>
                   <p className="text-xs text-slate-300 leading-relaxed">
                     השתמש בייבוא ה-AI לסילבוס כדי לחסוך זמן. ה-AI יודע לזהות את נושאי הלימוד הליבה ואת השעות המקובלות לפי הנחיות משרד החינוך.
                   </p>
                </CardContent>
              </Card>
           </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default SyllabusPlannerPage;
         </motion.div>
        )}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-start gap-4">
          <Info className="h-6 w-6 text-primary mt-1 shrink-0" />
          <div className="space-y-1">
            <h4 className="font-heading font-bold text-primary">איך זה עובד?</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              המערכת סופרת את הפולי של שיעורי ההוראה המשובצים במערכת השעות עבור הכיתה שנבחרה. מכלל השיעורים, המערכת מחסירה באופן אוטומטי חגים רלוונטיים ואירועי בית ספר (טיולים, מבחנים) שהוזנו בלוח. בסוף מתקבלת התחזית המדויקת של כמות השיעורים שבם באמת ניתן ללמד עד לתאריך היעד.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default SyllabusPlannerPage;
