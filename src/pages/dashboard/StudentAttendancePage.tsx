import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, Calendar, AlertTriangle, CheckCircle2, Star, Clock } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

export default function StudentAttendancePage() {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [excuseText, setExcuseText] = useState("");
  const [submittingExcuse, setSubmittingExcuse] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Fetch attendance
      const { data: attData } = await supabase
        .from("attendance")
        .select(`
          id,
          status,
          lessons (lesson_date, lesson_number, subject)
        `)
        .eq("student_id", profile.id)
        .in("status", ["absent", "late", "excused"]);

      const recordsList: AttendanceRecord[] = (attData || []).map((row: any) => ({
        id: row.id,
        status: row.status,
        date: row.lessons?.lesson_date,
        lesson_number: row.lessons?.lesson_number?.toString() || "1",
        subject: row.lessons?.subject || "כללי",
      }));
      setRecords(recordsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // Fetch positive / special notes
      const { data: notesData } = await supabase
        .from("lesson_notes")
        .select(`
          id,
          category,
          lessons (lesson_date, subject)
        `)
        .eq("student_id", profile.id);

      const notesList: LessonNote[] = (notesData || []).map((row: any) => ({
        id: row.id,
        category: row.category,
        date: row.lessons?.lesson_date,
        subject: row.lessons?.subject || "כללי",
      }));
      setNotes(notesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      setLoading(false);
    };

    loadData();
  }, [profile.id]);

  const handleExcuseSubmit = async () => {
    if (!selectedRecordId || !excuseText) return;
    setSubmittingExcuse(true);
    
    // In a real app we'd insert into `excuse_requests`. For now log it and mock success.
    await new Promise(r => setTimeout(r, 600));
    
    toast({
      title: "בקשת הצדקה נשלחה",
      description: "המחנך יבדוק ויאשר את בקשתך בקרוב.",
    });
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

  if (loading) return <div className="p-8 text-center"><div className="animate-spin w-8 h-8 mx-auto border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6 pb-24">
      <div className="flex items-center gap-3 mb-2">
        <Clock className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-heading font-black">יומן אירועים ונוכחות</h1>
      </div>
      <p className="text-muted-foreground">כאן תוכל לעקוב אחר החיסורים שלך, לבקש הצדקות מהמחנך, ולראות ציונים לשבח ממורים.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Absences Col */}
        <Card className="border-t-4 border-t-destructive shadow-md">
           <CardContent className="p-5">
              <h2 className="text-xl font-heading font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                חיסורים ואיחורים שדורשים הצדקה
              </h2>
              {records.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין לך חיסורים או איחורים. כל הכבוד!</p>
              ) : (
                <div className="space-y-3">
                  {records.map(r => (
                    <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-xl bg-card">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === "absent" ? "destructive" : r.status === "late" ? "warning" : "secondary"}>
                            {r.status === "absent" ? "חיסור" : r.status === "late" ? "איחור" : "מוצדק"}
                          </Badge>
                          <span className="font-bold text-sm">{r.subject} (שיעור {r.lesson_number})</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(r.date).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                      
                      {r.status !== "excused" && (
                        <Dialog open={selectedRecordId === r.id} onOpenChange={(open) => !open && setSelectedRecordId(null)}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="mt-2 sm:mt-0 shadow-sm" onClick={() => setSelectedRecordId(r.id)}>
                              הגש הצדקה
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>הגשת הצדקה לחיסור</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <p className="text-sm">אנא נמק את סיבת ההיעדרות משיעור {r.subject} בתאריך {new Date(r.date).toLocaleDateString("he-IL")}.</p>
                              <Textarea 
                                placeholder="לדוגמה: הייתי חולה בבית, מצורף אישור רפואי." 
                                value={excuseText}
                                onChange={e => setExcuseText(e.target.value)}
                              />
                              <Button variant="outline" className="w-full gap-2">
                                <FileUp className="w-4 h-4" /> העלה קובץ (אישור רפואי / הורים)
                              </Button>
                              <Button className="w-full" onClick={handleExcuseSubmit} disabled={!excuseText || submittingExcuse}>
                                {submittingExcuse ? "שולח..." : "שלח בקשה למחנך"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  ))}
                </div>
              )}
           </CardContent>
        </Card>

        {/* Positive Notes Col */}
        <Card className="border-t-4 border-t-success shadow-md bg-success/5">
           <CardContent className="p-5">
              <h2 className="text-xl font-heading font-bold mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-success" />
                נקודות זכות והערות
              </h2>
              {notes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">עדיין אין הערות מהמורים לשיעורים שלך.</p>
              ) : (
                <div className="space-y-3">
                  {notes.map(n => (
                    <div key={n.id} className="flex items-center gap-4 p-3 border border-success/20 rounded-xl bg-white shadow-sm">
                      <div className="text-3xl bg-success/10 p-2 rounded-xl">
                        {getEmojiForCategory(n.category)}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-800">{n.subject}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> {new Date(n.date).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
