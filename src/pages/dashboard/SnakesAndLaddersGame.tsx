import { useState, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft, Trophy, RotateCcw, Dice5, CheckCircle2, XCircle,
  Users, Loader2, Play, Crown,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ─── Board constants (100 cells, classic layout) ──────────────────────────────
const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};
const BOARD_SIZE = 100;

// Cell position → pixel center on SVG (560×560)
function cellToXY(cell: number): { x: number; y: number } {
  const idx = cell - 1; // 0-indexed
  const row = Math.floor(idx / 10); // 0 = bottom
  const col = row % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  const cellW = 56;
  return {
    x: col * cellW + cellW / 2,
    y: (9 - row) * cellW + cellW / 2,
  };
}

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
  color: string;
  pos: number;
  score: number;
  isAI?: boolean;
}

const PLAYER_COLORS = ["#4f46e5", "#16a34a", "#dc2626", "#d97706"];
const PLAYER_EMOJIS = ["🟣", "🟢", "🔴", "🟡"];

type GamePhase = "lobby" | "playing" | "question" | "finished";

const SnakesAndLaddersGame = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [numPlayers, setNumPlayers] = useState(1);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState("");
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [usedQIds, setUsedQIds] = useState<Set<string>>(new Set());
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [moveQueue, setMoveQueue] = useState<number | null>(null);

  // Dice animation frames
  const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  useEffect(() => {
    const load = async () => {
      if (!assignmentId) return;
      const [aRes, qRes] = await Promise.all([
        supabase.from("assignments").select("title").eq("id", assignmentId).single(),
        supabase.from("task_questions").select("*").eq("assignment_id", assignmentId).order("order_num"),
      ]);
      setAssignmentTitle(aRes.data?.title || "משחק");
      setQuestions(qRes.data || []);
      setLoading(false);
    };
    load();
  }, [assignmentId]);

  const startGame = () => {
    const newPlayers: Player[] = [];
    // Player 1 = real user
    newPlayers.push({ id: profile.id, name: profile.fullName.split(" ")[0] || "אתה", color: PLAYER_COLORS[0], pos: 0, score: 0 });
    // Extra players (local or AI)
    for (let i = 1; i < numPlayers; i++) {
      newPlayers.push({ id: `ai_${i}`, name: `שחקן ${i + 1}`, color: PLAYER_COLORS[i], pos: 0, score: 0, isAI: numPlayers === 1 });
    }
    setPlayers(newPlayers);
    setCurrentPlayerIdx(0);
    setPhase("playing");
    setCorrectCount(0);
    setTotalAnswered(0);
    setUsedQIds(new Set());
    setDiceValue(null);
    setMessage("הזמן לזרוק את הקוביה!");
  };

  const getRandomQ = useCallback((): Question | null => {
    const available = questions.filter(q => !usedQIds.has(q.id));
    if (available.length === 0) {
      // Reset used
      setUsedQIds(new Set());
      return questions[Math.floor(Math.random() * questions.length)] || null;
    }
    return available[Math.floor(Math.random() * available.length)];
  }, [questions, usedQIds]);

  const movePlayer = useCallback((playerIdx: number, steps: number, callback?: () => void) => {
    setPlayers(prev => {
      const updated = [...prev];
      const p = { ...updated[playerIdx] };
      let newPos = Math.min(p.pos + steps, BOARD_SIZE);

      // Bounce back if overshoot 100
      if (p.pos + steps > BOARD_SIZE) newPos = p.pos;

      // Check snake or ladder
      if (SNAKES[newPos] !== undefined) {
        const dest = SNAKES[newPos];
        setMessage(`🐍 נחש! ${p.name} ירד מ-${newPos} ל-${dest}`);
        newPos = dest;
      } else if (LADDERS[newPos] !== undefined) {
        const dest = LADDERS[newPos];
        setMessage(`🪜 סולם! ${p.name} עלה מ-${newPos} ל-${dest}`);
        newPos = dest;
      } else {
        setMessage(`${p.name} עבר ל-${newPos}`);
      }

      p.pos = newPos;
      updated[playerIdx] = p;
      return updated;
    });
    if (callback) setTimeout(callback, 800);
  }, []);

  const rollDice = useCallback(async () => {
    if (rolling || phase !== "playing") return;
    setRolling(true);

    // Animate dice
    let frame = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      frame++;
      if (frame >= 8) clearInterval(interval);
    }, 80);

    await new Promise(r => setTimeout(r, 700));
    const roll = Math.floor(Math.random() * 6) + 1;
    setDiceValue(roll);
    setRolling(false);

    const p = players[currentPlayerIdx];
    const newPos = Math.min(p.pos + roll, BOARD_SIZE);
    const actualPos = p.pos + roll > BOARD_SIZE ? p.pos : newPos;

    // Move
    movePlayer(currentPlayerIdx, roll, () => {
      // Check win
      if (actualPos >= BOARD_SIZE) {
        endGame(currentPlayerIdx);
        return;
      }

      // Every 5th cell or landing on special positions triggers a question
      const needsQ = questions.length > 0 && (
        actualPos % 5 === 0 ||
        actualPos % 7 === 0 ||
        LADDERS[actualPos] !== undefined
      );

      if (needsQ) {
        const q = getRandomQ();
        if (q) {
          setCurrentQ(q);
          setSelectedAnswer(null);
          setAnswered(false);
          setPhase("question");
          return;
        }
      }

      // Next player
      nextPlayer();
    });
  }, [rolling, phase, players, currentPlayerIdx, questions, getRandomQ, movePlayer]);

  const nextPlayer = useCallback(() => {
    setCurrentPlayerIdx(prev => {
      const next = (prev + 1) % players.length;
      setMessage(`תור של ${players[next]?.name || ""}`);
      setPhase("playing");
      return next;
    });
  }, [players]);

  const handleAnswer = (ans: string) => {
    if (answered || !currentQ) return;
    setSelectedAnswer(ans);
    setAnswered(true);
    setTotalAnswered(t => t + 1);
    setUsedQIds(prev => new Set([...prev, currentQ.id]));

    const isCorrect = ans.trim().toLowerCase() === currentQ.correct_answer.trim().toLowerCase();

    if (isCorrect) {
      setCorrectCount(c => c + 1);
      setPlayers(prev => prev.map((p, i) =>
        i === currentPlayerIdx ? { ...p, score: p.score + currentQ.points } : p
      ));
      setMessage("✅ נכון! המשך לשחק");
    } else {
      // Wrong: go back 3
      const penalty = Math.min(3, players[currentPlayerIdx]?.pos || 0);
      setMessage(`❌ לא נכון — חזרת ${penalty} משבצות. התשובה: ${currentQ.correct_answer}`);
      setPlayers(prev => prev.map((p, i) =>
        i === currentPlayerIdx ? { ...p, pos: Math.max(0, p.pos - penalty) } : p
      ));
    }

    setTimeout(() => {
      setCurrentQ(null);
      nextPlayer();
    }, 2200);
  };

  const endGame = async (winnerIdx: number) => {
    setPhase("finished");
    const winner = players[winnerIdx];
    setMessage(`🏆 ${winner.name} ניצח!`);

    // Save score
    if (assignmentId && players[0].id === profile.id) {
      const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 50;
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
        toast({ title: `ציון נשמר: ${pct}%` });
      } catch { /* best effort */ }
    }
  };

  // ─── SVG Board renderer ────────────────────────────────────────────────────
  const renderBoard = () => {
    const cellW = 56;
    const cells: JSX.Element[] = [];

    for (let cell = 1; cell <= BOARD_SIZE; cell++) {
      const idx = cell - 1;
      const row = Math.floor(idx / 10);
      const col = row % 2 === 0 ? idx % 10 : 9 - (idx % 10);
      const x = col * cellW;
      const y = (9 - row) * cellW;

      const isSnake = SNAKES[cell] !== undefined;
      const isLadder = LADDERS[cell] !== undefined;
      const isStart = cell === 1;
      const isEnd = cell === BOARD_SIZE;

      let fill = (row + col) % 2 === 0 ? "#f1f5f9" : "#e2e8f0";
      if (isSnake) fill = "#fee2e2";
      if (isLadder) fill = "#dcfce7";
      if (isStart) fill = "#dbeafe";
      if (isEnd) fill = "#fef9c3";

      cells.push(
        <g key={cell}>
          <rect x={x} y={y} width={cellW} height={cellW} fill={fill} stroke="#cbd5e1" strokeWidth={0.5} rx={3} />
          <text x={x + cellW / 2} y={y + 14} textAnchor="middle" fontSize={10} fill="#64748b" fontFamily="sans-serif" fontWeight="500">{cell}</text>
          {isSnake && <text x={x + cellW / 2} y={y + 38} textAnchor="middle" fontSize={18}>🐍</text>}
          {isLadder && <text x={x + cellW / 2} y={y + 38} textAnchor="middle" fontSize={18}>🪜</text>}
          {isEnd && <text x={x + cellW / 2} y={y + 38} textAnchor="middle" fontSize={18}>🏆</text>}
        </g>
      );
    }

    // Draw players
    const playersOnBoard = players.filter(p => p.pos > 0 && p.pos <= BOARD_SIZE);
    playersOnBoard.forEach((p, pi) => {
      const { x, y } = cellToXY(p.pos);
      const offset = pi * 10 - (playersOnBoard.length - 1) * 5;
      cells.push(
        <motion.g key={`player_${p.id}`}
          initial={false}
          animate={{ cx: x + offset, cy: y }}
          transition={{ type: "spring", duration: 0.5 }}>
          <circle cx={x + offset} cy={y} r={12} fill={p.color} stroke="white" strokeWidth={2} />
          <text x={x + offset} y={y + 4} textAnchor="middle" fontSize={11} fill="white" fontFamily="sans-serif" fontWeight="bold">
            {pi + 1}
          </text>
        </motion.g>
      );
    });

    return cells;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (questions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Dice5 className="h-16 w-16 text-muted-foreground/20" />
      <p className="text-muted-foreground font-body">אין שאלות למשחק זה</p>
      <Button variant="outline" onClick={() => navigate("/dashboard/tasks")}>
        <ChevronLeft className="h-4 w-4 mr-1" />חזור
      </Button>
    </div>
  );

  // ─── LOBBY ─────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold flex items-center gap-2">🐍🪜 נחשים וסולמות</h1>
            <p className="text-sm text-muted-foreground">{assignmentTitle} • {questions.length} שאלות</p>
          </div>
        </div>

        <Card>
          <CardContent className="py-8 text-center space-y-6">
            <div className="text-6xl">🎲</div>
            <div>
              <p className="font-heading font-bold text-lg">כמה שחקנים?</p>
              <p className="text-sm text-muted-foreground mt-1">עד 4 שחקנים על אותו מסך</p>
            </div>
            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4].map(n => (
                <button key={n}
                  className={`w-14 h-14 rounded-xl border-2 font-heading font-bold text-xl transition-all ${numPlayers === n ? "border-primary bg-primary/10 text-primary scale-110" : "border-border hover:border-primary/50"}`}
                  onClick={() => setNumPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: numPlayers }, (_, i) => (
                <Badge key={i} style={{ backgroundColor: PLAYER_COLORS[i] + "33", color: PLAYER_COLORS[i], borderColor: PLAYER_COLORS[i] + "66" }} variant="outline" className="text-xs px-3 py-1">
                  {i === 0 ? profile.fullName.split(" ")[0] : `שחקן ${i + 1}`}
                </Badge>
              ))}
            </div>
            <Button size="lg" className="gap-2 font-heading px-10" onClick={startGame}>
              <Play className="h-5 w-5" />התחל משחק
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ─── FINISHED ──────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.pos - a.pos || b.score - a.score);
    const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 max-w-lg mx-auto text-center">
        <div className="py-8 space-y-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
            <Crown className="h-20 w-20 mx-auto text-yellow-500" />
          </motion.div>
          <h2 className="text-3xl font-heading font-bold">{sorted[0]?.name} ניצח! 🏆</h2>
          <p className="text-muted-foreground">ענית נכון על {correctCount} מתוך {totalAnswered} שאלות ({pct}%)</p>
        </div>

        <Card>
          <CardContent className="py-4 space-y-2">
            {sorted.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-heading font-bold text-muted-foreground">{i + 1}.</span>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="font-heading font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">משבצת {p.pos}</span>
                  <Badge variant="outline">{p.score} נק'</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-center">
          <Button className="gap-2 font-heading" onClick={startGame}>
            <RotateCcw className="h-4 w-4" />שחק שוב
          </Button>
          <Button variant="ghost" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-4 w-4 mr-1" />חזור
          </Button>
        </div>
      </motion.div>
    );
  }

  // ─── PLAYING / QUESTION ────────────────────────────────────────────────────
  const currentPlayer = players[currentPlayerIdx];
  const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => { if (confirm("לצאת מהמשחק?")) navigate("/dashboard/tasks"); }}>
          <ChevronLeft className="h-4 w-4 mr-1" />יציאה
        </Button>
        <div className="flex items-center gap-2">
          {totalAnswered > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              {correctCount}/{totalAnswered} ({pct}%)
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">🎲 {assignmentTitle}</Badge>
        </div>
      </div>

      {/* Players strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {players.map((p, i) => (
          <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shrink-0 ${i === currentPlayerIdx ? "border-primary bg-primary/10" : "border-border"}`}>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs font-heading font-medium">{p.name}</span>
            <span className="text-xs text-muted-foreground">📍{p.pos}</span>
            {p.score > 0 && <span className="text-xs text-yellow-500">{p.score}נק'</span>}
          </div>
        ))}
      </div>

      {/* Board SVG */}
      <Card className="overflow-hidden">
        <CardContent className="p-2">
          <div className="overflow-auto">
            <svg viewBox="0 0 560 560" width="100%" style={{ maxWidth: 560 }} className="mx-auto block">
              {renderBoard()}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Message */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div key={message} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="text-center text-sm font-heading text-muted-foreground bg-muted/50 rounded-lg py-2 px-4">{message}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUESTION panel */}
      <AnimatePresence>
        {phase === "question" && currentQ && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/40 shadow-lg">
              <CardContent className="py-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Badge style={{ backgroundColor: currentPlayer?.color + "22", color: currentPlayer?.color }} variant="outline">
                    שאלה לכ-{currentPlayer?.name}
                  </Badge>
                  {currentQ.points > 1 && <Badge variant="outline" className="text-xs">{currentQ.points} נקודות</Badge>}
                </div>
                <p className="font-heading font-bold text-base leading-relaxed">{currentQ.question_text}</p>

                {/* Options */}
                {(currentQ.question_type === "multiple_choice" || currentQ.question_type === "true_false") && (
                  <div className="grid grid-cols-1 gap-2">
                    {(currentQ.question_type === "true_false"
                      ? ["נכון", "לא נכון"]
                      : currentQ.options || []
                    ).map((opt, i) => {
                      const isSelected = selectedAnswer === opt;
                      const isCorrectOpt = answered && opt.trim().toLowerCase() === currentQ.correct_answer.trim().toLowerCase();
                      const isWrong = answered && isSelected && !isCorrectOpt;
                      return (
                        <button key={i}
                          className={`text-right w-full p-3 rounded-lg border transition-all font-heading text-sm
                            ${isCorrectOpt ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700" : ""}
                            ${isWrong ? "border-destructive bg-red-50 dark:bg-red-900/20 text-destructive" : ""}
                            ${!answered && !isSelected ? "border-border hover:border-primary/50 hover:bg-primary/5" : ""}
                            ${!answered && isSelected ? "border-primary bg-primary/10" : ""}
                          `}
                          onClick={() => handleAnswer(opt)}
                          disabled={answered}>
                          <span className="flex items-center justify-between">
                            <span>{opt}</span>
                            {isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                            {isWrong && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQ.question_type === "fill_blank" && !answered && (
                  <div className="flex gap-2">
                    <input autoFocus type="text" placeholder="כתב תשובה..."
                      value={selectedAnswer || ""}
                      onChange={e => setSelectedAnswer(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && selectedAnswer) handleAnswer(selectedAnswer); }}
                      className="flex-1 border rounded-lg p-2 font-heading text-sm bg-background" />
                    <Button onClick={() => selectedAnswer && handleAnswer(selectedAnswer)} disabled={!selectedAnswer}>אשר</Button>
                  </div>
                )}

                {answered && currentQ.explanation && (
                  <p className="text-xs text-muted-foreground font-body bg-muted/50 rounded-lg p-2">{currentQ.explanation}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dice & Roll */}
      {phase === "playing" && (
        <div className="flex items-center justify-between gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground font-body">תור של</p>
            <p className="font-heading font-bold" style={{ color: currentPlayer?.color }}>
              {currentPlayer?.name}
            </p>
          </div>

          <motion.div
            animate={rolling ? { rotate: [0, 15, -15, 10, -10, 0], scale: [1, 1.2, 0.9, 1.1, 1] } : {}}
            transition={{ duration: 0.7 }}
            className="text-5xl select-none">
            {diceValue ? diceFaces[diceValue - 1] : "🎲"}
          </motion.div>

          <Button size="lg" className="gap-2 font-heading" onClick={rollDice} disabled={rolling}>
            {rolling ? <Loader2 className="h-5 w-5 animate-spin" /> : <Dice5 className="h-5 w-5" />}
            {rolling ? "מגלגל..." : "זרוק!"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default SnakesAndLaddersGame;
