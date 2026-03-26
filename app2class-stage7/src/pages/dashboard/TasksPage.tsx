import { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Target, Clock, CheckCircle2, AlertTriangle, Upload, RotateCcw,
  Loader2, Play, Gamepad2, Send, Camera, FileText, MessageSquare,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Task {
  id: string;
  assignmentId: string;
  title: string;
  subject: string;
  type: string;
  dueDate: string | null;
  status: "pending" | "submitted" | "graded" | "revision";
  urgency: "red" | "orange" | "green";
  weight: number;
  grade?: number | null;
  maxGrade: number;
  feedback?: string | null;
  hasQuestions: boolean;
  published: boolean;
  description?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  homework: "שיעורי בית", exam: "מבחן", quiz: "בוחן",
  project: "פרויקט", exercise: "תרגיל",
};

const getUrgency = (dueDate: string | null, status: string): "red" | "orange" | "green" => {
  if (status !== "pending") return "green";
  if (!dueDate) return "green";
  const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (diff <= 1) return "red";
  if (diff <= 3) return "orange";
  return "green";
};

const TasksPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");

  // Submit dialog
  const [submitTask, setSubmitTask] = useState<Task | null>(null);
  const [submitText, setSubmitText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Quiz dialog - full inline quiz
  const [quizTask, setQuizTask] = useState<Task | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [quizMode, setQuizMode] = useState<"quiz" | "flashcard">("quiz");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  const loadTasks = async () => {
    setLoading(true);
    if (!profile.id) { setLoading(false); return; }

    // Get student's class
    const { data: profileData } = await supabase.from("profiles").select("class_id").eq("id", profile.id).single();
    const classId = (profileData as any)?.class_id;
    if (!classId) { setLoading(false); return; }

    // Get published assignments for this class
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, subject, type, due_date, weight_percent, max_grade, published, description")
      .eq("class_id", classId)
      .eq("published", true)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!assignments || assignments.length === 0) { setLoading(false); return; }

    const aIds = assignments.map((a: any) => a.id);

    // Get student's submissions
    const { data: submissions } = await supabase
      .from("submissions")
      .select("id, assignment_id, status, grade, feedback, submitted_at")
      .eq("student_id", profile.id)
      .in("assignment_id", aIds);

    // Get which assignments have questions
    const { data: qCounts } = await supabase
      .from("task_questions")
      .select("assignment_id")
      .in("assignment_id", aIds);

    const subMap = new Map((submissions || []).map((s: any) => [s.assignment_id, s]));
    const qSet = new Set((qCounts || []).map((q: any) => q.assignment_id));

    const mapped: Task[] = assignments.map((a: any) => {
      const sub = subMap.get(a.id);
      const status: Task["status"] = sub
        ? (sub.status === "graded" ? "graded" : sub.status === "revision" ? "revision" : "submitted")
        : "pending";
      return {
        id: sub?.id || `no-sub-${a.id}`,
        assignmentId: a.id,
        title: a.title,
        subject: a.subject,
        type: a.type,
        dueDate: a.due_date,
        status,
        urgency: getUrgency(a.due_date, status),
        weight: a.weight_percent || 0,
        grade: sub?.grade ?? null,
        maxGrade: a.max_grade || 100,
        feedback: sub?.feedback ?? null,
        hasQuestions: qSet.has(a.id),
        published: a.published,
        description: a.description,
      };
    });

    setTasks(mapped);
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, [profile.id]);

  const filtered = tasks.filter(t => {
    if (tab === "pending") return t.status === "pending";
    if (tab === "submitted") return t.status === "submitted";
    if (tab === "graded") return t.status === "graded";
    if (tab === "revision") return t.status === "revision";
    return true;
  });

  const urgencyDot = (u: string) =>
    u === "red" ? "bg-destructive" : u === "orange" ? "bg-yellow-500" : "bg-green-500";

  const getDaysLeft = (date: string | null) => {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  };

  // Text submission
  const handleSubmit = async () => {
    if (!submitTask) return;
    setSubmitting(true);
    try {
      const existing = tasks.find(t => t.assignmentId === submitTask.assignmentId && t.status !== "pending");
      if (existing?.id && !existing.id.startsWith("no-sub-")) {
        await supabase.from("submissions").update({
          content: submitText, submitted_at: new Date().toISOString(), status: "submitted",
        }).eq("id", existing.id);
      } else {
        await supabase.from("submissions").insert({
          assignment_id: submitTask.assignmentId, student_id: profile.id,
          content: submitText, submitted_at: new Date().toISOString(), status: "submitted",
        });
      }
      toast({ title: "הוגש בהצלחה! ✅" });
      setSubmitTask(null);
      setSubmitText("");
      loadTasks();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Open quiz
  const openQuiz = async (task: Task, mode: "quiz" | "flashcard") => {
    setLoadingQuiz(true);
    setQuizTask(task);
    setQuizMode(mode);
    setQuizIdx(0);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
    setFlipped(false);

    const { data } = await supabase
      .from("task_questions")
      .select("*")
      .eq("assignment_id", task.assignmentId)
      .order("order_num");

    setQuizQuestions(data || []);
    setLoadingQuiz(false);
  };

  const submitQuiz = async () => {
    if (!quizTask) return;
    let correct = 0;
    quizQuestions.forEach((q, i) => {
      if (quizAnswers[i] === q.correct_answer) correct++;
    });
    const pct = Math.round((correct / quizQuestions.length) * 100);
    setQuizScore(pct);
    setQuizSubmitted(true);

    // Save submission with grade
    try {
      await supabase.from("submissions").upsert({
        assignment_id: quizTask.assignmentId, student_id: profile.id,
        grade: pct, max_grade: 100, status: "graded",
        submitted_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
        content: JSON.stringify(quizAnswers),
      }, { onConflict: "assignment_id,student_id" });
      toast({ title: `סיימת! ציון: ${pct} 🎉` });
      loadTasks();
    } catch { /* best effort */ }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const counts = {
    pending: tasks.filter(t => t.status === "pending").length,
    submitted: tasks.filter(t => t.status === "submitted").length,
    graded: tasks.filter(t => t.status === "graded").length,
    revision: tasks.filter(t => t.status === "revision").length,
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" />המשימות שלי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">ניהול מטלות, הגשות ותרגול</p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-4 gap-3">
        {[
          { label: "טרם הוגשו", count: counts.pending, color: "text-yellow-600", icon: Clock, tab: "pending" },
          { label: "בבדיקה", count: counts.submitted, color: "text-blue-500", icon: Upload, tab: "submitted" },
          { label: "קיבלו ציון", count: counts.graded, color: "text-green-600", icon: CheckCircle2, tab: "graded" },
          { label: "לתיקון", count: counts.revision, color: "text-destructive", icon: RotateCcw, tab: "revision" },
        ].map((stat) => (
          <Card key={stat.tab} className="cursor-pointer hover:shadow-sm transition-all" onClick={() => setTab(stat.tab)}>
            <CardContent className="py-3 text-center">
              <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
              <p className="text-xl font-heading font-bold">{stat.count}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={item}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="pending" className="font-heading text-xs">⏳ ממתינות</TabsTrigger>
            <TabsTrigger value="submitted" className="font-heading text-xs">📤 בבדיקה</TabsTrigger>
            <TabsTrigger value="graded" className="font-heading text-xs">✅ ציון</TabsTrigger>
            <TabsTrigger value="revision" className="font-heading text-xs">🔄 לתיקון</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <motion.div variants={item}>
            <Card><CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground font-body">אין משימות בקטגוריה זו</p>
            </CardContent></Card>
          </motion.div>
        ) : (
          filtered.map((task) => {
            const daysLeft = getDaysLeft(task.dueDate);
            const normalized = task.grade != null ? Math.round((task.grade / task.maxGrade) * 100) : null;
            return (
              <motion.div key={task.id} variants={item}>
                <Card className={`hover:shadow-sm transition-all ${task.urgency === "red" && task.status === "pending" ? "border-destructive/30" : ""}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${urgencyDot(task.urgency)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {TYPE_LABELS[task.type] || task.type}
                          </Badge>
                          <p className="font-heading font-bold text-sm truncate">{task.title}</p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                          <span>{task.subject}</span>
                          {task.weight > 0 && <><span>•</span><span>{task.weight}% מהציון</span></>}
                          {task.dueDate && (
                            <><span>•</span>
                              <span className={task.status === "pending" && daysLeft !== null && daysLeft <= 1 ? "text-destructive font-bold" : ""}>
                                {task.status === "pending" && daysLeft !== null
                                  ? daysLeft <= 0 ? "עבר הזמן!" : daysLeft === 1 ? "מחר!" : `עוד ${daysLeft} ימים`
                                  : new Date(task.dueDate).toLocaleDateString("he-IL")}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Grade bar */}
                        {normalized !== null && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-heading font-bold ${normalized >= 85 ? "text-green-600" : normalized >= 60 ? "text-yellow-600" : "text-destructive"}`}>
                                {task.grade}/{task.maxGrade}
                              </span>
                              {task.feedback && !task.feedback.startsWith("[ערעור") && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">💬 {task.feedback}</span>
                              )}
                            </div>
                            <Progress value={normalized} className="h-1.5" />
                          </div>
                        )}

                        {/* Revision feedback */}
                        {task.status === "revision" && task.feedback && (
                          <div className="mt-2 p-2 bg-destructive/5 rounded text-[11px] text-destructive">
                            🔄 {task.feedback}
                          </div>
                        )}

                        {/* Quiz buttons */}
                        {task.hasQuestions && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 font-heading"
                              onClick={() => openQuiz(task, "flashcard")}>
                              🃏 פלאשקארדס
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 font-heading"
                              onClick={() => openQuiz(task, "quiz")}>
                              <Play className="h-3 w-3" />בוחן
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Action button */}
                      <div className="shrink-0">
                        {task.status === "pending" && (
                          <Button size="sm" className="gap-1 font-heading"
                            onClick={() => { setSubmitTask(task); setSubmitText(""); }}>
                            <Upload className="h-3.5 w-3.5" />הגש
                          </Button>
                        )}
                        {task.status === "revision" && (
                          <Button size="sm" variant="outline" className="gap-1 font-heading text-destructive border-destructive/30"
                            onClick={() => { setSubmitTask(task); setSubmitText(task.feedback || ""); }}>
                            <RotateCcw className="h-3.5 w-3.5" />תקן
                          </Button>
                        )}
                        {task.status === "submitted" && (
                          <Badge variant="secondary" className="text-[10px]">בבדיקה...</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={!!submitTask} onOpenChange={(o) => { if (!o) setSubmitTask(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {submitTask?.status === "revision" ? "הגשת תיקון" : "הגשת עבודה"}
            </DialogTitle>
          </DialogHeader>
          {submitTask && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-heading font-medium text-sm">{submitTask.title}</p>
                <p className="text-xs text-muted-foreground">{submitTask.subject}</p>
              </div>
              <Textarea
                placeholder="כתוב את תשובתך כאן, הוסף קישור לגוגל דוקס / Canva, או תאר את מה שהגשת..."
                value={submitText}
                onChange={(e) => setSubmitText(e.target.value)}
                className="font-body text-sm resize-none" rows={4}
              />
              <div className="flex gap-2">
                <Button className="flex-1 gap-2 font-heading" onClick={handleSubmit} disabled={submitting || !submitText.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? "שולח..." : "הגש עכשיו"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                ניתן להגיש טקסט, לינק או תיאור של מה שהכנת
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Dialog */}
      <Dialog open={!!quizTask} onOpenChange={(o) => { if (!o) { setQuizTask(null); setQuizSubmitted(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              {quizMode === "flashcard" ? "🃏" : <Play className="h-5 w-5 text-primary" />}
              {quizTask?.title}
              {quizMode === "flashcard" ? " — פלאשקארדס" : " — בוחן"}
            </DialogTitle>
          </DialogHeader>

          {loadingQuiz ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : quizQuestions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">אין שאלות לעיון עדיין</div>
          ) : quizSubmitted ? (
            /* Results screen */
            <div className="space-y-4 py-2">
              <div className="text-center">
                <p className="text-5xl font-heading font-bold mb-2">{quizScore}</p>
                <p className="text-muted-foreground text-sm">
                  {Math.round(quizScore * quizQuestions.length / 100)} מתוך {quizQuestions.length} נכון
                </p>
                <Progress value={quizScore} className="mt-3 h-3" />
              </div>
              <div className="space-y-2">
                {quizQuestions.map((q, i) => {
                  const correct = quizAnswers[i] === q.correct_answer;
                  return (
                    <div key={i} className={`p-3 rounded-lg text-sm ${correct ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                      <p className="font-heading font-medium mb-1">{q.question_text}</p>
                      <p className="text-xs">תשובתך: <span className={correct ? "text-green-600" : "text-destructive"}>{quizAnswers[i] || "לא ענית"}</span></p>
                      {!correct && <p className="text-xs text-green-600">תשובה נכונה: {q.correct_answer}</p>}
                      {q.explanation && <p className="text-[10px] text-muted-foreground mt-1">💡 {q.explanation}</p>}
                    </div>
                  );
                })}
              </div>
              <Button className="w-full font-heading" onClick={() => {
                setQuizIdx(0); setQuizAnswers({}); setQuizSubmitted(false); setFlipped(false);
              }}>נסה שוב</Button>
            </div>
          ) : quizMode === "flashcard" ? (
            /* Flashcard mode */
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{quizIdx + 1} / {quizQuestions.length}</span>
                <Progress value={((quizIdx + 1) / quizQuestions.length) * 100} className="h-1.5 flex-1 mx-3" />
              </div>
              <motion.div
                className="min-h-[180px] rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 cursor-pointer flex items-center justify-center text-center"
                onClick={() => setFlipped(!flipped)}
                whileTap={{ scale: 0.97 }}
              >
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2">{flipped ? "תשובה" : "שאלה"} — לחץ להפוך</p>
                  <p className="font-heading font-medium text-base">
                    {flipped ? quizQuestions[quizIdx]?.correct_answer : quizQuestions[quizIdx]?.question_text}
                  </p>
                  {flipped && quizQuestions[quizIdx]?.explanation && (
                    <p className="text-[11px] text-muted-foreground mt-2">💡 {quizQuestions[quizIdx].explanation}</p>
                  )}
                </div>
              </motion.div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 font-heading" disabled={quizIdx === 0}
                  onClick={() => { setQuizIdx(i => i - 1); setFlipped(false); }}>← הקודם</Button>
                {quizIdx < quizQuestions.length - 1 ? (
                  <Button className="flex-1 font-heading" onClick={() => { setQuizIdx(i => i + 1); setFlipped(false); }}>הבא →</Button>
                ) : (
                  <Button className="flex-1 font-heading bg-green-600 hover:bg-green-700" onClick={() => setQuizSubmitted(true)}>סיום ✓</Button>
                )}
              </div>
            </div>
          ) : (
            /* Quiz mode */
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>שאלה {quizIdx + 1} מתוך {quizQuestions.length}</span>
                <Progress value={((quizIdx + 1) / quizQuestions.length) * 100} className="h-1.5 flex-1 mx-3" />
                <span>{Object.keys(quizAnswers).length} נענו</span>
              </div>

              {quizQuestions[quizIdx] && (() => {
                const q = quizQuestions[quizIdx];
                const opts: string[] = q.question_type === "true_false"
                  ? ["נכון", "לא נכון"]
                  : Array.isArray(q.options) ? q.options.filter(Boolean) : [];

                return (
                  <div className="space-y-3">
                    <div className="p-4 bg-muted/30 rounded-xl">
                      <p className="font-heading font-medium">{q.question_text}</p>
                      {q.points && <p className="text-[10px] text-muted-foreground mt-1">{q.points} נקודות</p>}
                    </div>

                    {opts.length > 0 ? (
                      <div className="space-y-2">
                        {opts.map((opt: string, i: number) => (
                          <button key={i} className={`w-full text-right p-3 rounded-lg border transition-all text-sm font-body ${quizAnswers[quizIdx] === opt
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                            onClick={() => setQuizAnswers(prev => ({ ...prev, [quizIdx]: opt }))}>
                            <span className="font-heading text-xs text-muted-foreground ml-2">{String.fromCharCode(1488 + i)}.</span>
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Textarea placeholder="כתוב את תשובתך..." className="font-body text-sm resize-none" rows={3}
                        value={quizAnswers[quizIdx] || ""}
                        onChange={(e) => setQuizAnswers(prev => ({ ...prev, [quizIdx]: e.target.value }))} />
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 font-heading" disabled={quizIdx === 0}
                  onClick={() => setQuizIdx(i => i - 1)}>← הקודם</Button>
                {quizIdx < quizQuestions.length - 1 ? (
                  <Button className="flex-1 font-heading" onClick={() => setQuizIdx(i => i + 1)}>הבא →</Button>
                ) : (
                  <Button className="flex-1 font-heading bg-green-600 hover:bg-green-700"
                    onClick={submitQuiz} disabled={Object.keys(quizAnswers).length === 0}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />הגש ובדוק
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default TasksPage;
