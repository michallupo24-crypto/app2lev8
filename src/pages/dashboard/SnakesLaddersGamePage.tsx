import { useState, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Dice5, Trophy, ChevronLeft, Users, Loader2, CheckCircle2, XCircle,
  Crown, PlayCircle, RotateCcw,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─── BOARD LAYOUT (10×10 = 100 cells) ─── */
const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

const PLAYER_COLORS = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b"];
const PLAYER_EMOJI = ["🟣", "🔴", "🟢", "🟡"];

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points: number;
}

interface Player {
  id: string;
  name: string;
  pos: number;
  score: number;
  color: string;
  emoji: string;
}

/* ─── Compute cell number from row/col in S-snake order ─── */
function cellNum(row: number, col: number): number {
  // row 0 = bottom, row 9 = top
  const r = 9 - row;
  if (r % 2 === 0) return r * 10 + col + 1;          // left→right
  return r * 10 + (9 - col) + 1;                      // right→left
}

const SnakesLaddersGamePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Setup ── */
  const [playerNames, setPlayerNames] = useState(["שחקן 1", "שחקן 2"]);
  const [numPlayers, setNumPlayers] = useState(2);
  const [gameStarted, setGameStarted] = useState(false);

  /* ── Game state ── */
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [movingTo, setMovingTo] = useState<number | null>(null);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [showQ, setShowQ] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [winner, setWinner] = useState<Player | null>(null);
  const [usedQIds, setUsedQIds] = useState<Set<string>>(new Set());
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!assignmentId) return;
      setLoading(true);
      const [aRes, qRes] = await Promise.all([
        supabase.from("assignments").select("id,title,subject").eq("id", assignmentId).single(),
        supabase.from("task_questions").select("*").eq("assignment_id", assignmentId).order("order_num"),
      ]);
      setAssignment(aRes.data);
      setQuestions(qRes.data || []);
      setLoading(false);
    };
    load();
  }, [assignmentId]);

  /* ─── Start game ─── */
  const startGame = () => {
    const ps: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
      id: `p${i}`,
      name: playerNames[i] || `שחקן ${i + 1}`,
      pos: 0,
      score: 0,
      color: PLAYER_COLORS[i],
      emoji: PLAYER_EMOJI[i],
    }));
    setPlayers(ps);
    setCurrentPlayer(0);
    setDiceValue(null);
    setMessage("");
    setWinner(null);
    setUsedQIds(new Set());
    setCorrectCount(0);
    setTotalAnswered(0);
    setGameStarted(true);
  };

  /* ─── Get next question (avoid repeats) ─── */
  const pickQuestion = useCallback(() => {
    const available = questions.filter(q => !usedQIds.has(q.id));
    if (available.length === 0) {
      // Reset used when all exhausted
      setUsedQIds(new Set());
      return questions[Math.floor(Math.random() * questions.length)] || null;
    }
    return available[Math.floor(Math.random() * available.length)];
  }, [questions, usedQIds]);

  /* ─── Roll dice ─── */
  const rollDice = async () => {
    if (rolling || showQ || winner) return;
    setRolling(true);
    setMessage("");

    // Dice animation
    let flickers = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      if (++flickers >= 8) clearInterval(interval);
    }, 80);

    await new Promise(r => setTimeout(r, 700));
    const roll = Math.floor(Math.random() * 6) + 1;
    setDiceValue(roll);
    setRolling(false);

    const cp = players[currentPlayer];
    let newPos = cp.pos + roll;

    if (newPos > 100) {
      newPos = cp.pos; // bounce back
      setMessage(`${cp.emoji} ${cp.name} צריך בדיוק ${100 - cp.pos} — חוזר`);
      advanceTurn();
      return;
    }

    setMovingTo(newPos);
    await new Promise(r => setTimeout(r, 500));

    // Snake?
    if (SNAKES[newPos] !== undefined) {
      const dest = SNAKES[newPos];
      setMessage(`🐍 נחש! ${cp.emoji} ירד מ-${newPos} ל-${dest}`);
      updatePlayerPos(currentPlayer, dest);
      setMovingTo(null);
      // Snake = mandatory question (wrong answer means stay, right = no penalty)
      if (questions.length > 0) {
        const q = pickQuestion();
        if (q) { setCurrentQ(q); setShowQ(true); setSelectedOpt(null); setAnswered(false); }
        else advanceTurn();
      } else advanceTurn();
      return;
    }

    // Ladder?
    if (LADDERS[newPos] !== undefined) {
      const dest = LADDERS[newPos];
      setMessage(`🪜 סולם! ${cp.emoji} עלה מ-${newPos} ל-${dest}`);
      updatePlayerPos(currentPlayer, dest);
      setMovingTo(null);
      // Ladder = bonus question (right = keep, wrong = go back to pre-ladder)
      if (questions.length > 0) {
        const q = pickQuestion();
        if (q) {
          setCurrentQ({ ...q, explanation: `[סולם מ-${newPos} ל-${dest}]` });
          setShowQ(true); setSelectedOpt(null); setAnswered(false);
        } else advanceTurn();
      } else {
        if (dest >= 100) { setWinner({ ...cp, pos: dest }); saveScore(dest); }
        else advanceTurn();
      }
      return;
    }

    // Regular cell — every 5th cell = question
    updatePlayerPos(currentPlayer, newPos);
    setMovingTo(null);

    if (newPos >= 100) { setWinner({ ...cp, pos: 100 }); saveScore(100); return; }

    if (newPos % 5 === 0 && questions.length > 0) {
      const q = pickQuestion();
      if (q) { setCurrentQ(q); setShowQ(true); setSelectedOpt(null); setAnswered(false); return; }
    }
    advanceTurn();
  };

  const updatePlayerPos = (idx: number, pos: number) => {
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, pos } : p));
  };

  const advanceTurn = () => {
    setCurrentPlayer(prev => (prev + 1) % numPlayers);
    setMessage("");
  };

  /* ─── Answer question ─── */
  const handleAnswer = (opt: string) => {
    if (answered || !currentQ) return;
    setSelectedOpt(opt);
    setAnswered(true);
    const isCorrect = opt.trim().toLowerCase() === (currentQ.correct_answer || "").trim().toLowerCase();
    setCorrect(isCorrect);
    setTotalAnswered(n => n + 1);
    if (isCorrect) {
      setCorrectCount(n => n + 1);
      setUsedQIds(prev => new Set([...prev, currentQ.id]));
      setPlayers(prev => prev.map((p, i) => i === currentPlayer ? { ...p, score: p.score + 1 } : p));
    } else {
      // Wrong: for snake cell, extra -2 penalty
      const cp = players[currentPlayer];
      if (currentQ.explanation?.startsWith("[סולם")) {
        // Was on ladder — go back to pre-ladder pos
        const m = currentQ.explanation.match(/\[סולם מ-(\d+)/);
        if (m) {
          const preLadder = parseInt(m[1]);
          updatePlayerPos(currentPlayer, preLadder);
        }
      } else {
        const penalty = Math.min(3, cp.pos);
        if (penalty > 0) {
          updatePlayerPos(currentPlayer, Math.max(0, cp.pos - penalty));
          setMessage(`❌ תשובה שגויה — ${cp.emoji} ירד ${penalty} משבצות`);
        }
      }
    }
  };

  const closeQuestion = () => {
    setShowQ(false);
    setCurrentQ(null);
    setSelectedOpt(null);
    setAnswered(false);
    // Check winner
    const cp = players[currentPlayer];
    if (cp?.pos >= 100) { setWinner(cp); saveScore(100); }
    else advanceTurn();
  };

  /* ─── Save score ─── */
  const saveScore = async (finalPos: number) => {
    if (!assignmentId) return;
    const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    // Save detailed game result in content field for teacher to see
    const gameResult = JSON.stringify({
      type: "snakes-ladders",
      score: pct,
      correctAnswers: correctCount,
      totalAnswers: totalAnswered,
      finalPosition: finalPos,
      playerName: players[0]?.name || profile.fullName,
      completedAt: new Date().toISOString(),
    });
    try {
      const { data: ex } = await supabase.from("submissions").select("id")
        .eq("assignment_id", assignmentId).eq("student_id", profile.id).maybeSingle();
      if (ex) {
        await supabase.from("submissions").update({
          grade: pct,
          status: "submitted" as any,
          submitted_at: new Date().toISOString(),
          content: gameResult,
        }).eq("id", ex.id);
      } else {
        await supabase.from("submissions").insert({
          assignment_id: assignmentId, student_id: profile.id,
          grade: pct, status: "submitted" as any,
          submitted_at: new Date().toISOString(),
          content: gameResult,
        });
      }
    } catch { /* best effort */ }
  };

  /* ─── Render board ─── */
  const renderBoard = () => {
    const cells = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const num = cellNum(row, col);
        const isSnake = SNAKES[num] !== undefined;
        const isLadder = LADDERS[num] !== undefined;
        const playersHere = players.filter(p => p.pos === num);
        const isTarget = movingTo === num;

        cells.push(
          <div key={num}
            className={`relative flex flex-col items-center justify-center border text-center select-none
              ${isSnake ? "bg-red-100 dark:bg-red-900/30 border-red-300" : ""}
              ${isLadder ? "bg-green-100 dark:bg-green-900/30 border-green-300" : ""}
              ${!isSnake && !isLadder ? "bg-muted/30 border-border/30" : ""}
              ${isTarget ? "ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/30" : ""}
              rounded-sm`}
            style={{ aspectRatio: "1" }}
          >
            <span className="text-[7px] sm:text-[9px] text-muted-foreground leading-none">{num}</span>
            {isSnake && <span className="text-[10px] leading-none">🐍</span>}
            {isLadder && <span className="text-[10px] leading-none">🪜</span>}
            {num === 100 && <span className="text-[10px] leading-none">🏁</span>}
            {playersHere.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  className="text-[11px] sm:text-sm leading-none"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.4 }}
                >
                  {playersHere.map(p => p.emoji).join("")}
                </motion.span>
              </div>
            )}
          </div>
        );
      }
    }
    return cells;
  };

  /* ─── DICE FACE ─── */
  const DICE_DOTS: Record<number, number[][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  };

  const DiceFace = ({ value }: { value: number }) => (
    <svg viewBox="0 0 100 100" className="w-12 h-12 sm:w-16 sm:h-16">
      <rect x="4" y="4" width="92" height="92" rx="14" fill="white" stroke="#cbd5e1" strokeWidth="3" />
      {(DICE_DOTS[value] || []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill="#1e293b" />
      ))}
    </svg>
  );

  /* ════════════════════════════════════════════════
     LOADING
  ════════════════════════════════════════════════ */
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (questions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Dice5 className="h-16 w-16 text-muted-foreground/20" />
      <p className="text-muted-foreground">אין שאלות במשימה זו</p>
      <Button variant="outline" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4 mr-1" />חזור
      </Button>
    </div>
  );

  /* ════════════════════════════════════════════════
     WINNER SCREEN
  ════════════════════════════════════════════════ */
  if (winner) {
    const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}>
          <Crown className="h-24 w-24 text-yellow-500" />
        </motion.div>
        <div>
          <p className="text-4xl font-heading font-bold">{winner.emoji} {winner.name}</p>
          <p className="text-lg text-muted-foreground mt-2">הגיע/ה ראשון/ה לתיבה 100! 🎉</p>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-3xl font-heading font-bold text-primary">{pct}%</p>
            <p className="text-xs text-muted-foreground">דיוק תשובות</p>
          </div>
          <div>
            <p className="text-3xl font-heading font-bold text-green-500">{correctCount}</p>
            <p className="text-xs text-muted-foreground">נכונות מ-{totalAnswered}</p>
          </div>
        </div>
        {/* Leaderboard */}
        <div className="w-full max-w-xs space-y-2">
          {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <span className="font-heading text-sm">{["🥇", "🥈", "🥉"][i] || "  "} {p.emoji} {p.name}</span>
              <Badge variant="outline">{p.score} נק'</Badge>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 font-heading" onClick={startGame}>
            <RotateCcw className="h-4 w-4" />שחק שוב
          </Button>
          <Button variant="outline" className="gap-2 font-heading" onClick={() => navigate("/dashboard/tasks")}>
            <ChevronLeft className="h-4 w-4" />חזור למשימות
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">הציון נשמר אוטומטית ({pct}%)</p>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════
     SETUP SCREEN
  ════════════════════════════════════════════════ */
  if (!gameStarted) return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-heading font-bold flex items-center gap-2">
            <Dice5 className="h-6 w-6 text-primary" />נחשים וסולמות
          </h1>
          <p className="text-sm text-muted-foreground">{assignment?.title} • {questions.length} שאלות</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <p className="text-sm font-heading font-medium mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />מספר שחקנים
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(n => (
                <button key={n}
                  className={`w-10 h-10 rounded-full font-heading font-bold text-sm transition-all border-2
                    ${numPlayers === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                  onClick={() => setNumPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: numPlayers }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xl">{PLAYER_EMOJI[i]}</span>
                <Input
                  value={playerNames[i] || ""}
                  onChange={e => setPlayerNames(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  placeholder={`שם שחקן ${i + 1}`}
                  className="font-heading text-sm"
                  style={{ borderColor: PLAYER_COLORS[i] + "60" }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mini board preview */}
      <Card>
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground font-heading mb-2 text-center">תצוגת הלוח</p>
          <div className="grid grid-cols-10 gap-px">
            {Array.from({ length: 100 }, (_, i) => {
              const n = i + 1;
              return (
                <div key={n} className={`aspect-square rounded-[2px] flex items-center justify-center text-[5px]
                  ${SNAKES[n] ? "bg-red-200 dark:bg-red-900/40" : LADDERS[n] ? "bg-green-200 dark:bg-green-900/40" : n === 100 ? "bg-yellow-200" : "bg-muted/40"}`}>
                  {SNAKES[n] ? "🐍" : LADDERS[n] ? "🪜" : n === 100 ? "🏁" : ""}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 justify-center mt-2 text-[10px] text-muted-foreground">
            <span>🐍 {Object.keys(SNAKES).length} נחשים</span>
            <span>🪜 {Object.keys(LADDERS).length} סולמות</span>
            <span>❓ {questions.length} שאלות</span>
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full gap-3 font-heading" onClick={startGame}>
        <PlayCircle className="h-5 w-5" />התחל משחק
      </Button>
    </motion.div>
  );

  /* ════════════════════════════════════════════════
     GAME SCREEN
  ════════════════════════════════════════════════ */
  const cp = players[currentPlayer];

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => { if (confirm("לצאת מהמשחק?")) navigate("/dashboard/tasks"); }}>
          <ChevronLeft className="h-4 w-4 mr-1" />יציאה
        </Button>
        <div className="flex items-center gap-2">
          {players.map(p => (
            <Badge key={p.id} variant={p.id === cp?.id ? "default" : "outline"}
              className="gap-1 text-xs transition-all" style={p.id === cp?.id ? { background: p.color } : {}}>
              {p.emoji} {p.pos}
            </Badge>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-10 gap-px bg-border/30 rounded-xl overflow-hidden border">
        {renderBoard()}
      </div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div key={message} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-2 text-center text-sm font-heading">{message}</CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current player + dice */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-heading">תור של</p>
              <p className="text-lg font-heading font-bold flex items-center gap-2">
                <span style={{ color: cp?.color }}>{cp?.emoji}</span> {cp?.name}
              </p>
              <p className="text-xs text-muted-foreground">תיבה {cp?.pos} / 100</p>
              <Progress value={cp?.pos || 0} className="h-1.5 mt-1 w-32" />
            </div>

            <div className="flex flex-col items-center gap-2">
              {diceValue ? (
                <motion.div animate={{ rotate: rolling ? [0, 15, -15, 0] : 0 }} transition={{ duration: 0.1, repeat: rolling ? Infinity : 0 }}>
                  <DiceFace value={diceValue} />
                </motion.div>
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center">
                  <Dice5 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <Button
                className="gap-2 font-heading"
                onClick={rollDice}
                disabled={rolling || showQ || !!winner}
                style={{ background: cp?.color }}
              >
                {rolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dice5 className="h-4 w-4" />}
                {rolling ? "מטיל..." : "זרוק"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {players.map(p => (
          <Card key={p.id} className={`transition-all ${p.id === cp?.id ? "ring-1" : ""}`}
            style={p.id === cp?.id ? { "--tw-ring-color": p.color } as any : {}}>
            <CardContent className="py-2 text-center">
              <p className="text-lg">{p.emoji}</p>
              <p className="text-xs font-heading truncate">{p.name}</p>
              <p className="text-sm font-bold" style={{ color: p.color }}>{p.score} נק'</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Question dialog */}
      <Dialog open={showQ} onOpenChange={() => { }}>
        <DialogContent className="max-w-md" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              ❓ שאלה עבור {cp?.emoji} {cp?.name}
            </DialogTitle>
          </DialogHeader>
          {currentQ && (
            <div className="space-y-4">
              <p className="font-heading font-bold text-base leading-relaxed">{currentQ.question_text}</p>

              {(currentQ.question_type === "multiple_choice" || currentQ.question_type === "true_false") && (
                <div className="space-y-2">
                  {(currentQ.question_type === "true_false"
                    ? ["נכון", "לא נכון"]
                    : (currentQ.options || [])
                  ).map((opt, i) => {
                    const isSelected = selectedOpt === opt;
                    const isCorrectOpt = opt.trim().toLowerCase() === (currentQ.correct_answer || "").trim().toLowerCase();
                    let cls = "border-border hover:border-primary/50 cursor-pointer";
                    if (answered) {
                      if (isCorrectOpt) cls = "border-green-500 bg-green-50 dark:bg-green-900/20 cursor-default";
                      else if (isSelected) cls = "border-destructive bg-red-50 dark:bg-red-900/20 cursor-default";
                      else cls = "border-border opacity-40 cursor-default";
                    } else if (isSelected) cls = "border-primary bg-primary/5";
                    return (
                      <button key={i}
                        className={`w-full text-right p-3 rounded-lg border transition-all ${cls}`}
                        onClick={() => handleAnswer(opt)} disabled={answered}>
                        <div className="flex items-center justify-between">
                          <span className="font-heading text-sm">{opt}</span>
                          {answered && isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          {answered && isSelected && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {(currentQ.question_type === "open" || currentQ.question_type === "fill_blank") && (
                <div className="space-y-2">
                  {!answered ? (
                    <>
                      <Input placeholder="כתב תשובה..." value={selectedOpt || ""}
                        onChange={e => setSelectedOpt(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && selectedOpt) handleAnswer(selectedOpt); }}
                        className="font-heading" autoFocus />
                      <Button className="w-full font-heading" onClick={() => selectedOpt && handleAnswer(selectedOpt)} disabled={!selectedOpt}>
                        בדוק
                      </Button>
                    </>
                  ) : (
                    <Card className={correct ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-destructive bg-red-50 dark:bg-red-900/10"}>
                      <CardContent className="py-3 text-sm font-heading">
                        {correct ? "✅ נכון!" : `❌ תשובה נכונה: ${currentQ.correct_answer}`}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {answered && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  {currentQ.explanation && !currentQ.explanation.startsWith("[סולם") && (
                    <p className="text-xs text-muted-foreground font-body bg-muted/50 rounded-lg p-2">{currentQ.explanation}</p>
                  )}
                  <Button className="w-full font-heading" onClick={closeQuestion}>
                    {correct ? "✅ המשך" : "❌ המשך"}
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SnakesLaddersGamePage;
