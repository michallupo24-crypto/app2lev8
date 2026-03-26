import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mountain, Play, Settings2, Loader2, Send, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const MountainClimbMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [stages, setStages] = useState(5);
  const [questionsPerStage, setQuestionsPerStage] = useState(3);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [questionCount, setQuestionCount] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Preview game state
  const [previewMode, setPreviewMode] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [timer, setTimer] = useState(timePerQuestion);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      supabase.from("task_questions").select("*").eq("assignment_id", assignmentId)
        .then(({ data, count }) => {
          setQuestions(data || []);
          setQuestionCount(data?.length || 0);
        });
    }
  }, [assignmentId]);

  // Timer for preview
  useEffect(() => {
    if (!previewMode || feedback || gameOver) return;
    if (timer <= 0) {
      handleAnswer(""); // time up = wrong
      return;
    }
    const t = setTimeout(() => setTimer(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, previewMode, feedback, gameOver]);

  const currentQ = questions[currentQIdx % questions.length];
  const stageProgress = currentStage / stages;

  const handleAnswer = (answer: string) => {
    if (feedback) return;
    const correct = answer === currentQ?.correct_answer;
    setFeedback(correct ? "correct" : "wrong");
    if (correct) setScore(s => s + 1);

    setTimeout(() => {
      setFeedback(null);
      setTimer(timePerQuestion);
      const nextQIdx = currentQIdx + 1;
      const qInStage = nextQIdx % questionsPerStage;
      setCurrentQIdx(nextQIdx);
      if (qInStage === 0) {
        const nextStage = currentStage + 1;
        if (nextStage >= stages) {
          setGameOver(true);
        } else {
          setCurrentStage(nextStage);
        }
      }
    }, 1500);
  };

  const publishGame = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    if (questionCount === 0) { toast({ title: "אין שאלות במשימה. הוסף שאלות קודם!", variant: "destructive" }); return; }
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({
        published: true,
        description: JSON.stringify({ game: "mountain-climb", stages, questionsPerStage, timePerQuestion }),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "משחק הטיפוס שוגר לכיתה! 🏔️🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const startPreview = () => {
    setCurrentStage(0); setCurrentQIdx(0); setScore(0);
    setFeedback(null); setTimer(timePerQuestion); setGameOver(false);
    setPreviewMode(true);
  };

  return (
    <StudioModeWrapper title="טיפוס על הר" description="תשובות נכונות מקדמות את האווטאר להצלת נסיכה" icon={<Mountain className="h-6 w-6 text-success" />} onBack={onBack}>
      {!assignmentId && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-heading text-warning">⚠️ בחר משימה פעילה וצור שאלות קודם</p>
          </CardContent>
        </Card>
      )}

      {questionCount === 0 && assignmentId && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-xs text-destructive font-heading">אין שאלות — צור שאלות דרך "הזנה ידנית" קודם</p>
          </CardContent>
        </Card>
      )}

      {!previewMode ? (
        <div className="space-y-4">
          {/* Mountain visual */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="relative h-56 bg-gradient-to-b from-sky-200 via-blue-100 to-green-200 flex items-end justify-center">
                <div className="absolute top-4 right-4 text-4xl">☀️</div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-4xl">🏰</div>
                {/* Mountain stages */}
                {Array.from({ length: stages }).map((_, i) => {
                  const bottom = (i / stages) * 70 + 10;
                  const left = 50 - i * 8;
                  const width = 100 - i * 15;
                  return (
                    <div key={i} className="absolute" style={{ bottom: `${bottom}%`, left: `${left}%`, width: `${width}%`, height: "12px", backgroundColor: i % 2 === 0 ? "#4ade80" : "#86efac", borderRadius: "4px" }}>
                      <span className="absolute -top-5 right-2 text-[10px] font-bold text-slate-600">שלב {i + 1}</span>
                    </div>
                  );
                })}
                <div className="relative bottom-2 text-3xl z-10">🧗</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Card className="p-3"><p className="text-2xl font-bold text-primary">{questionCount}</p><p className="text-[10px] text-muted-foreground">שאלות</p></Card>
            <Card className="p-3"><p className="text-2xl font-bold text-success">{stages}</p><p className="text-[10px] text-muted-foreground">שלבים</p></Card>
            <Card className="p-3"><p className="text-2xl font-bold text-warning">{timePerQuestion}s</p><p className="text-[10px] text-muted-foreground">לשאלה</p></Card>
          </div>

          {showSettings && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-heading">שלבים</Label>
                    <Input type="number" value={stages} onChange={(e) => setStages(+e.target.value)} className="h-8 text-xs" dir="ltr" min={2} max={10} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-heading">שאלות/שלב</Label>
                    <Input type="number" value={questionsPerStage} onChange={(e) => setQuestionsPerStage(+e.target.value)} className="h-8 text-xs" dir="ltr" min={1} max={10} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-heading">שניות לשאלה</Label>
                    <Input type="number" value={timePerQuestion} onChange={(e) => setTimePerQuestion(+e.target.value)} className="h-8 text-xs" dir="ltr" min={10} max={120} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 font-heading text-xs" onClick={() => setShowSettings(!showSettings)}>
              <Settings2 className="h-3.5 w-3.5" /> הגדרות
            </Button>
            {questionCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1 font-heading text-xs" onClick={startPreview}>
                <Play className="h-3.5 w-3.5" /> תצוגה מקדימה
              </Button>
            )}
            <Button className="gap-2 font-heading flex-1" onClick={publishGame} disabled={publishing || !assignmentId || questionCount === 0}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publishing ? "שולח..." : "שגר משחק לכיתה"}
            </Button>
          </div>
        </div>
      ) : (
        /* Preview mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline">תצוגת מורה — שלב {currentStage + 1}/{stages}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)}>← חזרה</Button>
          </div>

          {/* Progress bar */}
          <div className="relative h-4 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 right-0 bg-success rounded-full"
              animate={{ width: `${stageProgress * 100}%` }}
              transition={{ type: "spring" }}
            />
            <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] font-bold">{Math.round(stageProgress * 100)}%</span>
          </div>

          {gameOver ? (
            <Card className="border-success/30 bg-success/5 text-center">
              <CardContent className="py-8">
                <div className="text-6xl mb-3">🏔️🎉</div>
                <h3 className="font-heading font-bold text-xl">הגעת לפסגה!</h3>
                <p className="text-sm text-muted-foreground mt-1">ניקוד: {score} / {stages * questionsPerStage}</p>
                <Button className="mt-4" onClick={startPreview}>שחק שוב</Button>
              </CardContent>
            </Card>
          ) : currentQ ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">שאלה {(currentQIdx % questionsPerStage) + 1}/{questionsPerStage} בשלב</Badge>
                  <Badge variant={timer < 10 ? "destructive" : "secondary"} className="text-sm font-bold">⏱ {timer}s</Badge>
                </div>
                <p className="font-heading font-bold">{currentQ.question_text}</p>

                <AnimatePresence>
                  {feedback && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className={`flex items-center gap-2 p-3 rounded-lg ${feedback === "correct" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {feedback === "correct" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                      <span className="font-heading font-bold">{feedback === "correct" ? "נכון! 🎉" : `שגוי — ${currentQ.correct_answer}`}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!feedback && (
                  <div className="grid grid-cols-2 gap-2">
                    {(currentQ.options || []).map((opt: string, i: number) => (
                      <Button key={i} variant="outline" className="text-xs h-auto py-2 text-right" onClick={() => handleAnswer(opt)}>
                        {String.fromCharCode(1488 + i)}. {opt}
                      </Button>
                    ))}
                    {(!currentQ.options?.length) && (
                      <Button variant="outline" className="col-span-2" onClick={() => handleAnswer(currentQ.correct_answer)}>
                        {currentQ.correct_answer}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="text-center text-xs text-muted-foreground">ניקוד: {score}</div>
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default MountainClimbMode;
