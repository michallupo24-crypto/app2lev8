import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/hooks/useAuth";

interface CalendarEvent {
  id: string;
  title: string;
  start_date: string;
  event_type: 'holiday' | 'school_event' | 'exam_period';
  is_no_lessons_day: boolean;
}

const SyllabusPlannerPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [lessonsRequired, setLessonsRequired] = useState<number | "">("");
  const [targetDate, setTargetDate] = useState<string>(() => {
    const year = new Date().getFullYear();
    return `${year}-06-20`; // Default school year end
  });

  const isCoordinator = profile.roles.some(r => ["subject_coordinator", "grade_coordinator", "management", "system_admin"].includes(r));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Load classes
      const { data: cls } = await supabase.from("classes").select("id, grade, class_number").eq("school_id", profile.schoolId);
      if (cls) setClasses(cls.map(c => ({ id: c.id, grade: c.grade, number: c.class_number })));
      
      // Load events
      const { data: evs } = await supabase.from("school_calendar_events")
        .select("*")
        .eq("school_id", profile.schoolId)
        .order("start_date", { ascending: true });
      if (evs) setEvents(evs as any);
      
      setLoading(false);
    };
    load();
  }, [profile.schoolId]);

  const importHolidays = async () => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=${year}&month=all&ss=on&mf=on&c=off&i=on`);
      const data = await response.json();
      
      const holidayEvents = data.items
        .filter((item: any) => item.category === "holiday")
        .map((item: any) => ({
          school_id: profile.schoolId,
          title: item.hebrew || item.title,
          start_date: item.date,
          end_date: item.date,
          event_type: 'holiday',
          is_no_lessons_day: true
        }));

      const { error } = await supabase.from("school_calendar_events").insert(holidayEvents);
      if (error) throw error;
      
      toast({ title: "החגים יובאו בהצלחה! 🍎🍯" });
      // Reload events
      const { data: evs } = await supabase.from("school_calendar_events").select("*").eq("school_id", profile.schoolId);
      if (evs) setEvents(evs as any);
    } catch (e: any) {
      toast({ title: "שגיאה בייבוא חגים", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const calculateCapacity = async () => {
    if (!selectedClass || !targetDate) {
        toast({ title: "בחר כיתה ותאריך יעד", variant: "destructive" });
        return;
    }
    
    setLoading(true);
    try {
      // 1. Get timetable slots for this class
      const { data: slots } = await supabase.from("timetable_slots")
        .select("day_of_week, lesson_number")
        .eq("class_id", selectedClass);
      
      if (!slots || slots.length === 0) {
        toast({ title: "לא נמצאה מערכת שעות לכיתה זו", variant: "destructive" });
        setLoading(false);
        return;
      }

      // 2. Map slots to days of week (0-6)
      const dayMap = new Set(slots.map(s => s.day_of_week));
      const totalSlotCountPerWeek = slots.length;

      // 3. Iterate through dates from today to targetDate
      let availableLessons = 0;
      let holidaysCount = 0;
      const start = new Date();
      const end = new Date(targetDate);
      
      const eventDates = new Set(events.filter(e => e.is_no_lessons_day).map(e => e.start_date));

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay(); // 0 is Sunday in JS, matches our DB if Sunday=0

        if (dayMap.has(dayOfWeek)) {
          // It's a day we have lessons
          if (eventDates.has(dateStr)) {
            holidaysCount += slots.filter(s => s.day_of_week === dayOfWeek).length;
          } else {
            availableLessons += slots.filter(s => s.day_of_week === dayOfWeek).length;
          }
        }
      }

      setCalculationResult({
        total: availableLessons,
        lost: holidaysCount,
        status: lessonsRequired ? (availableLessons >= Number(lessonsRequired) ? 'safe' : 'danger') : 'unknown'
      });

      toast({ title: "החישוב הושלם! 📊", description: `נמצאו ${availableLessons} שיעורים פנויים.` });
    } catch (e: any) {
      toast({ title: "שגיאה בחישוב", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const [calculationResult, setCalculationResult] = useState<{total: number, lost: number, status: 'safe' | 'danger' | 'unknown'} | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    toast({ title: "ה-AI מנתח את הסילבוס...", description: "אנא המתן בזמן שאנו מחלצים את שעות ההוראה הנדרשות." });

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
              { text: "אנא נתח את הסילבוס והחזר לי רק JSON: {\"lessons_required\": 60}." },
              { inline_data: { mime_type: file.type, data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const match = text?.match(/\{.*\}/s);
      if (match) {
        const result = JSON.parse(match[0]);
        setLessonsRequired(result.lessons_required);
        toast({ title: "ניתוח הסילבוס הושלם!", description: `התגלו ${result.lessons_required} שעות נדרשות.` });
      }
    } catch (e: any) {
      toast({ title: "שגיאה בניתוח", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isCoordinator) {
    return <div className="p-8 text-center font-heading text-lg">אין לך הרשאות לצפות בדף זה. רק רכזי מקצוע ומנהלים יכולים לתכנן סילבוס.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 dir-rtl text-right">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-primary flex items-center gap-3">
            <BrainCircuit className="h-8 w-8" /> תכנון סילבוס והספק פדגוגי
          </h1>
          <p className="text-muted-foreground mt-2">מעקב חכם אחר התקדמות הלמידה אל מול לוח השנה והחגים</p>
        </div>
        <Button onClick={importHolidays} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarIcon className="h-4 w-4" />}
          ייבוא חגי ישראל אוטומטי
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Planner Settings */}
        <Card className="md:col-span-1 shadow-lg border-primary/10">
          <CardHeader>
            <CardTitle className="text-xl font-heading flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" /> הגדרות תכנון
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">בחר כיתה</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר כיתה..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">יעד סיום (בגרות/סוף שנה)</label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">שעות הוראה נדרשות (לפי סילבוס)</label>
              <div className="flex gap-2">
                <Input type="number" placeholder="למשל: 60" value={lessonsRequired} onChange={(e) => setLessonsRequired(e.target.value === "" ? "" : Number(e.target.value))} />
                <Button 
                   variant="secondary" 
                   size="icon" 
                   title="ניתוח AI של קובץ סילבוס" 
                   onClick={() => document.getElementById('syllabus-upload')?.click()}
                   disabled={analyzing}
                >
                   {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </Button>
                <input 
                  id="syllabus-upload" 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,image/*" 
                  onChange={handleFileUpload} 
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">טיפ: לחץ על סמל הקובץ כדי להעלות סילבוס וניתוח AI אוטומטי של שעות.</p>
            </div>

            <Button className="w-full mt-4 gap-2" onClick={calculateCapacity}>
              חשב הספק פועל 🚀
            </Button>
          </CardContent>
        </Card>

        {/* Calendar Events Summary */}
        <Card className="md:col-span-2 shadow-lg border-primary/10">
          <CardHeader>
            <CardTitle className="text-xl font-heading flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" /> אירועי לוח שנה משפיעים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
               {loading ? (
                 <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
               ) : events.length === 0 ? (
                 <div className="text-center p-12 bg-muted/20 rounded-xl border-2 border-dashed border-muted">
                    <p className="text-muted-foreground">אין עדיין אירועים בלוח השנה. השתמש בכפתור הייבוא או הוסף ידנית.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto p-1">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${ev.event_type === 'holiday' ? 'bg-orange-500' : 'bg-primary'}`} />
                          <div>
                            <p className="font-heading font-medium text-sm">{ev.title}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(ev.start_date).toLocaleDateString('he-IL')}</p>
                          </div>
                        </div>
                        {ev.is_no_lessons_day && <Badge variant="destructive" className="text-[9px]">ביטול שיעור</Badge>}
                      </div>
                    ))}
                 </div>
               )}
               <Button variant="ghost" className="w-full border-2 border-dashed border-muted mt-2 gap-2 text-muted-foreground hover:text-primary hover:border-primary/50">
                  <Plus className="h-4 w-4" /> הוסף אירוע בית ספרי ידני
               </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results/Dashboard */}
        {calculationResult && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="md:col-span-3">
            <Card className={`border-none shadow-2xl relative overflow-hidden ${calculationResult.status === 'safe' ? 'bg-green-50/50' : 'bg-red-50/50'}`}>
               <div className={`absolute top-0 left-0 w-full h-1 ${calculationResult.status === 'safe' ? 'bg-green-500' : 'bg-red-500'}`} />
               <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center text-center">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm">שיעורי הוראה פנויים</p>
                      <p className={`text-5xl font-heading font-bold ${calculationResult.status === 'safe' ? 'text-green-600' : 'text-red-600'}`}>
                        {calculationResult.total}
                      </p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm">שעות ש"אבדו" בחגים</p>
                      <p className="text-3xl font-heading font-semibold text-orange-500">
                        {calculationResult.lost}
                      </p>
                    </div>

                    <div className="md:col-span-2 text-right p-6 bg-white/60 rounded-2xl border border-white">
                      {calculationResult.status === 'safe' ? (
                        <div className="flex items-start gap-4">
                          <CheckCircle2 className="h-10 w-10 text-green-500 shrink-0" />
                          <div>
                            <h3 className="text-xl font-heading font-bold text-green-700">התחזית אופטימית! ✅</h3>
                            <p className="text-green-600/80 text-sm mt-1">יש בידך מספיק שעות לכיסוי הסילבוס. נותרו לך אפילו {calculationResult.total - (Number(lessonsRequired) || 0)} שעות רזרבה לשיעור חזרה או העשרה.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-4">
                          <AlertCircle className="h-10 w-10 text-red-500 shrink-0" />
                          <div>
                            <h3 className="text-xl font-heading font-bold text-red-700">זהירות: חוסר בשעות ⚠️</h3>
                            <p className="text-red-600/80 text-sm mt-1">חסרות לך כ-{Math.abs(calculationResult.total - (Number(lessonsRequired) || 0))} שעות הוראה כדי לעמוד ביעדי הסילבוס. כדאי לבדוק צמצום חומר או הוספת שיעורי תגבור.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
               </CardContent>
            </Card>
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
