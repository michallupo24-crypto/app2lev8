import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radio, Send, ThumbsUp, MessageSquare, BarChart3,
  CheckCircle2, Image, Link2, Monitor, Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";

interface LiveLessonTabProps {
  profile: UserProfile;
  subjectName: string;
}

interface LiveSession {
  id: string;
  subject: string;
  teacher_id: string;
  shared_content_type: string;
  shared_content_url: string | null;
  shared_content_title: string | null;
  is_active: boolean;
}

interface Question {
  id: string;
  content: string;
  is_anonymous: boolean;
  is_answered: boolean;
  upvotes: number;
  student_id: string;
  created_at: string;
}

interface Poll {
  id: string;
  question: string;
  poll_type: string;
  options: { text: string; isCorrect?: boolean }[];
  is_active: boolean;
  show_results: boolean;
}

const LiveLessonTab = ({ profile, subjectName }: LiveLessonTabProps) => {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [myPollResponses, setMyPollResponses] = useState<Record<string, number>>({});
  const [questionInput, setQuestionInput] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch active session for this subject
  useEffect(() => {
    const load = async () => {
      if (!profile.schoolId) return;

      const { data: p } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", profile.id)
        .single();
      if (!p?.class_id) { setLoading(false); return; }

      const today = new Date().toISOString().split("T")[0];
      const { data: sessions } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("class_id", p.class_id)
        .eq("subject", subjectName)
        .eq("session_date", today)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        const s = sessions[0] as any;
        setSession(s);
        // Load questions
        const { data: qs } = await supabase
          .from("live_questions")
          .select("*")
          .eq("session_id", s.id)
          .order("upvotes", { ascending: false });
        if (qs) setQuestions(qs as any);

        // Load my votes
        const { data: votes } = await supabase
          .from("live_question_votes")
          .select("question_id")
          .eq("user_id", profile.id);
        if (votes) setMyVotes(new Set(votes.map((v: any) => v.question_id)));

        // Load polls
        const { data: ps } = await supabase
          .from("live_polls")
          .select("*")
          .eq("session_id", s.id)
          .eq("is_active", true);
        if (ps) setPolls(ps as any);

        // Load my responses
        if (ps && ps.length > 0) {
          const pollIds = ps.map((p: any) => p.id);
          const { data: responses } = await supabase
            .from("live_poll_responses")
            .select("poll_id, selected_option")
            .eq("student_id", profile.id)
            .in("poll_id", pollIds);
          if (responses) {
            const map: Record<string, number> = {};
            responses.forEach((r: any) => { map[r.poll_id] = r.selected_option; });
            setMyPollResponses(map);
          }
        }
      }
      setLoading(false);
    };
    load();
  }, [profile.id, profile.schoolId, subjectName]);

  // Realtime subscriptions
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`live-${session.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_questions",
        filter: `session_id=eq.${session.id}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setQuestions(prev => [...prev, payload.new as any].sort((a, b) => b.upvotes - a.upvotes));
        } else if (payload.eventType === "UPDATE") {
          setQuestions(prev => prev.map(q => q.id === (payload.new as any).id ? payload.new as any : q));
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_polls",
        filter: `session_id=eq.${session.id}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPolls(prev => [...prev, payload.new as any]);
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as any;
          if (!updated.is_active) {
            setPolls(prev => prev.filter(p => p.id !== updated.id));
          } else {
            setPolls(prev => prev.map(p => p.id === updated.id ? updated : p));
          }
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        setSession(updated);
        if (!updated.is_active) setSession(null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  const handleAskQuestion = async () => {
    if (!questionInput.trim() || !session) return;
    await supabase.from("live_questions").insert({
      session_id: session.id,
      student_id: profile.id,
      content: questionInput.trim(),
      is_anonymous: isAnonymous,
    });
    setQuestionInput("");
  };

  const handleVote = async (questionId: string) => {
    if (myVotes.has(questionId)) {
      await supabase.from("live_question_votes")
        .delete()
        .eq("question_id", questionId)
        .eq("user_id", profile.id);
      setMyVotes(prev => { const n = new Set(prev); n.delete(questionId); return n; });
      setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, upvotes: q.upvotes - 1 } : q));
    } else {
      await supabase.from("live_question_votes").insert({
        question_id: questionId,
        user_id: profile.id,
      });
      setMyVotes(prev => new Set(prev).add(questionId));
      setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, upvotes: q.upvotes + 1 } : q));
    }
  };

  const handlePollVote = async (pollId: string, optionIndex: number) => {
    if (myPollResponses[pollId] !== undefined) return; // Already voted
    await supabase.from("live_poll_responses").insert({
      poll_id: pollId,
      student_id: profile.id,
      selected_option: optionIndex,
    });
    setMyPollResponses(prev => ({ ...prev, [pollId]: optionIndex }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <Radio className="h-8 w-8 mx-auto mb-3 animate-pulse" />
          <p>בודק שיעור חי...</p>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <Monitor className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-heading font-medium">אין שיעור חי כרגע</p>
          <p className="text-sm mt-1">כשהמורה יתחיל שיעור, תוכל/י לצפות בלוח, לשאול שאלות ולהשתתף בסקרים</p>
        </CardContent>
      </Card>
    );
  }

  const sortedQuestions = [...questions].sort((a, b) => b.upvotes - a.upvotes);

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-sm font-heading font-bold text-green-600">שיעור חי</span>
      </div>

      {/* Shared content */}
      {session.shared_content_type !== "none" && session.shared_content_url && (
        <Card className="overflow-hidden">
          <CardHeader className="py-2 px-4 bg-muted/50 border-b">
            <CardTitle className="text-xs font-heading flex items-center gap-1.5">
              {session.shared_content_type === "image" && <Image className="h-3.5 w-3.5" />}
              {session.shared_content_type !== "image" && <Link2 className="h-3.5 w-3.5" />}
              {session.shared_content_title || "תוכן מהמורה"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {session.shared_content_type === "image" ? (
              <img
                src={session.shared_content_url}
                alt="תוכן משותף"
                className="w-full max-h-[400px] object-contain bg-muted/20"
                onError={(e) => {
                  // If image blocked, show fallback link
                  (e.target as HTMLImageElement).style.display = "none";
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const fallback = document.createElement("div");
                    fallback.className = "p-6 text-center";
                    fallback.innerHTML = `<p class="text-sm text-muted-foreground mb-2">לא ניתן להציג את התמונה</p><a href="${session.shared_content_url}" target="_blank" rel="noopener noreferrer" class="text-sm text-primary underline font-medium">לחץ כאן לפתיחה ↗</a>`;
                    parent.appendChild(fallback);
                  }
                }}
              />
            ) : (
              <a
                href={session.shared_content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-6 hover:bg-muted/30 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Link2 className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-heading font-bold text-primary group-hover:underline">
                    {session.shared_content_title || "תוכן מהמורה"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5" dir="ltr">
                    {session.shared_content_url}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">פתח בחלון חדש ↗</span>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active polls */}
      {polls.map((poll) => (
        <Card key={poll.id} className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {poll.poll_type === "quiz" ? "חידון" : "סקר"}
              {poll.show_results && <Badge variant="outline" className="text-[9px]">תוצאות פתוחות</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading font-medium mb-3">{poll.question}</p>
            <div className="space-y-2">
              {poll.options.map((opt, i) => {
                const hasVoted = myPollResponses[poll.id] !== undefined;
                const isMyChoice = myPollResponses[poll.id] === i;
                const isCorrect = poll.poll_type === "quiz" && hasVoted && poll.show_results && opt.isCorrect;

                return (
                  <button
                    key={i}
                    onClick={() => handlePollVote(poll.id, i)}
                    disabled={hasVoted}
                    className={`w-full text-right px-4 py-3 rounded-lg border transition-all text-sm font-body ${
                      isMyChoice
                        ? isCorrect
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-primary bg-primary/10 text-primary"
                        : hasVoted
                          ? "border-border bg-muted/50 text-muted-foreground"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isMyChoice && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                      {opt.text}
                    </span>
                  </button>
                );
              })}
            </div>
            {myPollResponses[poll.id] !== undefined && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                ✓ התשובה שלך נשלחה
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Q&A Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            שאלות לשיעור
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Ask question */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
                placeholder="שאל/י שאלה..."
                className="flex-1 text-sm"
              />
              <Button size="icon" onClick={handleAskQuestion} disabled={!questionInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                className="scale-75"
              />
              <Label htmlFor="anonymous" className="text-xs text-muted-foreground flex items-center gap-1">
                {isAnonymous ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {isAnonymous ? "שאלה אנונימית" : "שאלה עם שם"}
              </Label>
            </div>
          </div>

          {/* Questions list */}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {sortedQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  אין שאלות עדיין. היו הראשונים לשאול! 🙋
                </p>
              ) : (
                sortedQuestions.map((q) => (
                  <div
                    key={q.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      q.is_answered ? "bg-green-50/50 border-green-200" : "bg-background"
                    }`}
                  >
                    <button
                      onClick={() => handleVote(q.id)}
                      className={`flex flex-col items-center gap-0.5 shrink-0 pt-0.5 ${
                        myVotes.has(q.id) ? "text-primary" : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      <span className="text-xs font-bold">{q.upvotes}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-body">{q.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {q.is_anonymous ? "אנונימי/ת" : "תלמיד/ה"}
                        {q.is_answered && (
                          <Badge variant="outline" className="mr-2 text-[9px] bg-green-50 text-green-600 border-green-200">
                            נענה ✓
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveLessonTab;
