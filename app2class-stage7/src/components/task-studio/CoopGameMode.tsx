import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Play, Loader2, Send, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
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

const CoopGameMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [questionCount, setQuestionCount] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [publishing, setPublishing] = useState(false);
  // Preview state
  const [previewMode, setPreviewMode] = useState(false);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [fireScore, setFireScore] = useState(0);
  const [waterScore, setWaterScore] = useState(0);
  const [activePlayer, setActivePlayer] = useState<"fire" | "water">("fire");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      supabase.from("task_questions").select("*").eq("assignment_id", assignmentId)
        .then(({ data }) => {
          setQuestions(data || []);
          setQuestionCount(data?.length || 0);
        });
    }
  }, [assignmentId]);

  const currentQ = questions[currentQIdx % Math.max(questions.length, 1)];

  const handleAnswer = (answer: string) => {
    if (feedback) return;
    const correct = answer === currentQ?.correct_answer;
    setFeedback(correct ? "correct" : "wrong");
    if (correct) {
      if (activePlayer === "fire") setFireScore(s => s + 1);
      else setWaterScore(s => s + 1);
    }
    setTimeout(() => {
      setFeedback(null);
      const nextIdx = currentQIdx + 1;
      if (nextIdx >= questions.length) {
        setGameOver(true);
      } else {
        setCurrentQIdx(nextIdx);
        setActivePlayer(p => p === "fire" ? "water" : "fire");
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
        description: JSON.stringify({ game: "coop-firewater", players: 2 }),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "חדרי המשחק נוצרו! 🔥💧🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="בן האש ובת המים" description="משימת Co-op זוגית הדורשת שיתוף פעולה" icon={<Flame className="h-6 w-6 text-warning" />} onBack={onBack}>
      {questionCount === 0 && assignmentId && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-xs text-destructive font-heading">אין שאלות — צור שאלות דרך "הזנה ידנית" קודם</p>
          </CardContent>
        </Card>
      )}

      {!previewMode ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative h-48 bg-gradient-to-b from-orange-900/80 via-blue-900/60 to-slate-900 flex items-center justify-center">
              <div className="flex gap-12 justify-center">
                <div className="text-center"><span className="text-5xl">🔥</span><p className="text-white text-xs mt-1 font-heading">בן האש</p></div>
                <div className="text-center"><span className="text-5xl">💧</span><p className="text-white text-xs mt-1 font-heading">בת המים</p></div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Card className="p-3"><p className="text-lg font-bold">{questionCount}</p><p className="text-[10px] text-muted-foreground">שאלות</p></Card>
                <Card className="p-3"><p className="text-lg font-bold">2</p><p className="text-[10px] text-muted-foreground">שחקנים</p></Card>
                <Card className="p-3"><p className="text-lg font-bold">🏆</p><p className="text-[10px] text-muted-foreground">ציון משותף</p></Card>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50"><span>🔥</span><span>שאלות אי-זוגיות</span></div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50"><span>💧</span><span>שאלות זוגיות</span></div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/50"><span>🤝</span><span>חידות משותפות</span></div>
              </div>
              <div className="flex gap-2">
                {questionCount > 0 && (
                  <Button variant="outline" size="sm" className="gap-1 font-heading text-xs" onClick={() => { setCurrentQIdx(0); setFireScore(0); setWaterScore(0); setActivePlayer("fire"); setGameOver(false); setPreviewMode(true); }}>
                    <Play className="h-3.5 w-3.5" /> תצוגה מקדימה
                  </Button>
                )}
                <Button className="flex-1 gap-2 font-heading" onClick={publishGame} disabled={publishing || !assignmentId || questionCount === 0}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {publishing ? "יוצר חדרים..." : "צור חדרי משחק"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge className={`${activePlayer === "fire" ? "bg-orange-500" : "bg-blue-500"} text-white`}>
              {activePlayer === "fire" ? "🔥 תור בן האש" : "💧 תור בת המים"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)}>← חזרה</Button>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-2 gap-3">
            <Card className={`p-3 text-center ${activePlayer === "fire" ? "ring-2 ring-orange-400" : ""}`}>
              <p className="text-2xl">🔥</p><p className="font-bold">{fireScore}</p>
            </Card>
            <Card className={`p-3 text-center ${activePlayer === "water" ? "ring-2 ring-blue-400" : ""}`}>
              <p className="text-2xl">💧</p><p className="font-bold">{waterScore}</p>
            </Card>
          </div>

          {gameOver ? (
            <Card className="text-center border-success/30 bg-success/5">
              <CardContent className="py-8">
                <div className="text-5xl mb-3">{fireScore >= waterScore ? "🔥" : "💧"}🏆</div>
                <h3 className="font-heading font-bold text-lg">המשחק הסתיים!</h3>
                <p className="text-sm text-muted-foreground">ניקוד משותף: {fireScore + waterScore} / {questions.length}</p>
                <Button className="mt-4" onClick={() => { setCurrentQIdx(0); setFireScore(0); setWaterScore(0); setGameOver(false); setActivePlayer("fire"); }}>שחק שוב</Button>
              </CardContent>
            </Card>
          ) : currentQ ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                <Badge variant="outline" className="text-xs">{currentQIdx + 1} / {questions.length}</Badge>
                <p className="font-heading font-bold">{currentQ.question_text}</p>

                <AnimatePresence>
                  {feedback && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={`flex items-center gap-2 p-3 rounded-lg ${feedback === "correct" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {feedback === "correct" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                      <span className="font-heading font-bold">{feedback === "correct" ? "נכון!" : `שגוי — ${currentQ.correct_answer}`}</span>
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
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default CoopGameMode;
