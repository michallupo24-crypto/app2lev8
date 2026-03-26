import { useState, useRef, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Brain, Send, Sparkles, BookOpen, FileText, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { UserProfile } from "@/hooks/useAuth";
import { useStudentSubjects } from "@/hooks/useStudentSubjects";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;

const QUICK_PROMPTS = [
  { label: "סכם לי שיעור", icon: FileText, prompt: "תסכם לי את הנושא האחרון שלמדנו במתמטיקה בצורה מסודרת עם נקודות עיקריות" },
  { label: "תוכנית למבחן", icon: Calendar, prompt: "עזור לי לבנות תוכנית לימודים למבחן שיש לי בעוד שבוע" },
  { label: "הסבר מושג", icon: BookOpen, prompt: "הסבר לי בצורה פשוטה ועם דוגמאות מושג שאני לא מבין" },
  { label: "בדוק תשובה", icon: Sparkles, prompt: "אני רוצה שתבדוק לי תשובה שכתבתי ותגיד לי אם אני בכיוון הנכון" },
];

async function streamChat({
  messages,
  grade,
  subject,
  onDelta,
  onDone,
  signal,
}: {
  messages: Msg[];
  grade?: string;
  subject?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, grade, subject }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "שגיאה לא ידועה" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  if (!resp.body) throw new Error("No stream body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Flush remaining
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const subjectContext = trackNames.length > 0
        ? `המגמות: ${trackNames.join(", ")}. המקצועות: ${mySubjects.join(", ")}.`
        : undefined;

      await streamChat({
        messages: [...messages, userMsg],
        grade: "חטיבת ביניים",
        subject: subjectContext,
        onDelta: upsertAssistant,
        onDone: () => setIsLoading(false),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(e);
        toast.error(e.message || "שגיאה בשליחת ההודעה");
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

  const clearChat = () => {
    if (isLoading) {
      abortRef.current?.abort();
      setIsLoading(false);
    }
    setMessages([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold">מנטור - העוזר האישי שלך 🧠</h1>
            <p className="text-xs text-muted-foreground">שאל אותי כל שאלה, בקש סיכום או תוכנית למידה</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearChat} title="נקה שיחה">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 scroll-smooth">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Brain className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold mb-1">היי {profile.fullName.split(" ")[0]}! 👋</h2>
              <p className="text-muted-foreground text-sm max-w-md">
                אני מנטור, העוזר הלימודי האישי שלך. אני כאן כדי לעזור לך להבין חומר, להתכונן למבחנים ולהתקדם בלימודים.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => send(qp.prompt)}
                  className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-right"
                >
                  <qp.icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm font-heading">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 mt-1">
                  <Brain className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <Card
                className={cn(
                  "max-w-[85%] px-4 py-3 shadow-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-md"
                    : "bg-card rounded-2xl rounded-tl-md"
                )}
              >
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
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border pt-3 pb-2">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל אותי משהו... 💬"
            className="resize-none min-h-[44px] max-h-[120px] rounded-xl text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="rounded-xl h-11 w-11 shrink-0"
            onClick={() => send(input)}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          מנטור עוזר בלימודים אבל יכול לטעות. תמיד כדאי לבדוק מול החומר 📖
        </p>
      </div>
    </div>
  );
};

export default AITutorPage;
