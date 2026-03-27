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

/* ─── Streaming Gemini chat with Fallback ─── */
const GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp'
];

async function streamGeminiChat({
  messages, systemPrompt, onDelta, onDone, signal,
}: {
  messages: Msg[]; systemPrompt: string;
  onDelta: (t: string) => void; onDone: () => void; signal?: AbortSignal;
}) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error("חסר VITE_GEMINI_API_KEY בקובץ .env");
  }

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  let lastError = null;

  for (const modelId of GEMINI_MODELS) {
    try {
      console.log(`Trying model: ${modelId}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
      
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        }),
        signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const msg = errData.error?.message || `Error ${resp.status}`;
        console.warn(`Model ${modelId} failed: ${msg}`);
        lastError = new Error(msg);
        continue;
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
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onDelta(text);
          } catch (e) {}
        }
      }
      onDone();
      return;
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      lastError = e;
    }
  }
  throw lastError || new Error("כל מודלי ה-AI נכשלו. בדוק חיבור אינטרנט או מפתח API.");
}

async function callGeminiJSON(systemPrompt: string, userPrompt: string) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("חסר מפתח AI");

  let lastError = null;
  for (const modelId of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        lastError = new Error(errData.error?.message || "API Error");
        continue;
      }
      const data = await response.json();
      const clean = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      return JSON.parse(clean);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
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
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile.fullName}
${trackNames.length > 0 ? `נמצא במגמות/הקבצות: ${trackNames.join(", ")}` : ""}
ציונים לפי מקצוע: ${avgsStr || "(אין)"}
מקצוע חזק: ${studentStats.strongSubject || "לא ידוע"}
מקצוע לשיפור: ${studentStats.weakSubject || "לא ידוע"}
`;
    } else {
      studentContext = `
[פרופיל אישי וחינוכי]
שם התלמיד: ${profile.fullName}
${isStudent && trackNames.length > 0 ? `נמצא במגמות: ${trackNames.join(", ")}` : ""}
`;
    }

    return `אתה עוזר לימודי AI בשם "מנטור" במערכת App2Class.
אתה מלמד תלמידים בבית ספר בישראל. דמות של מורה ידידותי, מעודד וסבלני.
${studentContext}

הנחיות חשובות:
- ענה תמיד בעברית בלבד.
- אל תיתן את התשובה הסופית מיד. במקום זאת, השתמש בשאלות מנחות ורמזים כדי לעודד את התלמיד לחשוב.
- אם מבקשים סיכום, ספק סיכום מובנה בנקודות (Markdown).
- השתמש באימוג'ים כדי להפוך את השיחה לידידותית.
- סיים כל הודעה בשאלה שמעודדת את התלמיד להמשיך לחקור או לפתור.`;
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
        toast.error(e.message || "שגיאה בחיבור ל-AI של גוגל");
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
    const planPrompt = `אני צריך תוכנית לימודים למבחן ב${examSubject} שמתקיים בעוד ${examDays} ימים. 
    אנא בנה תוכנית יומית מפורטת הכוללת נושאי לימוד, זמן מוערך לכל יום (עד 45 דק') והצעות לתרגול.`;
    setShowExamPrep(false);
    send(planPrompt);
  };

  const generateQuestions = async () => {
    if (!genQSubject) return;
    setGenQLoading(true);
    setShowGenQ(false);
    try {
      const sp = getSystemPrompt() + `\n
[מצב יצירת שאלות] 
אנא החזר פלט JSON תקין בלבד (מערך של אובייקטים) מבלי להוסיף טקסט מקדים או סוגר. 
פורמט: [{ "question_type": "multiple_choice", "question_text": "...", "options": ["א. x", "ב. y", "ג. z", "ד. w"], "correct_answer": "א. x" }]
צור ${genQCount} שאלות בנושא: ${genQSubject}.`;
      
      const res = await callGeminiJSON(sp, `צור ${genQCount} שאלות נושא ${genQSubject}`);
      if (Array.isArray(res)) {
        setGeneratedQs(res);
        toast.success(`${res.length} שאלות נוצרו בהצלחה!`);
      } else {
        toast.error("לא ניתן היה לעבד את השאלות שנוצרו.");
      }
    } catch (e) { 
      console.error(e);
      toast.error("שגיאה ביצירת שאלות תרגול."); 
    } finally { 
      setGenQLoading(false); 
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto rounded-xl overflow-hidden bg-background">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 p-2 border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">מנטור-X (Google Gemini)</h1>
            <p className="text-[10px] text-muted-foreground">עוזר לימודי אישי — מהיר וחופשי ממגבלות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isStudent && (
             <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
               <SheetTrigger asChild>
                 <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-heading">
                   <Plus className="h-3 w-3" /> היסטוריה
                 </Button>
               </SheetTrigger>
               <SheetContent side="right" className="w-[85vw] max-w-sm p-4 flex flex-col gap-4">
                 <SheetHeader>
                   <SheetTitle className="font-heading text-lg">היסטוריית שיחות</SheetTitle>
                 </SheetHeader>
                 <Button onClick={startNewChat} className="w-full gap-2 font-heading justify-start bg-indigo-50 text-indigo-700 hover:bg-indigo-100" variant="ghost">
                   <Plus className="h-4 w-4" /> שיחה חדשה
                 </Button>
                 <div className="flex-1 overflow-y-auto space-y-2 mt-2">
                   {historyLoading ? (
                     <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                   ) : sessions.length === 0 ? (
                     <p className="text-sm text-muted-foreground text-center mt-4">אין שיחות קודמות</p>
                   ) : (
                     sessions.map(s => (
                       <button
                         key={s.id} onClick={() => loadSession(s.id)}
                         className={cn(
                           "w-full text-right p-3 rounded-lg text-sm font-heading transition-colors border",
                           activeSessionId === s.id ? "bg-indigo-500 text-white border-indigo-600" : "bg-card hover:bg-muted"
                         )}
                       >
                         <p className="truncate">{s.title}</p>
                         <p className="text-[10px] mt-1 opacity-70">
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

      {/* Messaging area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 p-4 scroll-smooth">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl">
              <Brain className="h-10 w-10 text-white" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold mb-2 tracking-tight">
                היי {profile.fullName.split(" ")[0]}! 👋
              </h2>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
                אני המנטור האישי שלך. אני כאן כדי לעזור לך להבין כל חומר לימודי בצורה קלה ומהנה.
              </p>
              {studentStats?.weakSubject && (
                <Badge variant="outline" className="mt-4 bg-amber-50 text-amber-700 border-amber-200">
                  ⚠️ שמתי לב שאפשר לחזק את הציונים ב{studentStats.weakSubject}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-4">
              {QUICK_PROMPTS.map((qp) => (
                <button key={qp.label} onClick={() => send(qp.prompt)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border bg-card hover:bg-indigo-50 hover:border-indigo-200 transition-all text-center group shadow-sm">
                  <qp.icon className="h-5 w-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-heading font-medium">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row animate-in slide-in-from-left-2 duration-300")}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <Brain className="h-4 w-4 text-white" />
                </div>
              )}
              <Card className={cn(
                "max-w-[85%] px-4 py-3 shadow-sm text-sm border-none leading-relaxed",
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm"
                  : "bg-muted/30 rounded-2xl rounded-tl-sm"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
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
          <div className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Brain className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="px-5 py-3 bg-muted/20 rounded-2xl rounded-tl-sm flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{animationDelay: "0ms"}} />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{animationDelay: "200ms"}} />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{animationDelay: "400ms"}} />
            </div>
          </div>
        )}
      </div>

      {/* Generated questions */}
      {generatedQs.length > 0 && (
         <div className="px-4 pb-2">
            <Card className="border-indigo-100 bg-indigo-50/30 overflow-hidden">
               <div className="p-2 bg-indigo-100/50 flex justify-between items-center">
                  <span className="text-xs font-bold text-indigo-700 flex items-center gap-1"><Zap className="h-3 w-3" /> שאלות תרגול שנוצרו עבורך</span>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setGeneratedQs([])}>סגור</Button>
               </div>
               <div className="p-3 max-h-48 overflow-y-auto space-y-3">
                  {generatedQs.map((q, idx) => (
                     <div key={idx} className="bg-background p-3 rounded-lg border border-indigo-50 shadow-sm">
                        <p className="text-xs font-bold mb-2">{idx+1}. {q.question_text}</p>
                        {q.options?.map((opt: string, oIdx: number) => (
                           <div key={oIdx} className={cn("text-[10px] p-1.5 rounded mb-1 border", opt === q.correct_answer ? "bg-green-50 border-green-200 text-green-700 font-bold" : "border-slate-100 text-slate-500")}>
                              {opt}
                           </div>
                        ))}
                     </div>
                  ))}
               </div>
            </Card>
         </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t bg-background shrink-0">
        {/* Helper buttons */}
        <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
           <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-full gap-1 border-indigo-100 text-indigo-600" onClick={() => setShowExamPrep(true)}>
             <Calendar className="h-3 w-3" /> הכנה למבחן
           </Button>
           <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-full gap-1 border-purple-100 text-purple-600" onClick={() => setShowGenQ(true)}>
             <Zap className="h-3 w-3" /> צור שאלות
           </Button>
           <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-full gap-1 border-slate-100 text-slate-600" onClick={() => setShowStats(!showStats)}>
             <Target className="h-3 w-3" /> הפרופיל שלי
           </Button>
        </div>

        <div className="flex gap-2 items-end relative">
          <Textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="איך להסביר לך דולב? 😊"
            className="resize-none min-h-[52px] max-h-[150px] rounded-2xl border-none bg-muted/30 focus-visible:ring-1 focus-visible:ring-indigo-500/50 pr-12 text-sm"
            rows={1} disabled={isLoading}
          />
          <Button size="icon" className={cn("absolute left-2 bottom-1.5 h-8 w-8 rounded-xl transition-all", input.trim() ? "bg-indigo-600 shadow-md scale-100" : "bg-slate-300 scale-90")}
            onClick={() => send(input)} disabled={!input.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2 opacity-50">
          מבוסס על מנוע ה-AI של Google Gemini. המנטור יכול לטעות.
        </p>
      </div>

      {/* Stats/Profile view overlay */}
      {showStats && (
         <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="w-full max-w-sm shadow-2xl border-indigo-100">
               <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                     <div>
                        <h3 className="font-heading font-bold text-lg">הפרופיל שלך</h3>
                        <p className="text-xs text-muted-foreground font-body">ככה המנטור רואה אותך:</p>
                     </div>
                     <Button variant="ghost" size="sm" onClick={() => setShowStats(false)}>×</Button>
                  </div>
                  <div className="space-y-4">
                     <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"><Target className="h-5 w-5 text-indigo-600" /></div>
                        <div>
                           <p className="text-[10px] text-muted-foreground">ממוצע כללי</p>
                           <p className="text-sm font-bold">88.4</p>
                        </div>
                     </div>
                     {studentStats?.strongSubject && (
                        <div className="p-3 border border-green-100 bg-green-50/20 rounded-xl">
                           <p className="text-[10px] text-green-600 font-bold mb-1">💪 מקצוע חזק</p>
                           <p className="text-sm">{studentStats.strongSubject}</p>
                        </div>
                     )}
                     {studentStats?.weakSubject && (
                        <div className="p-3 border border-amber-100 bg-amber-50/20 rounded-xl">
                           <p className="text-[10px] text-amber-600 font-bold mb-1">📈 מקצוע לשיפור</p>
                           <p className="text-sm">{studentStats.weakSubject}</p>
                        </div>
                     )}
                     <div className="flex gap-2 mt-4">
                        {trackNames.map(t => <Badge key={t} variant="outline" className="text-[10px] border-indigo-100 text-indigo-600">{t}</Badge>)}
                     </div>
                  </div>
               </CardContent>
            </Card>
         </div>
      )}

      {/* Exam Prep Dialog */}
      <Dialog open={showExamPrep} onOpenChange={setShowExamPrep}>
        <DialogContent className="max-w-sm rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" /> תוכנית הכנה למבחן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs font-heading text-slate-500">בחר מקצוע</p>
              <Select value={examSubject} onValueChange={setExamSubject}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="בחר מקצוע" /></SelectTrigger>
                <SelectContent>
                  {mySubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  <SelectItem value="אחר">אחר...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {examSubject === "אחר" && (
                <Input placeholder="רשום את שם המקצוע..." onChange={e => setExamSubject(e.target.value)} />
            )}
            <div className="space-y-1">
              <p className="text-xs font-heading text-slate-500">עוד כמה ימים המבחן?</p>
              <Input type="number" value={examDays} onChange={e => setExamDays(e.target.value)} min="1" max="30" className="rounded-xl" />
            </div>
            <Button className="w-full font-heading rounded-xl bg-indigo-600" onClick={generateExamPlan} disabled={!examSubject}>
              צור תוכנית לימודים
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Questions Dialog */}
      <Dialog open={showGenQ} onOpenChange={setShowGenQ}>
        <DialogContent className="max-w-sm rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" /> צור שאלות תרגול (AI)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
               <p className="text-xs font-heading text-slate-500">נושא השאלות</p>
               <Input placeholder="לדוגמה: משוואות ריבועיות..." value={genQSubject} onChange={e => setGenQSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1">
               <p className="text-xs font-heading text-slate-500">מספר שאלות</p>
               <div className="flex gap-2">
                  {["3","5","10"].map(n => (
                     <Button key={n} variant={genQCount === n ? "default" : "outline"} className="flex-1 rounded-xl h-9 text-xs" onClick={() => setGenQCount(n)}>{n}</Button>
                  ))}
               </div>
            </div>
            <Button className="w-full font-heading rounded-xl bg-purple-600 hover:bg-purple-700" onClick={generateQuestions} disabled={!genQSubject || genQLoading}>
               {genQLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "צור שאלות עם Gemini AI"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AITutorPage;
