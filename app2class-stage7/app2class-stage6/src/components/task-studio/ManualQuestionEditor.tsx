import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PenLine, Plus, Trash2, Save, ChevronDown, ChevronUp, CheckCircle2, Send, Calendar, Clock, Shield, Lock, Switch as SwitchIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";

interface Question {
  id?: string;
  question_type: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points: number;
  order_num: number;
  difficulty: number;
}

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "אמריקאי", icon: "🔘" },
  { value: "true_false", label: "נכון/לא נכון", icon: "✅" },
  { value: "open", label: "פתוח", icon: "✍️" },
  { value: "fill_blank", label: "השלם", icon: "📝" },
  { value: "matching", label: "התאמה", icon: "🔗" },
];

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const ManualQuestionEditor = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Scheduling & lock settings (per assignment)
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [lockDevice, setLockDevice] = useState(false);
  const [lockDuration, setLockDuration] = useState("45");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [oneAttempt, setOneAttempt] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (assignmentId) loadQuestions();
  }, [assignmentId]);

  const loadQuestions = async () => {
    if (!assignmentId) return;
    const { data } = await supabase
      .from("task_questions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("order_num");
    if (data?.length) {
      setQuestions(data.map((q: any) => ({
        id: q.id, question_type: q.question_type, question_text: q.question_text,
        options: (q.options as string[]) || [], correct_answer: q.correct_answer || "",
        explanation: q.explanation || "", points: q.points || 1, order_num: q.order_num, difficulty: q.difficulty || 1,
      })));
    }
  };

  const addQuestion = () => {
    const newQ: Question = {
      question_type: "multiple_choice", question_text: "", options: ["", "", "", ""],
      correct_answer: "", explanation: "", points: 1, order_num: questions.length, difficulty: 1,
    };
    setQuestions([...questions, newQ]);
    setExpandedIdx(questions.length);
  };

  const updateQuestion = (idx: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    (updated[idx] as any)[field] = value;
    setQuestions(updated);
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    const updated = [...questions];
    updated[qIdx].options[optIdx] = value;
    setQuestions(updated);
  };

  const addOption = (qIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options.push("");
    setQuestions(updated);
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options.splice(optIdx, 1);
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  };

  const saveAll = async () => {
    if (!assignmentId || !questions.length) return;
    setSaving(true);
    try {
      await supabase.from("task_questions").delete().eq("assignment_id", assignmentId);
      const rows = questions.map((q, i) => ({
        assignment_id: assignmentId,
        question_type: q.question_type as any,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        points: q.points,
        order_num: i,
        difficulty: q.difficulty,
      }));
      const { error } = await supabase.from("task_questions").insert(rows);
      if (error) throw error;
      toast({ title: `${questions.length} שאלות נשמרו בהצלחה! ✅` });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const publishAssignment = async () => {
    if (!assignmentId) return;
    setPublishing(true);
    try {
      await saveAll();
      // Build scheduled_at if set
      let scheduledAt: string | null = null;
      if (scheduledDate) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      }
      const lockSettings = {
        lockDevice, lockDuration: +lockDuration,
        shuffleQuestions, shuffleOptions, oneAttempt,
        scheduledAt,
      };
      const { error } = await supabase.from("assignments").update({
        published: !scheduledAt, // if scheduled, don't publish yet
        description: JSON.stringify(lockSettings),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: scheduledAt ? `המשימה תשוגר ב-${scheduledDate} 🕐` : "המשימה פורסמה לכיתה! 🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="הזנה ידנית" description="כתיבת בנק שאלות ותשובות במגוון פורמטים" icon={<PenLine className="h-6 w-6 text-primary" />} onBack={onBack}>
      {!assignmentId && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-heading text-warning">⚠️ בחר משימה פעילה מהתפריט העליון כדי להתחיל</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <Card key={idx} className={`transition-all ${expandedIdx === idx ? "ring-2 ring-primary/20" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-heading text-muted-foreground w-6">{idx + 1}.</span>
                  <Badge variant="outline" className="text-[10px]">
                    {QUESTION_TYPES.find((t) => t.value === q.question_type)?.icon}{" "}
                    {QUESTION_TYPES.find((t) => t.value === q.question_type)?.label}
                  </Badge>
                  <span className="text-sm font-body truncate max-w-[300px]">{q.question_text || "שאלה ללא כותרת"}</span>
                </div>
                <div className="flex items-center gap-1">
                  {q.correct_answer && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  {expandedIdx === idx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {expandedIdx === idx && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-heading">סוג שאלה</Label>
                      <Select value={q.question_type} onValueChange={(v) => updateQuestion(idx, "question_type", v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map((t) => (<SelectItem key={t.value} value={t.value} className="text-xs">{t.icon} {t.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-heading">נקודות</Label>
                      <Input type="number" value={q.points} onChange={(e) => updateQuestion(idx, "points", +e.target.value)} className="h-9 text-xs" dir="ltr" min={1} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-heading">קושי (1-5)</Label>
                      <Input type="number" value={q.difficulty} onChange={(e) => updateQuestion(idx, "difficulty", +e.target.value)} className="h-9 text-xs" dir="ltr" min={1} max={5} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-heading">טקסט השאלה</Label>
                    <Textarea value={q.question_text} onChange={(e) => updateQuestion(idx, "question_text", e.target.value)} placeholder="מהי נוסחת השטח של מעגל?" rows={2} className="text-sm" />
                  </div>

                  {(q.question_type === "multiple_choice" || q.question_type === "matching") && (
                    <div className="space-y-2">
                      <Label className="text-xs font-heading">אפשרויות</Label>
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button type="button" className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 transition-colors ${q.correct_answer === opt && opt ? "bg-success border-success text-success-foreground" : "border-border hover:border-primary"}`} onClick={() => updateQuestion(idx, "correct_answer", opt)} title="סמן כתשובה נכונה">
                            {q.correct_answer === opt && opt ? "✓" : String.fromCharCode(1488 + optIdx)}
                          </button>
                          <Input value={opt} onChange={(e) => updateOption(idx, optIdx, e.target.value)} placeholder={`אפשרות ${optIdx + 1}`} className="h-8 text-xs flex-1" />
                          {q.options.length > 2 && (<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOption(idx, optIdx)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>)}
                        </div>
                      ))}
                      {q.options.length < 6 && (<Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => addOption(idx)}><Plus className="h-3 w-3" /> הוסף אפשרות</Button>)}
                    </div>
                  )}

                  {q.question_type === "true_false" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-heading">תשובה נכונה</Label>
                      <div className="flex gap-3">
                        {["נכון", "לא נכון"].map((v) => (<Button key={v} variant={q.correct_answer === v ? "default" : "outline"} size="sm" className="text-xs" onClick={() => updateQuestion(idx, "correct_answer", v)}>{v}</Button>))}
                      </div>
                    </div>
                  )}

                  {(q.question_type === "open" || q.question_type === "fill_blank") && (
                    <div className="space-y-1">
                      <Label className="text-xs font-heading">תשובה נכונה / מפתח</Label>
                      <Input value={q.correct_answer} onChange={(e) => updateQuestion(idx, "correct_answer", e.target.value)} placeholder="התשובה הצפויה" className="h-9 text-xs" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs font-heading">הסבר (אופציונלי)</Label>
                    <Textarea value={q.explanation} onChange={(e) => updateQuestion(idx, "explanation", e.target.value)} placeholder="הסבר לתשובה הנכונה..." rows={2} className="text-xs" />
                  </div>

                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => removeQuestion(idx)}>
                      <Trash2 className="h-3.5 w-3.5 ml-1" /> מחק שאלה
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" className="gap-2 font-heading text-sm" onClick={addQuestion}>
          <Plus className="h-4 w-4" /> הוסף שאלה
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-body">{questions.length} שאלות</span>
          <Button variant="outline" className="gap-2 font-heading" onClick={saveAll} disabled={saving || !assignmentId || !questions.length}>
            <Save className="h-4 w-4" /> {saving ? "שומר..." : "שמור הכל"}
          </Button>
          <Button variant="outline" className="gap-2 font-heading text-xs" onClick={() => setShowSettings(!showSettings)}>
            <Lock className="h-4 w-4" /> הגדרות שיגור
          </Button>
          <Button className="gap-2 font-heading" onClick={publishAssignment} disabled={publishing || !assignmentId || !questions.length}>
            <Send className="h-4 w-4" /> {publishing ? "שולח..." : "שגר משימה לכיתה"}
          </Button>
        </div>
      </div>

      {/* Inline send settings panel */}
      {showSettings && (
        <Card className="border-primary/20 bg-primary/5 mt-2">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> תזמון ונעילה</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-heading">תאריך פרסום (אופציונלי)</Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-heading">שעת פרסום</Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "חסום יציאה מהאפליקציה", desc: "מצב מבחן — התלמיד לא יוכל לעבור לאפליקציות אחרות", val: lockDevice, set: setLockDevice },
                { label: "ערבוב סדר שאלות", desc: "כל תלמיד מקבל סדר שונה", val: shuffleQuestions, set: setShuffleQuestions },
                { label: "ערבוב אפשרויות", desc: "סדר התשובות משתנה בין תלמידים", val: shuffleOptions, set: setShuffleOptions },
                { label: "ניסיון אחד בלבד", desc: "אין אפשרות לחזור אחורה", val: oneAttempt, set: setOneAttempt },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                  <div>
                    <Label className="text-xs font-heading">{item.label}</Label>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={item.val} onCheckedChange={item.set} />
                </div>
              ))}
              {lockDevice && (
                <div className="space-y-1 mr-4">
                  <Label className="text-xs font-heading">משך נעילה (דקות)</Label>
                  <Input type="number" value={lockDuration} onChange={(e) => setLockDuration(e.target.value)} className="h-8 text-xs w-24" dir="ltr" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </StudioModeWrapper>
  );
};

export default ManualQuestionEditor;
