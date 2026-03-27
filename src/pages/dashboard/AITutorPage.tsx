import { useState, useRef, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Brain, Send, Sparkles, BookOpen, FileText, Calendar,
  Zap, Target, ChevronDown, ChevronUp, Loader2, Plus,
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

/* ─── Streaming Gemini chat - Final Stable Version ─── */
async function streamGeminiChat({
  messages, systemPrompt, onDelta, onDone, signal,
}: {
  messages: Msg[]; systemPrompt: string;
  onDelta: (t: string) => void; onDone: () => void; signal?: AbortSignal;
}) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY");

  // Models are strictly v1/gemini-1.5-flash now
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;

  // Combine instructions into a single clean prompt for maximum compatibility
  const userContent = messages[messages.length - 1].content;
  const combinedPrompt = `INSTRUCTIONS:\n${systemPrompt}\n\nSTUDENT MESSAGE:\n${userContent}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      }),
      signal,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Error ${resp.status}`);
    }

    if (!resp.body) throw new Error("No response body");
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onDelta(text);
        } catch (e) {}
      }
    }
    onDone();
  } catch (e: any) {
    if (e.name === 'AbortError') return;
    throw e;
  }
}

async function callGeminiJSON(systemPrompt: string, userPrompt: string) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `SYSTEM: ${systemPrompt}\n\nUSER: ${userPrompt}\n\nOUTPUT JSON ONLY.` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    })
  });
  
  if (!response.ok) throw new Error("Gemini JSON Error");
  const data = await response.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
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

  // Student stats
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
    if (scrollRef.current) {
       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load chat history
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
    setIsSidebarOpen(false);
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
שם התלמיד: ${profile.fullName}
${trackNames.length > 0 ? `מגמות: ${trackNames.join(", ")}` : ""}
ציונים: ${avgsStr || "(אין)"}
מיומנות חזקה: ${studentStats.strongSubject || "לא ידוע"}
שיפור נדרש: ${studentStats.weakSubject || "לא ידוע"}`;
    } else {
      studentContext = `שם התלמיד: ${profile.fullName}`;
    }

    return `אתה עוזר לימודי AI בשם "מנטור". הנחיות:
- ענה תמיד בעברית בלבד.
- עזור לתלמיד להגיע לתשובה בעצמו.
- השתמש בסיכומי נקודות (Markdown).
- השתמש באימוג'ים.
${studentContext}`;
  };

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    
    let currentSessionId = activeSessionId;
    if (!currentSessionId && isStudent) {
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
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { role: "assistant", content: soFar }];
        }
        return [...prev, { role: "assistant", content: soFar }];
      });
    };

    try {
      await streamGeminiChat({
        messages: newMessages,
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
      if (e.name !== "AbortError") {
        toast.error(e.message || "שגיאה בחיבור ל-AI");
        setMessages(prev => prev.slice(0, -1));
      }
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { 
      e.preventDefault(); 
      send(input); 
    }
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
    const planPrompt = `אני צריך תוכנית לימודים למבחן ב${examSubject} שמתקיים בעוד ${examDays} ימים.`;
    setShowExamPrep(false);
    send(planPrompt);
  };

  const generateQuestions = async () => {
    if (!genQSubject) return;
    setGenQLoading(true);
    setShowGenQ(false);
    try {
      const sp = `OUTPUT JSON ONLY. FORMAT: [{ "question_type": "multiple_choice", "question_text": "...", "options": ["..."], "correct_answer": "..." }]`;
      const res = await callGeminiJSON(sp, `צור ${genQCount} שאלות בנושא ${genQSubject}`);
      if (Array.isArray(res)) {
        setGeneratedQs(res);
        toast.success(`שאלות נוצרו בהצלחה!`);
      }
    } catch (e) { 
      toast.error("שגיאה ביצירת שאלות תרגול."); 
    } finally { 
      setGenQLoading(false); 
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto rounded-xl overflow-hidden bg-background shadow-2xl border">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 p-4 border-b shrink-0 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">מנטור-X</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Stable v1 | Gemini 1.5</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
             <SheetTrigger asChild>
               <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-heading rounded-lg">
                 היסטוריה
               </Button>
             </SheetTrigger>
             <SheetContent side="right" className="w-[85vw] max-w-sm p-4 flex flex-col gap-4">
               <SheetHeader>
                 <SheetTitle>היסטוריית שיחות</SheetTitle>
               </SheetHeader>
               <Button onClick={startNewChat} className="w-full gap-2 font-heading" variant="outline">שיחה חדשה</Button>
               <div className="flex-1 overflow-y-auto space-y-2">
                 {sessions.map(s => (
                   <button key={s.id} onClick={() => loadSession(s.id)} className={cn("w-full text-right p-3 rounded-lg text-sm border transition-all", activeSessionId === s.id ? "bg-indigo-600 text-white" : "hover:bg-muted")}>
                     {s.title}
                   </button>
                 ))}
               </div>
             </SheetContent>
           </Sheet>
        </div>
      </div>

      {/* Messaging area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 p-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl animate-bounce">
              <Brain className="h-10 w-10 text-white" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold mb-2 tracking-tight">היי {profile.fullName.split(" ")[0]}!</h2>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">במה אני יכול לעזור לך ללמוד היום?</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {QUICK_PROMPTS.map((qp) => (
                <button key={qp.label} onClick={() => send(qp.prompt)} className="p-4 rounded-2xl border bg-card hover:bg-muted transition-all text-center flex flex-col items-center gap-2">
                  <qp.icon className="h-5 w-5 text-indigo-500" />
                  <span className="text-xs font-bold">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <Card className={cn("max-w-[85%] px-4 py-3 text-sm rounded-2xl", msg.role === "user" ? "bg-indigo-600 text-white" : "bg-muted/50")}>
                <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="ghost" className="h-7 text-[10px] rounded-full gap-1" onClick={() => setShowExamPrep(true)}><Calendar className="h-3 w-3" /> תוכנית למבחן</Button>
          <Button size="sm" variant="ghost" className="h-7 text-[10px] rounded-full gap-1" onClick={() => setShowGenQ(true)}><Sparkles className="h-3 w-3" /> שאלות תרגול</Button>
        </div>
        <div className="flex gap-2 items-end relative">
          <Textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל אותי משהו..."
            className="resize-none min-h-[50px] max-h-[150px] rounded-2xl border-none bg-muted/50 pr-12"
            disabled={isLoading}
          />
          <Button size="icon" className="absolute left-2 bottom-1.5 h-8 w-8 rounded-xl bg-indigo-600" onClick={() => send(input)} disabled={!input.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showExamPrep} onOpenChange={setShowExamPrep}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle>תוכנית למבחן</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input placeholder="שם המקצוע..." value={examSubject} onChange={e => setExamSubject(e.target.value)} className="rounded-xl" />
            <Input type="number" value={examDays} onChange={e => setExamDays(e.target.value)} placeholder="ימים למבחן" className="rounded-xl" />
            <Button className="w-full rounded-xl bg-indigo-600" onClick={generateExamPlan}>צור תוכנית</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenQ} onOpenChange={setShowGenQ}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle>שאלות תרגול</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input placeholder="נושא השאלות..." value={genQSubject} onChange={e => setGenQSubject(e.target.value)} className="rounded-xl" />
            <Button className="w-full rounded-xl bg-indigo-600" onClick={generateQuestions} disabled={genQLoading}>צור שאלות</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AITutorPage;
