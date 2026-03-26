import { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Dice5, Trophy, Users, Loader2, XCircle,
  CheckCircle2, AlertCircle, Crown, RotateCcw,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ── Board layout ───────────────────────────────────────────────────────────
// 10x10, cells 1-100. Row 1 (bottom) goes left→right, row 2 right→left, etc.
const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

const PLAYER_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
const PLAYER_EMOJIS = ["🟣", "🟢", "🟡", "🔴"];

function cellToXY(cell: number): { x: number; y: number } {
  const idx = cell - 1; // 0-based
  const row = Math.floor(idx / 10); // 0 = bottom
  const col = row % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  const CELL = 52; // px per cell
  const MARGIN = 4;
  return {
    x: MARGIN + col * CELL + CELL / 2,
    y: MARGIN + (9 - row) * CELL + CELL / 2,
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
  id: number;
  name: string;
  pos: number;
  score: number;
  color: string;
  emoji: string;
  finished: boolean;
}

const SnakesLaddersGame = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState("");

  // Setup
  const [setupDone, setSetupDone] = useState(false);
  const [playerCount, setPlayerCount] = useState(1);
  const [playerNames, setPlayerNames] = useState(["", "", "", ""]);

  // Game state
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [diceAnim, setDiceAnim] = useState(false);
  const [gameMessage, setGameMessage] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);

  // Question
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState(false);

  // Pending move (applied after answering question)
  const pendingPosRef = useRef<number | null>(null);
  const pendingMessageRef = useRef("");

  useEffect(() => {
    const load = async () => {
      if (!assignmentId) return;
      setLoading(true);
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
    const names = playerNames.slice(0, playerCount).map((n, i) => n.trim() || `שחקן ${i + 1}`);
    setPlayers(names.map((name, i) => ({
      id: i, name, pos: 0, score: 0,
      color: PLAYER_COLORS[i], emoji: PLAYER_EMOJIS[i], finished: false,
    })));
    setCurrentPlayer(0);
    setSetupDone(true);
    setGameMessage(`תור של ${names[0]}`);
  };

  const getRandomQuestion = useCallback((): Question | null => {
    if (questions.length === 0) return null;
    return questions[Math.floor(Math.random() * questions.length)];
  }, [questions]);

  const applyMove = (playerIdx: number, newPos: number, msg: string) => {
    setPlayers(prev => prev.map((p, i) =>
      i === playerIdx ? { ...p, pos: newPos, finished: newPos >= 100 } : p
    ));
    setGameMessage(msg);
    if (newPos >= 100) {
      const updatedPlayer = { ...players[playerIdx], pos: 100, finished: true };
      setWinner(updatedPlayer);
      setGameOver(true);
      saveScore(playerIdx);
    }
  };

  const saveScore = async (winnerIdx: number) => {
    if (!assignmentId) return;
    try {
      const correctAnswers = players[winnerIdx].score;
      const totalQ = Math.max(1, questions.length);
      const grade = Math.min(100, Math.round((correctAnswers / totalQ) * 100) + 50); // base 50 for reaching end
      const { data: existing } = await supabase.from("submissions")
        .select("id").eq("assignment_id", assignmentId).eq("student_id", profile.id).maybeSingle();
      if (existing) {
        await supabase.from("submissions").update({ grade, status: "submitted" as any, submitted_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await supabase.from("submissions").insert({
          assignment_id: assignmentId, student_id: profile.id,
          grade, status: "submitted" as any, submitted_at: new Date().toISOString(),
        });
      }
    } catch { /* best-effort */ }
  };

  const rollDice = async () => {
    if (rolling || activeQuestion || gameOver) return;
    const p = players[currentPlayer];
    if (p.finished) { nextTurn(); return; }

    setRolling(true);
    setDiceAnim(true);
    setGameMessage("");

    // Animate dice
    await new Promise(r => setTimeout(r, 600));
    setDiceAnim(false);

    const roll = Math.floor(Math.random() * 6) + 1;
    setLastDice(roll);

    let rawPos = p.pos + roll;
    if (rawPos > 100) rawPos = p.pos; // bounce

    // Check snake/ladder
    let finalPos = rawPos;
    let moveMsg = `${p.name} זרק ${roll}`;

    if (SNAKES[rawPos] !== undefined) {
      finalPos = SNAKES[rawPos];
      moveMsg += ` 🐍 נחש! ירד מ-${rawPos} ל-${finalPos}`;
      // No question for snake — just move down
      applyMove(currentPlayer, finalPos, moveMsg);
      setRolling(false);
      setTimeout(() => nextTurn(), 2200);
      return;
    }

    if (LADDERS[rawPos] !== undefined) {
      finalPos = LADDERS[rawPos];
      moveMsg += ` 🪜 סולם! עלה מ-${rawPos} ל-${finalPos}`;
    }

    // Move to rawPos first, then question decides if ladder applies
    applyMove(currentPlayer, rawPos, moveMsg);

    // Every 5th cell OR landing on ladder → question
    const q = getRandomQuestion();
    if (q && (rawPos % 5 === 0 || LADDERS[rawPos] !== undefined)) {
      pendingPosRef.current = finalPos; // after correct: go to finalPos
      pendingMessageRef.current = LADDERS[rawPos] !== undefined
        ? `✅ ענית נכון! עלית לסולם: ${finalPos}`
        : `✅ ענית נכון! +${q.points} נקודות`;
      setActiveQuestion(q);
      setSelectedAnswer(null);
      setAnswerLocked(false);
    } else {
      setRolling(false);
      if (rawPos >= 100) return;
      setTimeout(() => nextTurn(), 1500);
    }
  };

  const handleAnswer = (ans: string) => {
    if (answerLocked || !activeQuestion) return;
    setSelectedAnswer(ans);
    setAnswerLocked(true);
    const correct = ans.trim().toLowerCase() === (activeQuestion.correct_answer || "").trim().toLowerCase();
    setAnswerCorrect(correct);

    setPlayers(prev => prev.map((p, i) => {
      if (i !== currentPlayer) return p;
      if (correct) {
        const newPos = pendingPosRef.current ?? p.pos;
        const finished = newPos >= 100;
        if (finished) {
          setTimeout(() => { setWinner({ ...p, pos: 100, finished: true }); setGameOver(true); saveScore(i); }, 1800);
        }
        return { ...p, pos: newPos, score: p.score + activeQuestion.points, finished };
      } else {
        const penalty = Math.min(5, p.pos);
        return { ...p, pos: p.pos - penalty };
      }
    }));

    setGameMessage(correct
      ? pendingMessageRef.current
      : `❌ תשובה שגויה! ${activeQuestion.correct_answer} — ירדת 5 משבצות`
    );

    setTimeout(() => {
      setActiveQuestion(null);
      setAnswerLocked(false);
      setSelectedAnswer(null);
      setRolling(false);
      pendingPosRef.current = null;
      pendingMessageRef.current = "";
      if (!gameOver) nextTurn();
    }, 2000);
  };

  const nextTurn = () => {
    setPlayers(prev => {
      const activePlayers = prev.filter(p => !p.finished);
      if (activePlayers.length === 0) return prev;
      setCurrentPlayer(ci => {
        let next = (ci + 1) % prev.length;
        while (prev[next]?.finished) next = (next + 1) % prev.length;
        setGameMessage(`תור של ${prev[next]?.name}`);
        return next;
      });
      return prev;
    });
  };

  const resetGame = () => {
    setSetupDone(false);
    setPlayers([]);
    setCurrentPlayer(0);
    setLastDice(null);
    setGameMessage("");
    setGameOver(false);
    setWinner(null);
    setActiveQuestion(null);
    setPlayerNames(["", "", "", ""]);
  };

  // ── SVG Board ──────────────────────────────────────────────────────────────
  const CELL = 52;
  const BOARD = CELL * 10 + 8;

  const renderBoard = () => {
    const cells = [];
    for (let i = 1; i <= 100; i++) {
      const row = Math.floor((i - 1) / 10);
      const col = row % 2 === 0 ? (i - 1) % 10 : 9 - ((i - 1) % 10);
      const x = 4 + col * CELL;
      const y = 4 + (9 - row) * CELL;
      const isSnake = SNAKES[i] !== undefined;
      const isLadder = LADDERS[i] !== undefined;

      cells.push(
        <g key={i}>
          <rect x={x} y={y} width={CELL - 1} height={CELL - 1} rx={3}
            fill={isSnake ? "#fee2e2" : isLadder ? "#dcfce7" : i % 2 === 0 ? "#f8fafc" : "#f1f5f9"}
            stroke={isSnake ? "#fca5a5" : isLadder ? "#86efac" : "#e2e8f0"}
            strokeWidth={0.5} />
          <text x={x + 4} y={y + 12} fontSize={9} fill={isSnake ? "#ef4444" : isLadder ? "#22c55e" : "#94a3b8"} fontWeight="500">
            {i}
          </text>
          {isSnake && <text x={x + CELL / 2} y={y + CELL / 2 + 8} fontSize={18} textAnchor="middle" dominantBaseline="middle">🐍</text>}
          {isLadder && <text x={x + CELL / 2} y={y + CELL / 2 + 8} fontSize={18} textAnchor="middle" dominantBaseline="middle">🪜</text>}
        </g>
      );
    }

    // Snake lines
    const snakeLines = Object.entries(SNAKES).map(([from, to]) => {
      const f = cellToXY(+from);
      const t = cellToXY(+to);
      return <line key={`s${from}`} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />;
    });

    // Ladder lines
    const ladderLines = Object.entries(LADDERS).map(([from, to]) => {
      const f = cellToXY(+from);
      const t = cellToXY(+to);
      return <line key={`l${from}`} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#22c55e" strokeWidth={2.5} opacity={0.5} />;
    });

    // Player tokens
    const tokens = players.map((p, pi) => {
      if (p.pos === 0) return null;
      const { x, y } = cellToXY(p.pos);
      const offset = pi % 2 === 0 ? -8 : 8;
      return (
        <motion.g key={p.id} animate={{ cx: x + offset, cy: y + (pi < 2 ? -8 : 8) }}>
          <motion.circle
            cx={x + offset} cy={y + (pi < 2 ? -8 : 8)} r={10}
            fill={p.color} stroke="white" strokeWidth={2}
            animate={{ cx: x + offset, cy: y + (pi < 2 ? -8 : 8) }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
          <motion.text
            x={x + offset} y={y + (pi < 2 ? -8 : 8)}
            fontSize={8} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="bold"
            animate={{ x: x + offset, y: y + (pi < 2 ? -8 : 8) }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {pi + 1}
          </motion.text>
        </motion.g>
      );
    });

    return (
      <svg width={BOARD} height={BOARD} viewBox={`0 0 ${BOARD} ${BOARD}`} style={{ width: "100%", maxWidth: 540 }}>
        {cells}
        {snakeLines}
        {ladderLines}
        {tokens}
      </svg>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (questions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertCircle className="h-16 w-16 text-muted-foreground/20" />
      <p className="text-muted-foreground font-body">אין שאלות למשחק זה</p>
      <Button variant="outline" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4 mr-1" />חזור
      </Button>
    </div>
  );

  // ── SETUP SCREEN ───────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold">נחשים וסולמות 🐍🪜</h1>
            <p className="text-sm text-muted-foreground">{assignmentTitle} • {questions.length} שאלות</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <p className="font-heading font-medium text-sm mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />כמה שחקנים?
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button key={n} onClick={() => setPlayerCount(n)}
                    className={`flex-1 py-3 rounded-lg border-2 font-heading font-bold text-lg transition-all
                      ${playerCount === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: PLAYER_COLORS[i] }}>{i + 1}</div>
                  <Input
                    placeholder={`שם שחקן ${i + 1}${i === 0 ? " (אתה)" : ""}`}
                    value={playerNames[i]}
                    onChange={e => setPlayerNames(prev => prev.map((n, j) => j === i ? e.target.value : n))}
                    className="font-heading"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center pt-2">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-primary">{questions.length}</p>
                <p className="text-[10px] text-muted-foreground">שאלות</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{Object.keys(LADDERS).length}</p>
                <p className="text-[10px] text-muted-foreground">סולמות</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-2xl font-bold text-destructive">{Object.keys(SNAKES).length}</p>
                <p className="text-[10px] text-muted-foreground">נחשים</p>
              </div>
            </div>

            <Button size="lg" className="w-full gap-2 font-heading text-base" onClick={startGame}>
              <Dice5 className="h-5 w-5" />התחל משחק
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-heading font-medium mb-2">חוקי המשחק:</p>
            <ul className="text-xs text-muted-foreground space-y-1 font-body">
              <li>• כל משבצת 5→ שאלה. תשובה נכונה = ממשיך. שגויה = חזרה 5 משבצות</li>
              <li>• 🪜 סולם = שאלה. תשובה נכונה = עולה! שגויה = נשאר</li>
              <li>• 🐍 נחש = תמיד יורד, ללא שאלה</li>
              <li>• המגיע ראשון למשבצת 100 מנצח!</li>
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ── GAME OVER ──────────────────────────────────────────────────────────────
  if (gameOver && winner) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 max-w-md mx-auto text-center py-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
          <Crown className="h-24 w-24 mx-auto text-yellow-500" />
        </motion.div>
        <div>
          <p className="text-3xl font-heading font-bold">{winner.name} ניצח!</p>
          <p className="text-muted-foreground mt-1">
            {winner.score} תשובות נכונות מתוך {questions.length} שאלות
          </p>
        </div>
        <div className="space-y-2">
          {players.sort((a, b) => b.pos - a.pos).map((p, rank) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-muted-foreground text-sm">#{rank + 1}</span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.color }}>{p.id + 1}</div>
                <span className="font-heading text-sm">{p.name}</span>
              </div>
              <div className="text-left">
                <span className="font-heading font-bold text-sm">משבצת {p.pos}</span>
                <span className="text-xs text-muted-foreground block">{p.score} נכונות</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          <Button className="gap-2 font-heading" onClick={resetGame}>
            <RotateCcw className="h-4 w-4" />שחק שוב
          </Button>
          <Button variant="outline" className="font-heading" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-4 w-4 mr-1" />חזור
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── MAIN GAME ──────────────────────────────────────────────────────────────
  const cp = players[currentPlayer];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />יציאה
        </Button>
        <div className="flex items-center gap-2">
          {players.map(p => (
            <div key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-heading font-medium transition-all
              ${p.id === currentPlayer ? "ring-2 scale-105" : "opacity-60"}`}
              style={{ backgroundColor: p.color + "22", color: p.color, ringColor: p.color }}>
              <span>{p.emoji}</span>
              <span className="hidden sm:inline">{p.name}</span>
              <span className="font-bold">{p.pos}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-1">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-16 text-xs font-heading truncate" style={{ color: p.color }}>{p.name}</div>
            <Progress value={p.pos} className="flex-1 h-2" style={{ ["--progress-color" as any]: p.color }} />
            <span className="text-xs text-muted-foreground w-8 text-left">{p.pos}/100</span>
          </div>
        ))}
      </div>

      {/* Board */}
      <div className="flex justify-center overflow-x-auto">
        {renderBoard()}
      </div>

      {/* Game message */}
      <AnimatePresence mode="wait">
        {gameMessage && (
          <motion.div key={gameMessage} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/30">
              <CardContent className="py-2 text-center text-sm font-heading">{gameMessage}</CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dice / action area */}
      {!activeQuestion && !gameOver && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-sm text-muted-foreground font-body">
            תור של <span className="font-heading font-bold" style={{ color: cp?.color }}>{cp?.name}</span>
          </p>
          <motion.button
            className="w-20 h-20 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-1 font-heading font-bold text-2xl text-white cursor-pointer select-none"
            style={{ backgroundColor: cp?.color }}
            animate={diceAnim ? { rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.2, 0.9, 1.1, 1] } : {}}
            transition={{ duration: 0.5 }}
            onClick={rollDice}
            disabled={rolling}
          >
            {diceAnim ? "🎲" : lastDice !== null ? lastDice : <Dice5 className="h-10 w-10" />}
            {!diceAnim && <span className="text-xs font-normal opacity-80">זרוק</span>}
          </motion.button>
        </div>
      )}

      {/* Question Dialog */}
      <Dialog open={!!activeQuestion} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-base">
              ❓ שאלה — <span style={{ color: cp?.color }}>{cp?.name}</span>
            </DialogTitle>
          </DialogHeader>
          {activeQuestion && (
            <div className="space-y-4">
              <p className="font-heading font-medium text-sm leading-relaxed">{activeQuestion.question_text}</p>
              <div className="space-y-2">
                {activeQuestion.question_type === "true_false"
                  ? ["נכון", "לא נכון"].map(opt => renderAnswerBtn(opt, selectedAnswer, answerLocked, activeQuestion.correct_answer, handleAnswer))
                  : activeQuestion.options?.length > 0
                  ? activeQuestion.options.map(opt => renderAnswerBtn(opt, selectedAnswer, answerLocked, activeQuestion.correct_answer, handleAnswer))
                  : null
                }
              </div>
              {answerLocked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={answerCorrect ? "border-green-500/40 bg-green-50/50 dark:bg-green-900/10" : "border-red-400/40 bg-red-50/50 dark:bg-red-900/10"}>
                    <CardContent className="py-2.5">
                      <p className={`font-heading font-bold text-sm ${answerCorrect ? "text-green-700 dark:text-green-300" : "text-destructive"}`}>
                        {answerCorrect ? "✅ נכון! ממשיכים..." : `❌ שגוי — ${activeQuestion.correct_answer}`}
                      </p>
                      {activeQuestion.explanation && (
                        <p className="text-xs text-muted-foreground mt-1">{activeQuestion.explanation}</p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function renderAnswerBtn(
  opt: string, selected: string | null, locked: boolean,
  correct: string, onAnswer: (a: string) => void
) {
  const isSelected = selected === opt;
  const isCorrect = opt.trim().toLowerCase() === (correct || "").trim().toLowerCase();
  let cls = "w-full text-right p-3 rounded-lg border-2 text-sm font-heading transition-all";
  if (!locked) cls += " cursor-pointer hover:border-primary/50 border-border";
  else if (isCorrect) cls += " border-green-500 bg-green-50 dark:bg-green-900/20 cursor-default";
  else if (isSelected) cls += " border-destructive bg-red-50 dark:bg-red-900/20 cursor-default";
  else cls += " border-border opacity-40 cursor-default";

  return (
    <button key={opt} className={cls} onClick={() => !locked && onAnswer(opt)} disabled={locked}>
      <div className="flex items-center justify-between">
        <span>{opt}</span>
        {locked && isCorrect && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
        {locked && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
      </div>
    </button>
  );
}

export default SnakesLaddersGame;
