import { useState, useRef, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Brain, Send, Sparkles, BookOpen, FileText, Calendar,
  Trash2, Zap, Target, ChevronDown, ChevronUp, Loader2, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { UserProfile } from "@/hooks/useAuth";
import { useStudentSubjects } from "@/hooks/useStudentSubjects";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;

/* ─── Streaming chat ─── */
async function streamChat({
  messages, grade, subject, studentId, onDelta, onDone, signal,
}: {
  messages: Msg[]; grade?: string; subject?: string; studentId?: string;
  onDelta: (t: string) => void; onDone: () => void; signal?: AbortSignal;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, grade, subject, studentId, action: "chat" }),
    signal,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "שגיאה" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  if (!resp.body) throw new Error("No stream");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  while (!done) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content as string | undefined;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  if (buf.trim()) {
    for (const raw of buf.split("\n")) {
      if (!raw.startsWith("data: ")) continue;
      const json = raw.slice(6).trim();
      if (json === "[DONE]") continue;
      try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) onDelta(c); } catch {}
    }
  }
  onDone();
}

const QUICK_PROMPTS = [
  { label: "סכם שיעור", icon: FileText, prompt: "תסכם לי את הנושא האחרון שלמדנו בצורה מסודרת עם נקודות עיקריות" },
  { label: "תוכנית מבחן", icon: Calendar, prompt: "עזור לי לבנות תוכנית לימודים למבחן שיש לי בעוד שבוע" },
  { label: "הסבר מושג", icon: BookOpen, prompt: "הסבר לי בצורה פשוטה ועם דוגמאות מושג שאני לא מבין" },
  { label: "בדוק תשובה", icon: Sparkles, prompt: "אני רוצה שתבדוק לי תשובה שכתבתי" },
];

const AITutorPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const isStudent = profile.roles.includes("student");
  const { subjects: mySubjects, trackNames } = useStudentSubjects(
    isStudent ? profile.id : undefined,
    profile.schoolId
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Student stats (loaded on mount for personalisation)
  const [studentStats, setStudentStats] = useState<{
    strongSubject: string | null;
    weakSubject: string | null;
    totalGrades: number;
    subjectAvgs: Record<string, number>;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Exam prep mode
  const [showExamPrep, setShowExamPrep] = useState(false);
  const [examSubject, setExamSubject] = useState("");
  const [examDays, setExamDays] = useState("7");
  const [examPrepLoading, setExamPrepLoading] = useState(false);

  // Generate questions mode
  const [showGenQ, setShowGenQ] = useState(false);
  const [genQSubject, setGenQSubject] = useState("");
  const [genQCount, setGenQCount] = useState("5");
  const [genQLoading, setGenQLoading] = useState(false);
  const [generatedQs, setGeneratedQs] = useState<any[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Load student stats
  useEffect(() => {
    if (!isStudent || !profile.id) return;
    const load = async () => {
      setStatsLoading(true);
      const { data } = await supabase
        .from("submissions")
        .select("grade, assignments(subject, max_grade)")
        .eq("student_id", profile.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .limit(30);

      if (data && data.length > 0) {
        const bySubject = new Map<string, number[]>();
        data.forEach((s: any) => {
          const subj = s.assignments?.subject;
          const maxG = s.assignments?.max_grade || 100;
          if (!subj) return;
          const norm = Math.round((s.grade / maxG) * 100);
          const list = bySubject.get(subj) || [];
          list.push(norm);
          bySubject.set(subj, list);
        });
        const avgs: Record<string, number> = {};
        bySubject.forEach((gs, subj) => {
          avgs[subj] = Math.round(gs.reduce((a, b) => a + b, 0) / gs.length);
        });
        const sorted = Object.entries(avgs).sort((a, b) => b[1] - a[1]);
        setStudentStats({
          strongSubject: sorted[0]?.[0] || null,
          weakSubject: sorted[sorted.length - 1]?.[0] || null,
          totalGrades: data.length,
          subjectAvgs: avgs,
        });
      }
      setStatsLoading(false);
    };
    load();
  }, [profile.id, isStudent]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let soFar = "";
    const upsert = (chunk: string) => {
      soFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: soFar } : m);
        return [...prev, { role: "assistant", content: soFar }];
      });
    };
    try {
      const subjectCtx = trackNames.length > 0 ? `המגמות: ${trackNames.join(", ")}` : undefined;
      await streamChat({
        messages: [...messages, userMsg],
        grade: "תיכון",
        subject: subjectCtx,
        studentId: isStudent ? profile.id : undefined,
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message || "שגיאה");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
  };

  const generateExamPlan = async () => {
    if (!examSubject) return;
    setExamPrepLoading(true);
    setShowExamPrep(false);
    const userMsg: Msg = { role: "user", content: `צור לי תוכנית לימודים למבחן ב-${examSubject} בעוד ${examDays} ימים` };
    setMessages(prev => [...prev, userMsg]);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ action: "exam_prep", subject: examSubject, prompt: examDays, studentId: isStudent ? profile.id : undefined }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message || "לא ניתן ליצור תוכנית" }]);
    } catch { toast.error("שגיאה ביצירת תוכנית"); }
    finally { setExamPrepLoading(false); }
  };

  const generateQuestions = async () => {
    if (!genQSubject) return;
    setGenQLoading(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ action: "generate_questions", subject: genQSubject, numQuestions: parseInt(genQCount) }),
      });
      const data = await resp.json();
      if (Array.isArray(data.result)) {
        setGeneratedQs(data.result);
        toast.success(`${data.result.length} שאלות נוצרו!`);
      } else {
        toast.error("לא ניתן ליצור שאלות כרגע");
      }
    } catch { toast.error("שגיאה ביצירת שאלות"); }
    finally { setGenQLoading(false); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold">מנטור 🧠</h1>
            <p className="text-xs text-muted-foreground">עוזר לימודי אישי — שואל, מסכם, מתכנן</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isStudent && (
            <Button variant="ghost" size="sm" className="gap-1 text-xs font-heading"
              onClick={() => setShowStats(s => !s)}>
              <Target className="h-3.5 w-3.5" />
              {showStats ? "הסתר" : "הפרופיל שלי"}
              {showStats ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clearChat}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {/* Student stats panel */}
      {showStats && isStudent && (
        <div className="shrink-0 mb-3">
          {statsLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />טוען פרופיל...
            </div>
          ) : studentStats ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-3">
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <span className="font-heading font-medium">הפרופיל שלך:</span>
                  {studentStats.strongSubject && (
                    <Badge className="gap-1 bg-green-500/20 text-green-700 dark:text-green-400 border-0">
                      💪 חזק: {studentStats.strongSubject} ({studentStats.subjectAvgs[studentStats.strongSubject]}%)
                    </Badge>
                  )}
                  {studentStats.weakSubject && studentStats.weakSubject !== studentStats.strongSubject && (
                    <Badge className="gap-1 bg-orange-500/20 text-orange-700 dark:text-orange-400 border-0">
                      📈 לשיפור: {studentStats.weakSubject} ({studentStats.subjectAvgs[studentStats.weakSubject]}%)
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">{studentStats.totalGrades} ציונים מוזנים</Badge>
                </div>
                {Object.keys(studentStats.subjectAvgs).length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {Object.entries(studentStats.subjectAvgs).map(([subj, avg]) => (
                      <span key={subj} className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-0.5">
                        {subj}: {avg}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-3 text-center text-sm text-muted-foreground">
                עדיין אין ציונים מוזנים — הפרופיל יתמלא לאחר קבלת ציונים
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Toolbar: Exam Prep + Generate Questions */}
      <div className="flex gap-2 mb-3 shrink-0 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs"
          onClick={() => setShowExamPrep(true)} disabled={examPrepLoading}>
          {examPrepLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
          הכנה למבחן
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs"
          onClick={() => setShowGenQ(true)} disabled={genQLoading}>
          {genQLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          צור שאלות תרגול
        </Button>
      </div>

      {/* Generated questions panel */}
      {generatedQs.length > 0 && (
        <div className="shrink-0 mb-3">
          <Card className="border-purple-500/30 bg-purple-50/50 dark:bg-purple-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center justify-between">
                <span className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <Zap className="h-4 w-4" />
                  {generatedQs.length} שאלות נוצרו עבורך
                </span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setGeneratedQs([])}>נקה</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 max-h-60 overflow-y-auto">
              {generatedQs.map((q, i) => (
                <div key={i} className="p-2 bg-background/80 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-xs font-heading font-medium">{i + 1}. {q.question_text}</p>
                  {q.options?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {q.options.map((o: string, j: number) => (
                        <span key={j} className={`text-[10px] px-2 py-0.5 rounded ${o === q.correct_answer ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium" : "bg-muted/50 text-muted-foreground"}`}>
                          {o}
                        </span>
                      ))}
                    </div>
                  )}
                  {q.correct_answer && q.options?.length === 0 && (
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">✓ {q.correct_answer}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 scroll-smooth">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Brain className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold mb-1">
                היי {profile.fullName.split(" ")[0]}! 👋
              </h2>
              <p className="text-muted-foreground text-sm max-w-md font-body">
                אני מנטור, העוזר הלימודי האישי שלך.
                {studentStats?.weakSubject
                  ? ` שמתי לב שאתה יכול לשפר ב-${studentStats.weakSubject} — רוצה שנעבוד על זה ביחד? 💪`
                  : " כאן כדי לעזור לך להבין חומר, להתכונן למבחנים ולהתקדם."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              {QUICK_PROMPTS.map((qp) => (
                <button key={qp.label} onClick={() => send(qp.prompt)}
                  className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-right">
                  <qp.icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm font-heading">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 mt-1">
                  <Brain className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <Card className={cn(
                "max-w-[85%] px-4 py-3 shadow-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-md"
                  : "bg-card rounded-2xl rounded-tl-md"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </Card>
            </div>
          ))
        )}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <Brain className="h-4 w-4 text-primary-foreground animate-pulse" />
            </div>
            <Card className="px-4 py-3 bg-card rounded-2xl rounded-tl-md">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border pt-3 pb-2 shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל אותי משהו... 💬"
            className="resize-none min-h-[44px] max-h-[120px] rounded-xl text-sm"
            rows={1} disabled={isLoading}
          />
          <Button size="icon" className="rounded-xl h-11 w-11 shrink-0"
            onClick={() => send(input)} disabled={!input.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          מנטור יכול לטעות — תמיד כדאי לבדוק מול החומר 📖
        </p>
      </div>

      {/* Exam Prep Dialog */}
      <Dialog open={showExamPrep} onOpenChange={setShowExamPrep}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />הכנה למבחן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-heading">מקצוע</p>
              <Select value={examSubject} onValueChange={setExamSubject}>
                <SelectTrigger><SelectValue placeholder="בחר מקצוע" /></SelectTrigger>
                <SelectContent>
                  {(mySubjects.length > 0 ? mySubjects : ["מתמטיקה", "אנגלית", "עברית", "היסטוריה", "פיזיקה", "כימיה"]).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-heading">ימים עד המבחן</p>
              <Input type="number" value={examDays} onChange={e => setExamDays(e.target.value)}
                min="1" max="30" className="w-24" dir="ltr" />
            </div>
            <Button className="w-full font-heading" onClick={generateExamPlan} disabled={!examSubject}>
              <Calendar className="h-4 w-4 mr-2" />צור תוכנית לימודים
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Questions Dialog */}
      <Dialog open={showGenQ} onOpenChange={(o) => { if (!o) { setShowGenQ(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-500" />צור שאלות תרגול
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-heading">נושא / מקצוע</p>
              <Input placeholder="לדוגמה: משוואות ריבועיות, מלחמת העולם..."
                value={genQSubject} onChange={e => setGenQSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-heading">מספר שאלות</p>
              <div className="flex gap-2">
                {["3", "5", "10"].map(n => (
                  <button key={n}
                    className={`w-12 h-9 rounded-lg border font-heading text-sm transition-all ${genQCount === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    onClick={() => setGenQCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <Button className="w-full font-heading" onClick={() => { generateQuestions(); setShowGenQ(false); }} disabled={!genQSubject || genQLoading}>
              <Zap className="h-4 w-4 mr-2" />צור שאלות עם AI
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AITutorPage;
