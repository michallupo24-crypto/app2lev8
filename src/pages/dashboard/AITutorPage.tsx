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

/* ─── AI Diagnostics: Logs available models to console ─── */
const runAIDiagnostics = async (apiKey: string) => {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    const data = await resp.json();
    console.group("AI Diagnostics - Available Models");
    console.log("Check if your model is in this list:", data.models?.map((m: any) => m.name));
    console.groupEnd();
  } catch (e) {
    console.error("AI Diagnostics Failed:", e);
  }
};

/* ─── Streaming Gemini chat - Final Stable Version (March 2026) ─── */
async function streamGeminiChat({
  messages, systemPrompt, onDelta, onDone, signal,
}: {
  messages: Msg[]; systemPrompt: string;
  onDelta: (t: string) => void; onDone: () => void; signal?: AbortSignal;
}) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY");

  // In March 2026, 'gemini-1.5-flash' is the most stable free-tier model
  const modelId = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1/models/${modelId}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Stable system instruction format for Gemini 1.5+
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      }),
      signal,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP Error ${resp.status}`;
      console.error("Gemini API Error:", errData);
      throw new Error(msg);
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
        if (line.trim().startsWith("data: ")) {
          try {
            const data = JSON.parse(line.trim().slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onDelta(text);
          } catch (e) {}
        }
      }
    }
    onDone();
  } catch (e: any) {
    if (e.name === "AbortError") return;
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
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    })
  });
  
  if (!response.ok) throw new Error("AI JSON Error");
  const data = await response.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
}

const QUICK_PROMPTS = [
  { label: "סכם שיעור", icon: FileText, prompt: "תסכם לי את הנושא האחרון שלמדנו בצורה מסודרת" },
  { label: "תוכנית מבחן", icon: Calendar, prompt: "עזור לי לבנות תוכנית לימודים למבחן" },
  { label: "הסבר מושג", icon: BookOpen, prompt: "הסבר לי מושג שאני לא מבין" },
  { label: "בדוק תשובה", icon: Sparkles, prompt: "בדוק לי תשובה שכתבתי" },
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

  // Exam prep / Questions
  const [showExamPrep, setShowExamPrep] = useState(false);
  const [examSubject, setExamSubject] = useState("");
  const [examDays, setExamDays] = useState("7");
  const [showGenQ, setShowGenQ] = useState(false);
  const [genQSubject, setGenQSubject] = useState("");
  const [genQCount, setGenQCount] = useState("5");
  const [genQLoading, setGenQLoading] = useState(false);
  const [generatedQs, setGeneratedQs] = useState<any[]>([]);

  // Diagnostics Run
  useEffect(() => {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (key) runAIDiagnostics(key);
  }, []);

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
    if (data) setMessages(data as Msg[]);
    setIsLoading(false);
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
    setActiveSessionId(null);
    setIsSidebarOpen(false);
  };

  // Student stats loader (simplified)
  useEffect(() => {
    if (!isStudent || !profile.id) return;
    const load = async () => {
      setStatsLoading(true);
      const { data } = await supabase.from("submissions").select("grade, assignments(subject)").eq("student_id", profile.id).eq("status", "graded").limit(30);
      if (data && data.length > 0) {
        setStudentStats({ strongSubject: "מתמטיקה", weakSubject: "אנגלית", totalGrades: data.length, subjectAvgs: {} });
      }
      setStatsLoading(false);
    };
    load();
  }, [profile.id, isStudent]);

  const getSystemPrompt = () => {
    return `אתה מנטור X, עוזר לימודי אישי ב-App2Class. הנחיות:
- ענה בעברית בלבד.
- עזור לתלמיד להבין בעצמו (אל תגלה תשובות מיד).
- השתמש בסיכומי נקודות ואימוג'ים.
שם התלמיד: ${profile.fullName}`;
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
      const { data } = await supabase.from('ai_chat_sessions').insert({ student_id: profile.id, title: text.slice(0, 30) }).select('id').single();
      if (data) {
        currentSessionId = data.id;
        setActiveSessionId(data.id);
        setSessions(prev => [{ id: data.id, title: text.slice(0, 30), created_at: new Date().toISOString() }, ...prev]);
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let soFar = "";
    
    const upsert = (chunk: string) => {
      soFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: soFar }];
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
          if (currentSessionId && isStudent) {
            await supabase.from('ai_chat_messages').insert({ session_id: currentSessionId, role: "assistant", content: soFar });
          }
        },
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message || "שגיאה בחיבור ל-AI");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto rounded-3xl overflow-hidden bg-background border shadow-2xl relative">

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/40 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg animate-pulse">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">מנטור-X החדש</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-black">AI Tutor v3.0 | Stable</p>
          </div>
        </div>
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="sm">היסטוריה</Button></SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>שיחות אחרונות</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2">
              {sessions.map(s => <Button key={s.id} variant="ghost" className="w-full text-right justify-start" onClick={() => loadSession(s.id)}>{s.title}</Button>)}
              <Button onClick={startNewChat} className="w-full mt-4">שיחה חדשה</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center animate-in fade-in duration-700">
             <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl rotate-3">
                <Brain className="h-12 w-12 text-white" />
             </div>
             <div>
                <h2 className="font-heading text-2xl font-black mb-2 tracking-tight">היי {profile.fullName.split(" ")[0]}! 👋</h2>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">אני המנטור האישי שלך. מוכן ללמוד ביחד?</p>
             </div>
             <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-4">
                {QUICK_PROMPTS.map(qp => (
                   <button key={qp.label} onClick={() => send(qp.prompt)} className="p-4 rounded-3xl border bg-card hover:bg-indigo-50 transition-all text-center flex flex-col items-center gap-2 group shadow-sm">
                      <qp.icon className="h-5 w-5 text-indigo-500 group-hover:scale-125 transition-transform" />
                      <span className="text-xs font-bold">{qp.label}</span>
                   </button>
                ))}
             </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
               <Card className={cn("max-w-[85%] px-5 py-3 rounded-3xl shadow-sm leading-relaxed", msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-muted/30 rounded-tl-sm")}>
                  <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>
               </Card>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-background/80 backdrop-blur-sm border-t">
        <div className="flex gap-2 items-end relative">
          <Textarea 
            ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
            placeholder="איך אני יכול לעזור לך דולב? 😊" className="resize-none min-h-[60px] max-h-[150px] rounded-3xl bg-muted/30 border-none pr-14" disabled={isLoading}
          />
          <Button size="icon" className="absolute left-3 bottom-2.5 h-10 w-10 rounded-2xl bg-indigo-600 shadow-xl" onClick={() => send(input)} disabled={!input.trim() || isLoading}>
             {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AITutorPage;
