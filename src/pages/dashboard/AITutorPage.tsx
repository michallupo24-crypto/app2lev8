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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { UserProfile } from "@/hooks/useAuth";
import { useStudentSubjects } from "@/hooks/useStudentSubjects";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

/* ─── Streaming Gemini chat ─── */
async function streamGeminiChat({
  messages, systemPrompt, onDelta, onDone, signal,
}: {
  messages: Msg[]; systemPrompt: string;
  onDelta: (t: string) => void; onDone: () => void; signal?: AbortSignal;
}) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("חסר VITE_GEMINI_API_KEY בקובץ .env ! יש ליצור מפתח חינם של גוגל ולהגדירו.");

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
  
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 }
    }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "שגיאה בתקשורת מול גוגל" }));
    throw new Error(err.error?.message || `Error ${resp.status}`);
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
      if (json === "[DONE]" || !json) { if (json === "[DONE]") done = true; continue; }
      try {
        const p = JSON.parse(json);
        const c = p.candidates?.[0]?.content?.parts?.[0]?.text;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  
  if (buf.trim()) {
    for (const raw of buf.split("\n")) {
      if (!raw.startsWith("data: ")) continue;
      const json = raw.slice(6).trim();
      if (json === "[DONE]" || !json) continue;
      try { const p = JSON.parse(json); const c = p.candidates?.[0]?.content?.parts?.[0]?.text; if (c) onDelta(c); } catch {}
    }
  }
  onDone();
}

async function callGeminiJSON(systemPrompt: string, userPrompt: string) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("חסר מפתח AI");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  
  if (!response.ok) throw new Error("שגיאה מול שרת ה-AI של גוגל");
  const data = await response.json();
  const clean = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return JSON.parse(clean);
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

  // Chat History
  const [sessions, setSessions] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  // Load chat history (sessions)
  useEffect(() => {
    if (!isStudent || !profile.id) return;
    const fetchSessions = async () => {
      setHistoryLoading(true);
      const { data } = await supabase
        .from('ai_chat_sessions')
        .select('id, title, created_at')
        .eq('student_id', profile.id)
        .order('updated_at', { ascending: false });
      if (data) setSessions(data);
      setHistoryLoading(false);
    };
    fetchSessions();
  }, [profile.id, isStudent]);

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    setIsLoading(true);
    setIsSidebarOpen(false); // Close sidebar on mobile
    const { data } = await supabase
      .from('ai_chat_messages')
      .select('role, content')
      .eq('session_id', id)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data as Msg[]);
    }
    setIsLoading(false);
  };

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

  const getSystemPrompt = () => {
    let studentContext = "";
    if (isStudent && studentStats) {
      const avgsStr = Object.entries(studentStats.subjectAvgs).map(([s, a]) => `${s}: ${a}`).join(", ");
      studentContext = `
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile.fullName}
${trackNames.length > 0 ? `נמצא במגמות/הקבצות: ${trackNames.join(", ")}` : ""}
ציונים לפי מקצוע: ${avgsStr || "(אין)"}
מקצוע חזק: ${studentStats.strongSubject || "לא ידוע"}
מקצוע לשיפור: ${studentStats.weakSubject || "לא ידוע"}
`;
    } else if (isStudent) {
      studentContext = `
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile.fullName}
${trackNames.length > 0 ? `נמצא במגמות/הקבצות: ${trackNames.join(", ")}` : ""}
(עדיין אין ציונים כדי לחשב ממוצע)
`;
    }

    return `אתה עוזר לימודי AI בשם "מנטור" במערכת App2Class.
אתה מלמד תלמידים בבית ספר בישראל. בעל אופי ידידותי ומעודד.
${studentContext}

הנחיות:
- ענה תמיד בעברית, בשפה ברורה ומותאמת לגיל התלמיד.
- אם אתה יודע על ציוני התלמיד, התייחס לחוזקות וחולשות שלו באופן אישי.
- אל תיתן תשובות מלאות למטלות — הנח עם שאלות מנחות ורמזים.
- עודד חשיבה עצמאית. אם שואלים "מה התשובה?", אמור "בוא ננסה לחשוב יחד".
- השתמש באימוג'ים במידה.
- אם מבקשים סיכום, תן סיכום מובנה עם כותרות ונקודות.
- סיים תמיד בשאלה או הצעה להמשך חשיבה.`;
  };

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    
    let currentSessionId = activeSessionId;
    if (!currentSessionId && isStudent) {
      // Create new session
      const { data } = await supabase
        .from('ai_chat_sessions')
        .insert({ student_id: profile.id, title: text.slice(0, 30) + (text.length > 30 ? "..." : "") })
        .select('id').single();
      if (data) {
        currentSessionId = data.id;
        setActiveSessionId(data.id);
        setSessions(prev => [{ id: data.id, title: text.slice(0, 30) + (text.length > 30 ? "..." : ""), created_at: new Date().toISOString() }, ...prev]);
      }
    }

    if (currentSessionId && isStudent) {
      await supabase.from('ai_chat_messages').insert({ session_id: currentSessionId, role: "user", content: text.trim() });
    }

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
      await streamGeminiChat({
        messages: [...messages, userMsg],
        systemPrompt: getSystemPrompt(),
        onDelta: upsert,
        onDone: async () => {
          setIsLoading(false);
          if (currentSessionId && isStudent && soFar.trim()) {
            await supabase.from('ai_chat_messages').insert({
              session_id: currentSessionId,
              role: "assistant",
              content: soFar.trim()
            });
          }
        },
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message || "שגיאה בתקשורת מול גוגל");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
    setActiveSessionId(null);
    setIsSidebarOpen(false);
  };

  const generateExamPlan = async () => {
    if (!examSubject) return;
    setExamPrepLoading(true);
    setShowExamPrep(false);
    const userMsg = `צור לי תוכנית לימודים למבחן ב-${examSubject} שמתקיים בעוד ${examDays} ימים. 
    חלק את החומר לימים (30-45 דקות לימוד ביום), הצעות לתרגול וסיים ביום חזרה.`;
    
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    
    try {
       const systemInstruction = getSystemPrompt() + "\nאתה כעת במצב 'הכנה למבחן'. בנה את התוכנית המפורטת שביקש התלמיד עם כותרות ברורות.";
       await streamGeminiChat({
         messages: [{ role: "user", content: userMsg }],
         systemPrompt: systemInstruction,
         onDelta: () => {}, // Handled by stream
         onDone: () => {},  // Handled by stream
       });
       // Wait, we need to inject this seamlessly as a message instead of building a whole new stream handler.
       // Actually, we can just use send() dynamically!
       send(userMsg);
       setExamPrepLoading(false);
    } catch { 
       toast.error("שגיאה ביצירת תוכנית"); 
       setExamPrepLoading(false);
    }
  };

  const generateQuestions = async () => {
    if (!genQSubject) return;
    setGenQLoading(true);
    try {
      const sp = getSystemPrompt() + `\n
אתה במצב יצירת שאלות. 
החזר JSON בלבד (ללא markdown וללא מילת הפתיחה json) בצורה הזו מבנה של מערך:
[
  { "question_type": "multiple_choice", "question_text": "...", "options": ["א. x", "ב. y", "ג. z", "ד. w"], "correct_answer": "א. x" }
]
צור ${genQCount} שאלות ברמת קושי עולה בנושא: ${genQSubject}.`;
      
      const res = await callGeminiJSON(sp, `צור ${genQCount} שאלות נושא ${genQSubject}`);
      if (Array.isArray(res)) {
        setGeneratedQs(res);
        toast.success(`${res.length} שאלות נוצרו בהצלחה!`);
      } else {
        toast.error("לא ניתן ליצור שאלות כרגע");
      }
    } catch { toast.error("שגיאה ביצירת שאלות"); }
    finally { setGenQLoading(false); setShowGenQ(false); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">מנטור-X (Google Gemini)</h1>
            <p className="text-xs text-muted-foreground">עוזר לימודי אישי — מהיר וחופשי ממגבלות</p>
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
          {isStudent && (
             <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
               <SheetTrigger asChild>
                 <Button variant="outline" size="sm" className="gap-1 text-xs font-heading shadow-sm">
                   <Target className="h-3.5 w-3.5" /> היסטוריה
                 </Button>
               </SheetTrigger>
               <SheetContent side="right" className="w-[85vw] max-w-sm p-4 flex flex-col gap-4">
                 <SheetHeader>
                   <SheetTitle className="font-heading text-lg">היסטוריית שיחות</SheetTitle>
                 </SheetHeader>
                 <Button onClick={startNewChat} className="w-full gap-2 font-heading justify-start bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300" variant="ghost">
                   <Plus className="h-4 w-4" /> שיחה חדשה
                 </Button>
                 <div className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1">
                   {historyLoading ? (
                     <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                   ) : sessions.length === 0 ? (
                     <p className="text-sm text-muted-foreground text-center mt-4">אין שיחות קודמות</p>
                   ) : (
                     sessions.map(s => (
                       <button
                         key={s.id}
                         onClick={() => loadSession(s.id)}
                         className={cn(
                           "w-full text-right p-3 rounded-lg text-sm font-heading transition-colors border",
                           activeSessionId === s.id ? "bg-indigo-500 text-white border-indigo-600" : "bg-card border-border hover:bg-muted"
                         )}
                       >
                         <p className="truncate">{s.title}</p>
                         <p className={cn("text-[10px] mt-1 opacity-70", activeSessionId === s.id ? "text-indigo-100" : "text-muted-foreground")}>
                           {new Date(s.created_at).toLocaleDateString("he-IL")}
                         </p>
                       </button>
                     ))
                   )}
                 </div>
               </SheetContent>
             </Sheet>
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
          ) : studentStats && studentStats.totalGrades > 0 ? (
            <Card className="border-indigo-500/20 bg-indigo-500/5">
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
                 עדיין אין מספיק ציונים מוזנים כדי לחשב ממוצעים וחוזקות להציג ל-AI.
               </CardContent>
             </Card>
          )}
        </div>
      )}

      {/* Toolbar: Exam Prep + Generate Questions */}
      <div className="flex gap-2 mb-3 shrink-0 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600"
          onClick={() => setShowExamPrep(true)} disabled={examPrepLoading}>
          {examPrepLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
          הכנה למבחן
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 font-heading text-xs hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-purple-600"
          onClick={() => setShowGenQ(true)} disabled={genQLoading}>
          {genQLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          צור שאלות תרגול (Gemini)
        </Button>
      </div>

      {/* Generated questions panel */}
      {generatedQs.length > 0 && (
        <div className="shrink-0 mb-3 animate-in fade-in slide-in-from-top-4">
          <Card className="border-purple-500/30 bg-purple-50/50 dark:bg-purple-900/10 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center justify-between">
                <span className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <Zap className="h-4 w-4" />
                  {generatedQs.length} שאלות נוצרו עבורך (על בסיס גוגל AI)
                </span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setGeneratedQs([])}>נקה</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 max-h-60 overflow-y-auto">
              {generatedQs.map((q, i) => (
                <div key={i} className="p-3 bg-background/90 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm">
                  <p className="text-sm font-heading font-medium">{i + 1}. {q.question_text}</p>
                  {q.options?.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {q.options.map((o: string, j: number) => (
                        <div key={j} className={`text-xs p-2 rounded-md ${o === q.correct_answer ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold border border-green-200 dark:border-green-800" : "bg-muted/50 text-muted-foreground border border-transparent"}`}>
                          {o}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.correct_answer && q.options?.length === 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">תשובה נכונה: {q.correct_answer}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 scroll-smooth pr-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 flex items-center justify-center p-2">
              <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-6 transition-transform">
                <Brain className="h-10 w-10 text-white" />
              </div>
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold mb-2 tracking-tight">
                היי {profile.fullName.split(" ")[0]}! 👋
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto font-body leading-relaxed">
                אני מנטור-X, העוזר הלימודי האישי שלך המבוסס על המנוע החזק של גוגל. 
                {studentStats?.weakSubject
                  ? ` שמתי לב שאפשר במיוחד לעבוד קצת על הציונים ב-${studentStats.weakSubject} — רוצה לתרגל ביחד? 💪`
                  : " כאן כדי לעזור לך להבין חומר, להתכונן למבחנים ולהתקדם."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg mt-2">
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={qp.label} onClick={() => send(qp.prompt)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-indigo-100 hover:border-indigo-300 dark:border-indigo-900/50 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all text-center hover:-translate-y-1 shadow-sm hover:shadow-md animate-in slide-in-from-bottom-4" style={{animationDelay: \`\${i*100}ms\`}}>
                  <div className="p-2 rounded-full bg-indigo-50 dark:bg-indigo-900/50 group-hover:scale-110 transition-transform">
                     <qp.icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  </div>
                  <span className="text-sm font-heading font-medium">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3 animate-in fade-in slide-in-from-bottom-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <Brain className="h-4 w-4 text-white" />
                </div>
              )}
              <Card className={cn(
                "max-w-[85%] px-4 py-3 shadow-sm text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm"
                  : "bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-900/40 rounded-2xl rounded-tl-sm shadow-md"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 selection:bg-indigo-200 dark:selection:bg-indigo-800">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </Card>
            </div>
          ))
        )}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 animate-in fade-in">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
              <Brain className="h-4 w-4 text-white animate-pulse" />
            </div>
            <Card className="px-5 py-4 bg-white dark:bg-slate-900 rounded-2xl rounded-tl-sm border border-indigo-100 shadow-sm">
              <div className="flex gap-1.5 items-center h-full">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-indigo-100 dark:border-indigo-900/30 pt-4 pb-2 shrink-0 bg-background/80 backdrop-blur-sm">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="איך אוכל לעזור לך דולב? 💬"
            className="resize-none min-h-[50px] max-h-[120px] rounded-2xl text-sm border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500 shadow-sm"
            rows={1} disabled={isLoading}
          />
          <Button size="icon" className="rounded-2xl h-[50px] w-[50px] shrink-0 bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all active:scale-95"
            onClick={() => send(input)} disabled={!input.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-1" />}
          </Button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            מבוסס על Google Gemini API 
          </p>
          <p className="text-[10px] text-muted-foreground hidden sm:block">
            המנטור יכול לטעות — תמיד כדאי לבדוק מול החומר 📖
          </p>
        </div>
      </div>

    </div>
  );
};

export default AITutorPage;
