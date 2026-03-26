import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dice5, Play, Settings2, Loader2, Send, AlertCircle } from "lucide-react";
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

// Fixed snakes and ladders positions
const SNAKES: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 };
const LADDERS: Record<number, number> = { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 };

const SnakesAndLaddersMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [questionCount, setQuestionCount] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [boardSize, setBoardSize] = useState(36);
  const [maxPlayers, setMaxPlayers] = useState(4);
  // Preview game state
  const [previewMode, setPreviewMode] = useState(false);
  const [playerPos, setPlayerPos] = useState(0);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      supabase.from("task_questions").select("*", { count: "exact" }).eq("assignment_id", assignmentId)
        .then(({ count, data }) => {
          setQuestionCount(count || 0);
          setQuestions(data || []);
        });
    }
  }, [assignmentId]);

  const rollDice = () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    setLastDice(roll);
    let newPos = playerPos + roll;
    if (newPos > 36) newPos = playerPos; // bounce back
    
    setMessage("");
    setAnswered(false);
    
    if (SNAKES[newPos]) {
      setMessage(`🐍 נחש! ירדת מ-${newPos} ל-${SNAKES[newPos]}`);
      setPlayerPos(SNAKES[newPos]);
    } else if (LADDERS[newPos]) {
      setMessage(`🪜 סולם! עלית מ-${newPos} ל-${LADDERS[newPos]}`);
      setPlayerPos(LADDERS[newPos]);
      // Show question to keep progress
      if (questions.length > 0) {
        setCurrentQuestion(questions[Math.floor(Math.random() * questions.length)]);
      }
    } else if (newPos % 5 === 0 && questions.length > 0) {
      setPlayerPos(newPos);
      setCurrentQuestion(questions[Math.floor(Math.random() * questions.length)]);
    } else {
      setPlayerPos(newPos);
    }
    
    if (newPos >= 36) setMessage("🎉 הגעת לסיום! ניצחת!");
  };

  const answerQuestion = (answer: string) => {
    if (!currentQuestion || answered) return;
    const correct = answer === currentQuestion.correct_answer;
    setAnswered(true);
    if (!correct) {
      const penalty = Math.min(3, playerPos);
      setPlayerPos(p => p - penalty);
      setMessage(`❌ תשובה שגויה — חזרת ${penalty} משבצות אחורה`);
    } else {
      setMessage("✅ תשובה נכונה! המשך לזרוק");
    }
    setTimeout(() => { setCurrentQuestion(null); setAnswered(false); }, 2000);
  };

  const renderMiniBoard = () => {
    const cells = [];
    // Draw 6x6 board (36 cells) in S-shape
    for (let row = 5; row >= 0; row--) {
      const rowCells = [];
      for (let col = 0; col < 6; col++) {
        const num = row % 2 === 1
          ? row * 6 + (6 - col)
          : row * 6 + col + 1;
        const isSnake = SNAKES[num] !== undefined;
        const isLadder = LADDERS[num] !== undefined;
        const isPlayer = num === playerPos;
        rowCells.push(
          <div key={num} className={`w-full aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold border relative
            ${isSnake ? "bg-destructive/20 border-destructive/30" : isLadder ? "bg-success/20 border-success/30" : "bg-muted/50 border-border/50"}
            ${isPlayer ? "ring-2 ring-primary" : ""}`}>
            {isPlayer ? "🧍" : isSnake ? "🐍" : isLadder ? "🪜" : num}
          </div>
        );
      }
      cells.push(...rowCells);
    }
    return cells;
  };

  const publishGame = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    if (questionCount === 0) { toast({ title: "אין שאלות במשימה. הוסף שאלות קודם!", variant: "destructive" }); return; }
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({
        published: true,
        description: JSON.stringify({ game: "snakes-ladders", boardSize, maxPlayers }),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "משחק נחשים וסולמות שוגר לכיתה! 🐍🪜🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="נחשים וסולמות" description="לוח משחק אינטראקטיבי מותנה בפתרון תרגילים" icon={<Dice5 className="h-6 w-6 text-destructive" />} onBack={onBack}>
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
            <p className="text-xs text-destructive font-heading">אין שאלות במשימה — צור שאלות דרך "הזנה ידנית" קודם</p>
          </CardContent>
        </Card>
      )}

      {!previewMode ? (
        <div className="space-y-4">
          {/* Mini board preview */}
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="grid grid-cols-6 gap-0.5 max-w-xs mx-auto">
                {renderMiniBoard()}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Card className="p-3"><p className="text-2xl font-bold text-primary">{questionCount}</p><p className="text-[10px] text-muted-foreground">שאלות</p></Card>
            <Card className="p-3"><p className="text-2xl font-bold text-success">{Object.keys(LADDERS).length}</p><p className="text-[10px] text-muted-foreground">סולמות</p></Card>
            <Card className="p-3"><p className="text-2xl font-bold text-destructive">{Object.keys(SNAKES).length}</p><p className="text-[10px] text-muted-foreground">נחשים</p></Card>
          </div>

          {showSettings && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-heading">גודל לוח</Label>
                    <Input type="number" value={boardSize} onChange={(e) => setBoardSize(+e.target.value)} className="h-8 text-xs" dir="ltr" min={16} max={100} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-heading">שחקנים מקסימום</Label>
                    <Input type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(+e.target.value)} className="h-8 text-xs" dir="ltr" min={2} max={6} />
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
              <Button variant="outline" size="sm" className="gap-1 font-heading text-xs" onClick={() => { setPreviewMode(true); setPlayerPos(0); }}>
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
        /* Preview game mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline">תצוגת מורה — בדיקת המשחק</Badge>
            <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)}>← חזרה</Button>
          </div>

          <div className="grid grid-cols-6 gap-0.5 max-w-xs mx-auto">
            {renderMiniBoard()}
          </div>

          {message && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-3 text-center text-sm font-heading">{message}</CardContent>
              </Card>
            </motion.div>
          )}

          {currentQuestion && !answered ? (
            <Card className="border-info/30">
              <CardContent className="p-5 space-y-3">
                <p className="font-heading font-bold text-sm">{currentQuestion.question_text}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(currentQuestion.options || []).map((opt: string, i: number) => (
                    <Button key={i} variant="outline" className="text-xs h-auto py-2 text-right" onClick={() => answerQuestion(opt)}>
                      {String.fromCharCode(1488 + i)}. {opt}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : !currentQuestion && playerPos < 36 && (
            <div className="flex items-center justify-center gap-4">
              <Button className="gap-2 font-heading text-lg px-8 py-6" onClick={rollDice}>
                <Dice5 className="h-6 w-6" />
                {lastDice ? `זרקת ${lastDice} — זרוק שוב` : "זרוק קוביה"}
              </Button>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground">
            מיקום: {playerPos} / 36
          </div>
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default SnakesAndLaddersMode;
