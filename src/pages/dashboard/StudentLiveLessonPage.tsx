import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Radio, MessageSquare, Send, Loader2, BookOpen, BarChart3,
  Eye, EyeOff, Wifi, WifiOff, CheckCircle2, Monitor,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface LiveSession {
  id: string;
  subject: string;
  teacher_id: string;
  shared_content_type: string | null;
  shared_content_url: string | null;
  shared_content_title: string | null;
  is_active: boolean;
  class_id: string;
}

interface LivePoll {
  id: string;
  question: string;
  poll_type: string;
  options: { text: string; isCorrect?: boolean }[];
  is_active: boolean;
  show_results: boolean;
}

interface PollResults {
  [optionIndex: number]: number;
}

const StudentLiveLessonPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [polls, setPolls] = useState<LivePoll[]>([]);
  const [myPollResponses, setMyPollResponses] = useState<Record<string, number>>({});
  const [pollResults, setPollResults] = useState<Record<string, PollResults>>({});

  // Focus slider
  const [focusLevel, setFocusLevel] = useState(3);
  const [lastFocusSent, setLastFocusSent] = useState(0);
  const focusDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Anonymous question
  const [questionText, setQuestionText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [sendingQ, setSendingQ] = useState(false);
  const [sentQuestions, setSentQuestions] = useState<string[]>([]);

  const focusLabels = ["🫤 אבוד", "😐 מתקשה", "🙂 בעניין", "😊 מרוכז", "🔥 מעולה"];
  const focusColors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-primary", "bg-green-500"];

  // Load active session for student's class
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();
      if (!prof?.class_id) { setLoading(false); return; }

      const { data: sess } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("class_id", prof.class_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setSession(sess);
      setLoading(false);

      if (sess) {
        loadPolls(sess.id);
        setConnected(true);
      }
    };
    load();
  }, [profile.id]);

  // Realtime subscription
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`live-student-${session.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        if (payload.new) {
          setSession(payload.new as LiveSession);
          if (!(payload.new as LiveSession).is_active) {
            setConnected(false);
            toast({ title: "השיעור החי הסתיים 📚" });
          }
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_polls",
        filter: `session_id=eq.${session.id}`,
      }, () => {
        loadPolls(session.id);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  const loadPolls = async (sessionId: string) => {
    const { data } = await supabase
      .from("live_polls")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setPolls((data || []).map((p: any) => ({
      ...p,
      options: typeof p.options === "string" ? JSON.parse(p.options) : (p.options || []),
    })));
  };

  // Send focus level (debounced, auto every 2 min)
  const sendFocusUpdate = async (level: number) => {
    if (!session) return;
    const now = Date.now();
    if (now - lastFocusSent < 5000) return; // min 5s between sends

    try {
      // Find current lesson_id for this session
      const { data: lesson } = await supabase
        .from("lessons")
        .select("id")
        .eq("class_id", session.class_id)
        .eq("subject", session.subject)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lesson?.id) {
        await supabase.from("focus_reports").insert({
          lesson_id: lesson.id,
          student_id: profile.id,
          level,
        });
        setLastFocusSent(now);
      }
    } catch { /* best effort */ }
  };

  const handleFocusChange = (val: number[]) => {
    const level = val[0];
    setFocusLevel(level);
    if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
    focusDebounceRef.current = setTimeout(() => sendFocusUpdate(level), 1500);
  };

  // Send anonymous question
  const sendQuestion = async () => {
    if (!questionText.trim() || !session || sendingQ) return;
    setSendingQ(true);
    try {
      // Basic filter — block offensive words
      const blocked = ["טמבל", "מטומטם", "שטויות", "זבל"];
      if (blocked.some(w => questionText.includes(w))) {
        toast({ title: "השאלה מכילה שפה לא מתאימה", variant: "destructive" });
        setSendingQ(false);
        return;
      }

      await supabase.from("live_questions").insert({
        session_id: session.id,
        student_id: profile.id,
        content: questionText.trim(),
        is_anonymous: isAnonymous,
      });

      setSentQuestions(prev => [...prev, questionText.trim()]);
      setQuestionText("");
      toast({ title: "השאלה נשלחה למורה! ✅" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setSendingQ(false);
    }
  };

  // Answer poll
  const answerPoll = async (pollId: string, optionIdx: number) => {
    if (myPollResponses[pollId] !== undefined) return; // already answered
    try {
      await supabase.from("live_poll_responses").insert({
        poll_id: pollId,
        student_id: profile.id,
        option_index: optionIdx,
      });
      setMyPollResponses(prev => ({ ...prev, [pollId]: optionIdx }));
      toast({ title: "תגובתך נשלחה! 📊" });
    } catch { /* best effort */ }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!session) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <WifiOff className="h-16 w-16 text-muted-foreground/20" />
      <div>
        <p className="text-lg font-heading font-bold">אין שיעור חי כרגע</p>
        <p className="text-sm text-muted-foreground mt-1">
          כשמורה יפתח שיעור חי לכיתה שלך — הוא יופיע כאן אוטומטית
        </p>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-red-500 animate-pulse" />
            שיעור חי — {session.subject}
          </h1>
          <p className="text-sm text-muted-foreground font-body">אתה בשידור עם הכיתה</p>
        </div>
        <Badge variant={connected ? "default" : "outline"} className={`gap-1 text-xs ${connected ? "bg-green-500" : ""}`}>
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? "מחובר" : "מתחבר..."}
        </Badge>
      </div>

      {/* Shared content */}
      {session.shared_content_type && session.shared_content_type !== "none" && session.shared_content_url && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-primary/30 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                {session.shared_content_title || "תוכן משותף"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {session.shared_content_type === "link" ? (
                <a href={session.shared_content_url} target="_blank" rel="noreferrer"
                  className="text-primary text-sm underline hover:no-underline font-body break-all">
                  {session.shared_content_url}
                </a>
              ) : session.shared_content_type === "image" ? (
                <img
                  src={session.shared_content_url}
                  alt="תוכן משותף"
                  className="w-full max-h-64 object-contain rounded-lg bg-muted/30"
                />
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Focus Slider */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            מדד הריכוז שלי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-center">
              <motion.div
                key={focusLevel}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <p className="text-3xl mb-1">{["😵", "🫤", "😐", "🙂", "🔥"][focusLevel - 1]}</p>
                <p className="font-heading font-bold text-sm">{focusLabels[focusLevel - 1]}</p>
              </motion.div>
            </div>
            <Slider
              value={[focusLevel]}
              min={1} max={5} step={1}
              onValueChange={handleFocusChange}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              {focusLabels.map(l => <span key={l}>{l.split(" ")[0]}</span>)}
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full font-heading gap-2 text-xs"
            onClick={() => sendFocusUpdate(focusLevel)}>
            <Send className="h-3.5 w-3.5" />עדכן מורה
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            המורה רואה ממוצע כיתתי — לא את הדיווח האישי שלך
          </p>
        </CardContent>
      </Card>

      {/* Anonymous Question */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            שאלה למורה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="שאל את המורה שאלה... (הכל בסדר לשאול!)"
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
            className="font-body text-sm resize-none" rows={3}
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) sendQuestion(); }}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="anon" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
              <Label htmlFor="anon" className="text-xs font-body cursor-pointer">
                {isAnonymous ? <><EyeOff className="h-3 w-3 inline mr-1" />שאלה אנונימית</> : <><Eye className="h-3 w-3 inline mr-1" />עם שמי</>}
              </Label>
            </div>
            <Button size="sm" className="gap-2 font-heading" onClick={sendQuestion}
              disabled={sendingQ || !questionText.trim()}>
              {sendingQ ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              שלח
            </Button>
          </div>

          {sentQuestions.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground font-heading">שאלות ששלחת:</p>
              {sentQuestions.map((q, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                  <span className="truncate">{q}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Polls */}
      <AnimatePresence>
        {polls.map(poll => (
          <motion.div key={poll.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-yellow-400/40 bg-yellow-50/50 dark:bg-yellow-900/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-yellow-600" />
                  {poll.poll_type === "quiz" ? "🎯 חידון בזק" : "📊 סקר"} — {poll.question}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myPollResponses[poll.id] !== undefined ? (
                  <div className="space-y-2">
                    <p className="text-sm text-green-600 font-heading flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />תגובתך נרשמה!
                    </p>
                    {poll.show_results && (
                      <div className="space-y-1">
                        {(poll.options || []).map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`flex-1 h-6 rounded-full text-[11px] font-heading flex items-center px-2 relative overflow-hidden
                              ${i === myPollResponses[poll.id] ? "bg-primary/20" : "bg-muted/50"}`}>
                              <span className="relative z-10">{opt.text}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(poll.options || []).map((opt, i) => (
                      <Button key={i} variant="outline"
                        className="text-xs h-auto py-2.5 text-right font-heading hover:border-primary"
                        onClick={() => answerPoll(poll.id, i)}>
                        {opt.text}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Instructions when no polls */}
      {polls.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground font-body">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            כשהמורה ישגר סקר או חידון — הוא יופיע כאן בזמן אמת
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default StudentLiveLessonPage;
