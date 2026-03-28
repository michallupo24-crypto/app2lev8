
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  BrainCircuit,
  Loader2,
  Trophy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { analyzeSyllabusPace } from "@/utils/pedagogicalPlanUtils";

interface SyllabusTopic {
  id: string;
  topic: string;
  estimated_hours: number;
}

interface ClassSyllabus {
  classId: string;
  className: string;
  subject: string;
  topics: SyllabusTopic[];
  completedIds: string[];
  pace?: { status: string; message: string };
  isExpanded: boolean;
}

const SyllabusProgressTracker = ({ teacherId, schoolId }: { teacherId: string; schoolId: string }) => {
  const [data, setData] = useState<ClassSyllabus[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Find all classes & subjects for this teacher
      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("class_id, subject, classes(grade, class_number)")
        .eq("teacher_id", teacherId);

      if (!slots) return;

      // Unique class-subject pairs
      const pairs = Array.from(new Set(slots.map(s => `${s.class_id}|${s.subject}`)))
        .map(p => {
            const [id, subject] = p.split('|');
            const slot = slots.find(s => s.class_id === id && s.subject === subject);
            return { id, subject, grade: slot?.classes?.grade, number: slot?.classes?.class_number };
        });

      const results: ClassSyllabus[] = [];

      for (const pair of pairs) {
        // 2. Fetch syllabus topics for this subject/grade
        const { data: topics } = await supabase
          .from("syllabi")
          .select("id, topic, estimated_hours")
          .eq("school_id", schoolId)
          .eq("subject", pair.subject)
          .eq("grade", pair.grade as any)
          .order("order_index", { ascending: true });

        if (!topics || topics.length === 0) continue;

        // 3. Fetch completed progress
        const { data: progress } = await supabase
          .from("class_syllabus_progress")
          .select("syllabus_id")
          .eq("class_id", pair.id)
          .eq("status", "completed");

        const completedIds = progress?.map(p => p.syllabus_id) || [];

        // 4. Calculate pace
        const remainingTopics = topics.filter(t => !completedIds.includes(t.id));
        const pace = await analyzeSyllabusPace(
            pair.id, 
            pair.subject, 
            remainingTopics.map(t => ({ topic: t.topic, hours: t.estimated_hours })),
            new Date(new Date().getFullYear(), 5, 20).toISOString() // Default end of year
        );

        results.push({
          classId: pair.id,
          className: `${pair.grade}' ${pair.number}`,
          subject: pair.subject,
          topics: topics as any,
          completedIds,
          pace,
          isExpanded: false
        });
      }

      setData(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teacherId, schoolId]);

  const toggleTopic = async (classIndex: number, topicId: string, isCompleted: boolean) => {
    const classData = data[classIndex];
    try {
      if (isCompleted) {
        await supabase.from("class_syllabus_progress").upsert({
          class_id: classData.classId,
          syllabus_id: topicId,
          status: "completed",
          completed_at: new Date().toISOString()
        });
      } else {
        await supabase.from("class_syllabus_progress")
          .delete()
          .eq("class_id", classData.classId)
          .eq("syllabus_id", topicId);
      }

      // Update local state
      const newData = [...data];
      if (isCompleted) {
        newData[classIndex].completedIds.push(topicId);
      } else {
        newData[classIndex].completedIds = newData[classIndex].completedIds.filter(id => id !== topicId);
      }
      setData(newData);

      toast({ 
        title: isCompleted ? "כל הכבוד! נרשמה התקדמות 🎉" : "הסטטוס עודכן",
        description: isCompleted ? "נושא זה נוסף לרשימת הנושאים שהושלמו." : ""
      });
    } catch (e) {
        toast({ title: "שגיאה בעדכון", variant: "destructive" });
    }
  };

  if (loading) return (
    <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  );

  if (data.length === 0) return null;

  return (
    <div className="space-y-4 dir-rtl text-right">
       <h2 className="text-xl font-heading font-bold flex items-center gap-2 px-1">
        <BrainCircuit className="h-5 w-5 text-primary" /> מעקב הספק פדגוגי חכם
       </h2>

       {data.map((c, idx) => {
         const progress = (c.completedIds.length / c.topics.length) * 100;
         return (
           <Card key={`${c.classId}-${c.subject}`} className="border-none shadow-md bg-white/60 backdrop-blur-sm overflow-hidden ring-1 ring-black/[0.02]">
             <CardHeader className="p-4 py-3 cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
               onClick={() => {
                 const newData = [...data];
                 newData[idx].isExpanded = !newData[idx].isExpanded;
                 setData(newData);
               }}>
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {c.className.split(' ')[0]}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-heading font-bold">{c.subject} - כיתה {c.className}</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Progress value={progress} className="h-1.5 w-24 rounded-full" />
                        <span className="text-[10px] font-bold text-muted-foreground">{Math.round(progress)}% הושלם</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.pace?.status === 'behind' ? (
                       <Badge variant="destructive" className="text-[9px] animate-pulse">פיגור בלו"ז ⚠️</Badge>
                    ) : progress === 100 ? (
                       <Badge className="bg-green-500 text-white text-[9px]">הושלם! 🏆</Badge>
                    ) : (
                       <Badge variant="secondary" className="text-[9px]">בקצב ⏱️</Badge>
                    )}
                    {c.isExpanded ? <ChevronUp className="h-4 w-4 opacity-30" /> : <ChevronDown className="h-4 w-4 opacity-30" />}
                  </div>
               </div>
             </CardHeader>
             
             <AnimatePresence>
                {c.isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <CardContent className="p-4 pt-0 border-t border-slate-100 bg-slate-50/30">
                       {/* AI Insight Bar */}
                       {c.pace && (
                         <div className={`mt-3 p-3 rounded-xl border flex items-start gap-3 mb-4 ${
                           c.pace.status === 'behind' ? 'bg-destructive/5 border-destructive/10' : 'bg-primary/5 border-primary/10'
                         }`}>
                           {c.pace.status === 'behind' ? <AlertCircle className="h-4 w-4 text-destructive mt-0.5" /> : <Clock className="h-4 w-4 text-primary mt-0.5" />}
                           <p className="text-[11px] leading-tight font-medium opacity-80">{c.pace.message}</p>
                         </div>
                       )}

                       <div className="space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">נושאי לימוד בסילבוס</p>
                          {c.topics.map((t) => (
                            <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-white/50 border border-white hover:border-primary/20 transition-all group">
                              <div className="flex items-center gap-3">
                                <Checkbox 
                                  checked={c.completedIds.includes(t.id)} 
                                  onCheckedChange={(checked) => toggleTopic(idx, t.id, !!checked)}
                                  className="rounded-md border-slate-300 data-[state=checked]:bg-primary"
                                />
                                <span className={`text-xs font-medium ${c.completedIds.includes(t.id) ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                  {t.topic}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Badge variant="outline" className="text-[8px] h-4 border-slate-200 text-slate-400">{t.estimated_hours} שעות</Badge>
                              </div>
                            </div>
                          ))}
                       </div>

                       {progress === 100 && (
                         <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 flex items-center gap-3">
                            <Trophy className="h-8 w-8 text-yellow-500" />
                            <div>
                               <p className="text-xs font-heading font-black text-yellow-800">סיכום מעולה! ✨</p>
                               <p className="text-[10px] text-yellow-700">כל נושאי הסילבוס כוסו בהצלחה בכיתה זו.</p>
                            </div>
                         </div>
                       )}
                    </CardContent>
                  </motion.div>
                )}
             </AnimatePresence>
           </Card>
         );
       })}
    </div>
  );
};

export default SyllabusProgressTracker;
