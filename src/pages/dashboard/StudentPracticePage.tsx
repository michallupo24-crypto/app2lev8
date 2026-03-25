import { useState, useEffect, useRef } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, ArrowLeft, CheckCircle2, XCircle, Layers, PlayCircle,
  BookOpen, Loader2, RotateCcw, Trophy, Brain, Sparkles, ChevronLeft,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Question {
  id: string;
  question_type: "multiple_choice" | "true_false" | "open" | "fill_blank";
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points: number;
  order_num: number;
}

interface Assignment {
  id: string;
  title: string;
  subject: string;
  type: string;
}

type PracticeMode = "quiz" | "flashcards" | "open";

const StudentPracticePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PracticeMode>("quiz");
  const [started, setStarted] = useState(false);

  // Quiz state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongIds, setWrongIds] = useState<string[]>([]);

  // Flashcard state
  const [flipped, setFlipped] = useState(false);
  const [fcIdx, setFcIdx] = useState(0);

  // Open answer state
  const [openAnswer, setOpenAnswer] = useState("");
  const [openFeedback, setOpenFeedback] = useState<string | null>(null);
  const [checkingOpen, setCheckingOpen] = useState(false);

  // Shuffle questions on start
  const [shuffled, setShuffled] = useState<Question[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!assignmentId) return;
      setLoading(true);
      const [assignRes, questRes] = await Promise.all([
        supabase.from("assignments").select("id, title, subject, type").eq("id", assignmentId).single(),
        supabase.from("task_questions").select("*").eq("assignment_id", assignmentId).order("order_num"),
      ]);
      setAssignment(assignRes.data);
      setQuestions(questRes.data || []);
      setLoading(false);
    };
    load();
  }, [assignmentId]);

  const startPractice = () => {
    const q = [...questions].sort(() => Math.random() - 0.5);
    setShuffled(q);
    setCurrentIdx(0);
    setScore(0);
    setFinished(false);
    setSelected(null);
    setAnswered(false);
    setWrongIds([]);
    setFlipped(false);
    setFcIdx(0);
    setOpenAnswer("");
    setOpenFeedback(null);
    setStarted(true);
  };

  const currentQ = shuffled[currentIdx];
  const progress = shuffled.length > 0 ? ((currentIdx) / shuffled.length) * 100 : 0;

  const handleAnswer = (ans: string) => {
    if (answered) return;
    setSelected(ans);
    setAnswered(true);
    const isCorrect = ans.trim().toLowerCase() === (currentQ?.correct_answer || "").trim().toLowerCase();
    setCorrect(isCorrect);
    if (isCorrect) setScore(s => s + 1);
    else setWrongIds(prev => [...prev, currentQ.id]);
  };

  const nextQ = () => {
    if (currentIdx >= shuffled.length - 1) {
      setFinished(true);
      saveScore();
    } else {
      setCurrentIdx(i => i + 1);
      setSelected(null);
      setAnswered(false);
      setCorrect(false);
    }
  };

  const saveScore = async () => {
    if (!assignmentId) return;
    const pct = Math.round((score / shuffled.length) * 100);
    try {
      const { data: existing } = await supabase.from("submissions")
        .select("id").eq("assignment_id", assignmentId).eq("student_id", profile.id).maybeSingle();
      if (existing) {
        await supabase.from("submissions").update({ grade: pct, status: "submitted" as any, submitted_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await supabase.from("submissions").insert({
          assignment_id: assignmentId, student_id: profile.id,
          grade: pct, status: "submitted" as any, submitted_at: new Date().toISOString(),
        });
      }
    } catch { /* best effort */ }
  };

  const checkOpenAnswer = async () => {
    if (!openAnswer.trim() || !currentQ) return;
    setCheckingOpen(true);
    try {
      const { data } = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: `בדוק את התשובה הבאה לשאלה:\nשאלה: ${currentQ.question_text}\nתשובה נכונה: ${currentQ.correct_answer}\nתשובת התלמיד: ${openAnswer}\n\nתן פידבק קצר (2-3 משפטים) בעברית — האם צדק? מה חסר? מה טוב?`,
          context: "open_answer_check",
        },
      });
      setOpenFeedback(data?.message || "לא ניתן לבדוק כרגע");
    } catch {
      setOpenFeedback("לא ניתן לבדוק כרגע, נסה שוב");
    } finally {
      setCheckingOpen(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!assignment || questions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <BookOpen className="h-16 w-16 text-muted-foreground/20" />
      <p className="text-muted-foreground font-body">אין שאלות זמינות למשימה זו</p>
      <Button variant="outline" onClick={() => navigate("/dashboard/tasks")}>
        <ChevronLeft className="h-4 w-4 mr-1" />חזור למשימות
      </Button>
    </div>
  );

  // Finished screen
  if (finished && mode === "quiz") {
    const pct = Math.round((score / shuffled.length) * 100);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
        <div className="text-center space-y-4 py-8">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
            {pct >= 80
              ? <Trophy className="h-20 w-20 mx-auto text-yellow-500" />
              : pct >= 60
              ? <CheckCircle2 className="h-20 w-20 mx-auto text-primary" />
              : <Brain className="h-20 w-20 mx-auto text-muted-foreground" />
            }
          </motion.div>
          <div>
            <p className="text-4xl font-heading font-bold text-primary">{pct}%</p>
            <p className="text-muted-foreground font-body mt-1">{score} מתוך {shuffled.length} נכונות</p>
          </div>
          <p className="text-lg font-heading">
            {pct >= 90 ? "מצוין! שלטת בחומר! 🏆" : pct >= 75 ? "עבודה טובה! 💪" : pct >= 60 ? "לא רע, אפשר לשפר 📚" : "כדאי לחזור על החומר 🔁"}
          </p>
          {pct < 100 && (
            <p className="text-sm text-muted-foreground">הציון נשמר אוטומטית</p>
          )}
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button className="gap-2 font-heading" onClick={startPractice}>
            <RotateCcw className="h-4 w-4" />תרגל שוב
          </Button>
          {wrongIds.length > 0 && (
            <Button variant="outline" className="gap-2 font-heading" onClick={() => {
              const wrong = questions.filter(q => wrongIds.includes(q.id));
              setShuffled(wrong);
              setCurrentIdx(0);
              setScore(0);
              setFinished(false);
              setSelected(null);
              setAnswered(false);
              setWrongIds([]);
            }}>
              <Brain className="h-4 w-4" />תרגל רק שגיאות ({wrongIds.length})
            </Button>
          )}
          <Button variant="ghost" className="gap-2 font-heading" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-4 w-4" />חזור
          </Button>
        </div>
      </motion.div>
    );
  }

  // Mode selector (before start)
  if (!started) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold">{assignment.title}</h1>
            <p className="text-sm text-muted-foreground">{assignment.subject} • {questions.length} שאלות</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: "quiz" as PracticeMode,
              title: "מצב בוחן",
              desc: "שאלות אחת אחת עם ניקוד, פידבק מיידי וציון בסוף",
              icon: <PlayCircle className="h-8 w-8" />,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              id: "flashcards" as PracticeMode,
              title: "כרטיסיות שינון",
              desc: "העבר בין שאלות ותשובות, הפוך כרטיסייה להצגת תשובה",
              icon: <Layers className="h-8 w-8" />,
              color: "text-green-600",
              bg: "bg-green-500/10",
            },
            {
              id: "open" as PracticeMode,
              title: "תשובה חופשית + AI",
              desc: "כתוב תשובה בשפה חופשית, ה-AI יבדוק ויחזיר פידבק",
              icon: <Sparkles className="h-8 w-8" />,
              color: "text-purple-600",
              bg: "bg-purple-500/10",
            },
          ].map((m) => (
            <Card key={m.id}
              className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${mode === m.id ? "border-primary ring-1 ring-primary/30" : ""}`}
              onClick={() => setMode(m.id)}>
              <CardContent className="p-5 text-center space-y-3">
                <div className={`w-16 h-16 rounded-2xl ${m.bg} flex items-center justify-center mx-auto ${m.color}`}>
                  {m.icon}
                </div>
                <div>
                  <p className="font-heading font-bold">{m.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-body">{m.desc}</p>
                </div>
                {mode === m.id && (
                  <Badge className="text-[10px]">נבחר ✓</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center">
          <Button size="lg" className="gap-3 font-heading px-8" onClick={startPractice}>
            <PlayCircle className="h-5 w-5" />
            התחל {mode === "quiz" ? "בוחן" : mode === "flashcards" ? "כרטיסיות" : "תרגול"} ({questions.length} שאלות)
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── QUIZ MODE ──────────────────────────────────────────────
  if (mode === "quiz" && currentQ) {
    const isMultipleChoice = currentQ.question_type === "multiple_choice";
    const isTrueFalse = currentQ.question_type === "true_false";
    const options = isTrueFalse ? ["נכון", "לא נכון"] : (currentQ.options || []);

    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>
            <ChevronLeft className="h-4 w-4 mr-1" />יציאה
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-body">{currentIdx + 1}/{shuffled.length}</span>
            <Badge variant="outline" className="gap-1 text-xs">
              <Trophy className="h-3 w-3" />{score} נקודות
            </Badge>
          </div>
        </div>

        <Progress value={progress} className="h-2" />

        <AnimatePresence mode="wait">
          <motion.div key={currentIdx} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
            <Card>
              <CardContent className="py-6">
                <p className="font-heading font-bold text-lg leading-relaxed">{currentQ.question_text}</p>
                {currentQ.points > 1 && (
                  <p className="text-xs text-muted-foreground mt-2">{currentQ.points} נקודות</p>
                )}
              </CardContent>
            </Card>

            {/* Options */}
            <div className="space-y-2">
              {(isMultipleChoice || isTrueFalse) && options.map((opt, i) => {
                const isSelected = selected === opt;
                const isCorrectOpt = opt.trim().toLowerCase() === (currentQ.correct_answer || "").trim().toLowerCase();
                let cls = "border-border hover:border-primary/50";
                if (answered) {
                  if (isCorrectOpt) cls = "border-green-500 bg-green-50 dark:bg-green-900/20";
                  else if (isSelected) cls = "border-destructive bg-red-50 dark:bg-red-900/20";
                  else cls = "border-border opacity-50";
                } else if (isSelected) cls = "border-primary bg-primary/5";

                return (
                  <button key={i} className={`w-full text-right p-3 rounded-lg border transition-all ${cls} ${!answered ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => handleAnswer(opt)} disabled={answered}>
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-sm">{opt}</span>
                      {answered && isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      {answered && isSelected && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    </div>
                  </button>
                );
              })}

              {currentQ.question_type === "fill_blank" && (
                <div className="space-y-2">
                  <input type="text" placeholder="השלם את המשפט..." value={selected || ""}
                    onChange={e => setSelected(e.target.value)} disabled={answered}
                    className="w-full border rounded-lg p-3 font-heading text-sm bg-background"
                    onKeyDown={e => { if (e.key === "Enter" && !answered && selected) handleAnswer(selected); }} />
                  {!answered && (
                    <Button className="w-full font-heading" onClick={() => selected && handleAnswer(selected)} disabled={!selected}>
                      בדוק
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Feedback */}
            {answered && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className={correct ? "border-green-500/50 bg-green-50/50 dark:bg-green-900/10" : "border-destructive/50 bg-red-50/50 dark:bg-red-900/10"}>
                  <CardContent className="py-3 space-y-1">
                    <p className={`font-heading font-bold text-sm ${correct ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                      {correct ? "✅ נכון!" : `❌ לא נכון — התשובה הנכונה: ${currentQ.correct_answer}`}
                    </p>
                    {currentQ.explanation && (
                      <p className="text-xs text-muted-foreground font-body">{currentQ.explanation}</p>
                    )}
                  </CardContent>
                </Card>
                <Button className="w-full mt-2 font-heading" onClick={nextQ}>
                  {currentIdx >= shuffled.length - 1 ? "סיים וצפה בציון" : "שאלה הבאה"} <ArrowLeft className="h-4 w-4 mr-2" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── FLASHCARDS MODE ───────────────────────────────────────
  if (mode === "flashcards") {
    const card = shuffled[fcIdx];
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>
            <ChevronLeft className="h-4 w-4 mr-1" />יציאה
          </Button>
          <Badge variant="outline">{fcIdx + 1} / {shuffled.length}</Badge>
        </div>
        <Progress value={((fcIdx) / shuffled.length) * 100} className="h-2" />

        <AnimatePresence mode="wait">
          <motion.div key={fcIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="cursor-pointer" onClick={() => setFlipped(f => !f)} style={{ perspective: "1000px" }}>
              <motion.div
                className="relative w-full rounded-2xl"
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.5 }}
                style={{ transformStyle: "preserve-3d", minHeight: "220px" }}
              >
                {/* Front */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20"
                  style={{ backfaceVisibility: "hidden" }}>
                  <p className="text-[10px] text-muted-foreground mb-3 uppercase tracking-wide">שאלה</p>
                  <p className="text-lg font-heading font-bold text-center leading-relaxed">{card?.question_text}</p>
                  <p className="text-xs text-muted-foreground mt-4">לחץ להפוך ולראות תשובה</p>
                </div>
                {/* Back */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border-2 border-green-500/20"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                  <p className="text-[10px] text-muted-foreground mb-3 uppercase tracking-wide">תשובה</p>
                  <p className="text-lg font-heading font-bold text-center leading-relaxed">{card?.correct_answer}</p>
                  {card?.explanation && (
                    <p className="text-xs text-muted-foreground mt-3 text-center">{card.explanation}</p>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" onClick={() => { setFcIdx(i => Math.max(0, i - 1)); setFlipped(false); }} disabled={fcIdx === 0}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="flex gap-2">
            {!flipped
              ? <Button variant="outline" className="font-heading" onClick={() => setFlipped(true)}>הצג תשובה</Button>
              : fcIdx < shuffled.length - 1
              ? <Button className="font-heading" onClick={() => { setFcIdx(i => i + 1); setFlipped(false); }}>הבא <ArrowLeft className="h-4 w-4 mr-1" /></Button>
              : <Button className="font-heading" onClick={() => setStarted(false)}>סיום 🎉</Button>
            }
          </div>
          <Button variant="outline" onClick={() => { setFcIdx(i => Math.min(shuffled.length - 1, i + 1)); setFlipped(false); }} disabled={fcIdx === shuffled.length - 1}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── OPEN ANSWER MODE ──────────────────────────────────────
  if (mode === "open" && currentQ) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>
            <ChevronLeft className="h-4 w-4 mr-1" />יציאה
          </Button>
          <Badge variant="outline">{currentIdx + 1} / {shuffled.length}</Badge>
        </div>
        <Progress value={((currentIdx) / shuffled.length) * 100} className="h-2" />

        <AnimatePresence mode="wait">
          <motion.div key={currentIdx} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <Card>
              <CardContent className="py-6">
                <p className="font-heading font-bold text-lg leading-relaxed">{currentQ.question_text}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Textarea
                placeholder="כתב את תשובתך כאן..."
                value={openAnswer}
                onChange={e => { setOpenAnswer(e.target.value); setOpenFeedback(null); }}
                className="font-body text-sm min-h-28 resize-none"
                disabled={checkingOpen}
              />
              <div className="flex gap-2">
                <Button className="flex-1 gap-2 font-heading" onClick={checkOpenAnswer}
                  disabled={!openAnswer.trim() || checkingOpen}>
                  {checkingOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {checkingOpen ? "ה-AI בודק..." : "בדוק עם AI"}
                </Button>
                <Button variant="outline" className="font-heading" onClick={() => {
                  setOpenAnswer(""); setOpenFeedback(null);
                  if (currentIdx < shuffled.length - 1) { setCurrentIdx(i => i + 1); }
                  else setStarted(false);
                }}>
                  {currentIdx < shuffled.length - 1 ? "דלג" : "סיים"}
                </Button>
              </div>
            </div>

            {openFeedback && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-purple-500/40 bg-purple-50/50 dark:bg-purple-900/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-heading flex items-center gap-2 text-purple-700 dark:text-purple-300">
                      <Sparkles className="h-4 w-4" />פידבק AI
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm font-body text-muted-foreground leading-relaxed">{openFeedback}</p>
                    {currentQ.correct_answer && (
                      <div className="mt-3 p-2 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground font-heading">תשובה מקורית:</p>
                        <p className="text-sm font-body mt-1">{currentQ.correct_answer}</p>
                      </div>
                    )}
                    <Button className="w-full mt-3 font-heading" onClick={() => {
                      setOpenAnswer(""); setOpenFeedback(null);
                      if (currentIdx < shuffled.length - 1) setCurrentIdx(i => i + 1);
                      else setStarted(false);
                    }}>
                      {currentIdx < shuffled.length - 1 ? "שאלה הבאה" : "סיים"}
                      <ArrowLeft className="h-4 w-4 mr-1" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return null;
};

export default StudentPracticePage;
