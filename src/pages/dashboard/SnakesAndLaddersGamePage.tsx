import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dice5, ChevronLeft, Trophy, RotateCcw, CheckCircle2,
  XCircle, Loader2, Users, Skull,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ── Board layout ────────────────────────────────────────────
const BOARD_SIZE = 100;

const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

// Compute (row, col) from cell number 1-100 in S-shape
function cellToRC(n: number): { row: number; col: number } {
  const row = Math.floor((n - 1) / 10); // 0=bottom, 9=top
  const col = row % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10);
  return { row: 9 - row, col }; // flip so row 0 = top display = cell 91-100
}

const PLAYER_COLORS = ["bg-blue-500", "bg-red-500", "bg-green-500", "bg-yellow-500"];
const PLAYER_EMOJIS = ["🔵", "🔴", "🟢", "🟡"];

interface Question {
  id: string;
  question_type: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points: number;
}

interface Player {
  id: string;
  name: string;
  position: number;
  isHuman: boolean;
  colorIdx: number;
}

const SnakesAndLaddersGamePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [gameConfig, setGameConfig] = useState({ maxPlayers: 1 });

  // Game state
  const [phase, setPhase] = useState<"setup" | "playing" | "question" | "won">("setup");
  const [playerCount, setPlayerCount] = useState(1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [eventMsg, setEventMsg] = useState<string | null>(null);
  const [score, setScore] = useState(0); // correct answers
  const [totalAsked, setTotalAsked] = useState(0);
  const [usedQIds, setUsedQIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      if (!assignmentId) return;
      setLoading(true);
      const [aRes, qRes] = await Promise.all([
        supabase.from("assignments").select("title, description").eq("id", assignmentId).single(),
        supabase.from("task_questions").select("*").eq("assignment_id", assignmentId).order("order_num"),
      ]);
      setAssignmentTitle(aRes.data?.title || "משחק");
      try {
        const cfg = JSON.parse(aRes.data?.description || "{}");
        setGameConfig({ maxPlayers: cfg.maxPlayers || 4 });
        setPlayerCount(Math.min(cfg.maxPlayers || 4, 4));
      } catch { /* ignore */ }
      setQuestions(qRes.data || []);
      setLoading(false);
    };
    load();
  }, [assignmentId]);

  const startGame = () => {
    const ps: Player[] = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      name: i === 0 ? profile.fullName.split(" ")[0] : `שחקן ${i + 1}`,
      position: 0,
      isHuman: i === 0,
      colorIdx: i,
    }));
    setPlayers(ps);
    setCurrentPlayerIdx(0);
    setScore(0);
    setTotalAsked(0);
    setUsedQIds(new Set());
    setLastRoll(null);
    setEventMsg(null);
    setPhase("playing");
  };

  const pickQuestion = useCallback((): Question | null => {
    if (questions.length === 0) return null;
    // Prefer unused questions
    const unused = questions.filter(q => !usedQIds.has(q.id));
    const pool = unused.length > 0 ? unused : questions;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [questions, usedQIds]);

  const rollDice = async () => {
    if (rolling || phase !== "playing") return;
    setRolling(true);
    setEventMsg(null);

    // Animate roll
    await new Promise(r => setTimeout(r, 600));
    const roll = Math.floor(Math.random() * 6) + 1;
    setLastRoll(roll);
    setRolling(false);

    const cp = players[currentPlayerIdx];
    let newPos = cp.position + roll;
    if (newPos > BOARD_SIZE) newPos = cp.position; // bounce

    // Move player
    const updatedPlayers = players.map((p, i) =>
      i === currentPlayerIdx ? { ...p, position: newPos } : p
    );
    setPlayers(updatedPlayers);

    // Check win
    if (newPos >= BOARD_SIZE) {
      await saveResult(updatedPlayers);
      setPhase("won");
      return;
    }

    // Check snake/ladder
    if (SNAKES[newPos] !== undefined) {
      const dest = SNAKES[newPos];
      setEventMsg(`🐍 נחש! ${cp.name} ירד מ-${newPos} ל-${dest}`);
      setPlayers(prev => prev.map((p, i) => i === currentPlayerIdx ? { ...p, position: dest } : p));
      await new Promise(r => setTimeout(r, 1800));
      setEventMsg(null);
      nextTurn();
    } else if (LADDERS[newPos] !== undefined) {
      const dest = LADDERS[newPos];
      setEventMsg(`🪜 סולם! ${cp.name} עלה מ-${newPos} ל-${dest}`);
      setPlayers(prev => prev.map((p, i) => i === currentPlayerIdx ? { ...p, position: dest } : p));
      await new Promise(r => setTimeout(r, 1800));
      setEventMsg(null);
      // Show question after ladder (bonus)
      const q = pickQuestion();
      if (q) { setCurrentQuestion(q); setSelectedAnswer(null); setAnswered(false); setPhase("question"); }
      else nextTurn();
    } else if (newPos % 5 === 0 && questions.length > 0) {
      // Every 5th square = question
      const q = pickQuestion();
      if (q) {
        setTotalAsked(n => n + 1);
        setCurrentQuestion(q);
        setSelectedAnswer(null);
        setAnswered(false);
        setPhase("question");
      } else nextTurn();
    } else {
      nextTurn();
    }
  };

  const answerQuestion = async (answer: string) => {
    if (answered || !currentQuestion) return;
    setSelectedAnswer(answer);
    setAnswered(true);
    const correct = answer.trim().toLowerCase() === (currentQuestion.correct_answer || "").trim().toLowerCase();
    setAnswerCorrect(correct);

    if (correct) {
      setScore(s => s + 1);
      setUsedQIds(prev => new Set([...prev, currentQuestion.id]));
    } else {
      // Wrong: move back 3 squares
      const penalty = 3;
      setPlayers(prev => prev.map((p, i) =>
        i === currentPlayerIdx ? { ...p, position: Math.max(0, p.position - penalty) } : p
      ));
    }

    await new Promise(r => setTimeout(r, 2000));
    setCurrentQuestion(null);
    setAnswered(false);
    setSelectedAnswer(null);
    setPhase("playing");

    if (correct) nextTurn();
    else nextTurn(); // always advance turn after answer
  };

  const nextTurn = () => {
    setCurrentPlayerIdx(i => (i + 1) % players.length);
  };

  const saveResult = async (finalPlayers: Player[]) => {
    if (!assignmentId) return;
    const pct = totalAsked > 0 ? Math.round((score / totalAsked) * 100) : 100;
    try {
      const { data: existing } = await supabase.from("submissions")
        .select("id").eq("assignment_id", assignmentId).eq("student_id", profile.id).maybeSingle();
      if (existing) {
        await supabase.from("submissions").update({
          grade: pct, status: "submitted" as any, submitted_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("submissions").insert({
          assignment_id: assignmentId, student_id: profile.id,
          grade: pct, status: "submitted" as any, submitted_at: new Date().toISOString(),
        });
      }
    } catch { /* best effort */ }
  };

  // ── Board render ─────────────────────────────────────────
  const renderBoard = () => {
    const cells = [];
    for (let n = 1; n <= BOARD_SIZE; n++) {
      const { row, col } = cellToRC(n);
      const isSnake = SNAKES[n] !== undefined;
      const isLadder = LADDERS[n] !== undefined;
      const playersHere = players.filter(p => p.position === n);

      cells.push(
        <div
          key={n}
          style={{ gridRow: row + 1, gridColumn: col + 1 }}
          className={`relative flex items-center justify-center text-[8px] md:text-[9px] font-bold border rounded-sm min-h-0
            ${isSnake ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700"
              : isLadder ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700"
              : n % 2 === 0 ? "bg-muted/40 border-border/50"
              : "bg-background border-border/30"}
            ${players[0]?.position === n ? "ring-2 ring-primary ring-offset-1" : ""}`}
        >
          {playersHere.length > 0 ? (
            <span className="text-base leading-none">
              {playersHere.map(p => PLAYER_EMOJIS[p.colorIdx]).join("")}
            </span>
          ) : isSnake ? (
            <span>🐍</span>
          ) : isLadder ? (
            <span>🪜</span>
          ) : (
            <span className="text-muted-foreground/60">{n}</span>
          )}
        </div>
      );
    }
    return cells;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (questions.length === 0) return (
    <div className="flex flex-col items-center gap-4 py-20">
      <p className="text-muted-foreground font-body">אין שאלות למשחק זה</p>
      <Button variant="outline" onClick={() => navigate("/dashboard/tasks")}>
        <ChevronLeft className="h-4 w-4 mr-1" />חזור
      </Button>
    </div>
  );

  // ── SETUP SCREEN ─────────────────────────────────────────
  if (phase === "setup") return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/tasks")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-heading font-bold">נחשים וסולמות 🐍🪜</h1>
          <p className="text-sm text-muted-foreground">{assignmentTitle} • {questions.length} שאלות</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4 text-center">
          <div className="text-6xl">🐍🪜</div>
          <div>
            <p className="font-heading font-bold text-lg">מספר שחקנים</p>
            <p className="text-sm text-muted-foreground font-body">ניתן לשחק לבד או עם חברים על אותו מסך</p>
          </div>
          <div className="flex justify-center gap-3 flex-wrap">
            {Array.from({ length: Math.min(gameConfig.maxPlayers, 4) }, (_, i) => i + 1).map(n => (
              <button key={n}
                className={`w-12 h-12 rounded-xl font-heading font-bold text-lg transition-all
                  ${playerCount === n ? "bg-primary text-primary-foreground scale-110 shadow-md" : "bg-muted hover:bg-muted/80"}`}
                onClick={() => setPlayerCount(n)}>
                {n}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center pt-2">
            <div className="p-3 bg-muted/50 rounded-xl">
              <p className="text-2xl font-bold text-primary">{questions.length}</p>
              <p className="text-[10px] text-muted-foreground">שאלות</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-xl">
              <p className="text-2xl font-bold text-green-600">{Object.keys(LADDERS).length}</p>
              <p className="text-[10px] text-muted-foreground">סולמות</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-xl">
              <p className="text-2xl font-bold text-red-600">{Object.keys(SNAKES).length}</p>
              <p className="text-[10px] text-muted-foreground">נחשים</p>
            </div>
          </div>

          <Button size="lg" className="w-full gap-3 font-heading text-base" onClick={startGame}>
            <Dice5 className="h-5 w-5" />התחל משחק
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );

  // ── WON SCREEN ───────────────────────────────────────────
  if (phase === "won") {
    const winner = players.find(p => p.position >= BOARD_SIZE);
    const pct = totalAsked > 0 ? Math.round((score / totalAsked) * 100) : 100;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 max-w-lg mx-auto text-center py-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
          <Trophy className="h-24 w-24 mx-auto text-yellow-500" />
        </motion.div>
        <div>
          <p className="text-3xl font-heading font-bold">{winner?.name || "מנצח"} ניצח! 🎉</p>
          {totalAsked > 0 && (
            <p className="text-muted-foreground mt-2">{score}/{totalAsked} תשובות נכונות ({pct}%)</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">הציון נשמר אוטומטית</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button className="gap-2 font-heading" onClick={startGame}>
            <RotateCcw className="h-4 w-4" />שחק שוב
          </Button>
          <Button variant="outline" className="gap-2 font-heading" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-4 w-4" />חזור למשימות
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── GAME BOARD ───────────────────────────────────────────
  const currentPlayer = players[currentPlayerIdx];
  const isMyTurn = currentPlayer?.isHuman;

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/tasks")}>
          <ChevronLeft className="h-4 w-4 mr-1" />יציאה
        </Button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {players.map((p, i) => (
            <Badge key={p.id} variant={i === currentPlayerIdx ? "default" : "outline"}
              className="gap-1 text-xs">
              {PLAYER_EMOJIS[p.colorIdx]} {p.name}: {p.position}
            </Badge>
          ))}
        </div>
      </div>

      {/* Board */}
      <div
        className="grid gap-0.5 w-full border border-border/50 rounded-xl overflow-hidden bg-background p-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gridTemplateRows: "repeat(10, 1fr)",
          aspectRatio: "1 / 1",
        }}
      >
        {renderBoard()}
      </div>

      {/* Event message */}
      <AnimatePresence>
        {eventMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 text-center font-heading font-bold text-sm">{eventMsg}</CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question */}
      <AnimatePresence>
        {phase === "question" && currentQuestion && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/40 shadow-md">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading font-bold text-base leading-snug">{currentQuestion.question_text}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">שאלה</Badge>
                </div>

                {answered ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`p-3 rounded-lg text-sm font-heading font-bold text-center
                      ${answerCorrect ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>
                    {answerCorrect
                      ? "✅ נכון! המשך לתורך הבא"
                      : `❌ לא נכון — חזרת 3 משבצות אחורה\nתשובה נכונה: ${currentQuestion.correct_answer}`}
                    {currentQuestion.explanation && (
                      <p className="text-xs font-normal mt-1 opacity-80">{currentQuestion.explanation}</p>
                    )}
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {currentQuestion.question_type === "true_false"
                      ? ["נכון", "לא נכון"].map(opt => (
                        <button key={opt}
                          className="w-full text-right p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-primary/5 transition-all font-heading text-sm"
                          onClick={() => answerQuestion(opt)}>
                          {opt}
                        </button>
                      ))
                      : (currentQuestion.options || []).length > 0
                      ? (currentQuestion.options || []).map((opt, i) => (
                        <button key={i}
                          className="w-full text-right p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-primary/5 transition-all font-heading text-sm"
                          onClick={() => answerQuestion(opt)}>
                          {String.fromCharCode(1488 + i)}. {opt}
                        </button>
                      ))
                      : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="כתוב תשובה..."
                            className="w-full border rounded-lg p-3 font-heading text-sm bg-background"
                            onKeyDown={e => {
                              if (e.key === "Enter") answerQuestion((e.target as HTMLInputElement).value);
                            }}
                          />
                          <p className="text-xs text-muted-foreground text-center">לחץ Enter לאישור</p>
                        </div>
                      )
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dice + turn */}
      {phase === "playing" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-heading">
              {PLAYER_EMOJIS[currentPlayer?.colorIdx ?? 0]} תור: <span className="font-bold">{currentPlayer?.name}</span>
            </span>
            {!isMyTurn && (
              <Badge variant="secondary" className="text-[10px]">שחקן אחר</Badge>
            )}
          </div>

          <Button
            size="lg"
            className="gap-3 font-heading text-base px-8"
            onClick={rollDice}
            disabled={rolling}
          >
            {rolling ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.3 }}>
                  <Dice5 className="h-5 w-5" />
                </motion.div>
                מטיל...
              </>
            ) : (
              <>
                <Dice5 className="h-5 w-5" />
                {lastRoll ? `הטלת ${lastRoll} — הטל שוב` : "הטל קוביה"}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Score bar */}
      {totalAsked > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{score}/{totalAsked} נכון</span>
          <Progress value={(score / totalAsked) * 100} className="flex-1 h-1.5" />
          <span>{Math.round((score / totalAsked) * 100)}%</span>
        </div>
      )}
    </div>
  );
};

export default SnakesAndLaddersGamePage;
