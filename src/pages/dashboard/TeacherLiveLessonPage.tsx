import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Radio, Image, Link2, Trash2, Upload,
  BarChart3, MessageSquare, CheckCircle2, Plus,
  Eye, EyeOff, Send, Monitor, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface LiveSession {
  id: string;
  class_id: string;
  subject: string;
  lesson_number: number;
  is_active: boolean;
  shared_content_type: string | null;
  shared_content_url: string | null;
  shared_content_title: string | null;
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

interface CurrentSlot {
  subject: string;
  class_id: string;
  lesson_number: number;
  class_grade: string;
  class_number: number;
  start_time: string;
  end_time: string;
  room: string | null;
}

const TeacherLiveLessonPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  const [currentSlot, setCurrentSlot] = useState<CurrentSlot | null>(null);
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [noLesson, setNoLesson] = useState(false);

  // Share content
  const [shareType, setShareType] = useState<"image" | "link" | "file">("link");
  const [shareUrl, setShareUrl] = useState("");
  const [shareTitle, setShareTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  // Poll form
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollType, setPollType] = useState<"poll" | "quiz">("poll");
  const [pollOptions, setPollOptions] = useState([
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  // Auto-detect current lesson from timetable + bell_schedule
  const detectCurrentLesson = useCallback(async () => {
    if (!profile.schoolId) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek > 4) { // Not a school day (Fri/Sat)
      setNoLesson(true);
      setLoading(false);
      return;
    }

    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Get bell schedule
    const { data: bells } = await supabase
      .from("bell_schedule")
      .select("lesson_number, start_time, end_time, is_break")
      .eq("school_id", profile.schoolId)
      .order("lesson_number");

    if (!bells) { setNoLesson(true); setLoading(false); return; }

    const currentBell = bells.find(
      (b: any) => !b.is_break && currentTime >= b.start_time?.slice(0, 5) && currentTime <= b.end_time?.slice(0, 5)
    );

    if (!currentBell) { setNoLesson(true); setLoading(false); return; }

    // Query timetable_slots directly by teacher_id (works for all teacher types)
    const { data: slotsById } = await supabase
      .from("timetable_slots")
      .select("subject, class_id, lesson_number, room")
      .eq("school_id", profile.schoolId)
      .eq("day_of_week", dayOfWeek)
      .eq("lesson_number", currentBell.lesson_number)
      .eq("teacher_id", profile.id);

    // Also check via teacher_classes if teacher_id isn't set in slots
    let slotsByClass: any[] = [];
    const { data: tc } = await supabase
      .from("teacher_classes")
      .select("class_id")
      .eq("user_id", profile.id);
    
    if (tc && tc.length > 0) {
      const classIds = tc.map((t: any) => t.class_id);
      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("subject, class_id, lesson_number, room")
        .eq("school_id", profile.schoolId)
        .eq("day_of_week", dayOfWeek)
        .eq("lesson_number", currentBell.lesson_number)
        .in("class_id", classIds);
      slotsByClass = slots || [];
    }

    const allSlots = [...(slotsById || []), ...slotsByClass];
    // Deduplicate
    const uniqueSlots = allSlots.filter((s, i, arr) => 
      arr.findIndex(x => x.class_id === s.class_id && x.subject === s.subject) === i
    );

    if (uniqueSlots.length === 0) { setNoLesson(true); setLoading(false); return; }

    const slot = uniqueSlots[0] as any;

    // Get class info
    const { data: classInfo } = await supabase
      .from("classes")
      .select("grade, class_number")
      .eq("id", slot.class_id)
      .single();

    setCurrentSlot({
      subject: slot.subject,
      class_id: slot.class_id,
      lesson_number: slot.lesson_number || currentBell.lesson_number,
      class_grade: classInfo?.grade || "",
      class_number: classInfo?.class_number || 0,
      start_time: currentBell.start_time?.slice(0, 5),
      end_time: currentBell.end_time?.slice(0, 5),
      room: slot.room,
    });

    // Auto-create or find live session
    const today = now.toISOString().split("T")[0];
    const { data: existingSessions } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("teacher_id", profile.id)
      .eq("class_id", slot.class_id)
      .eq("subject", slot.subject)
      .eq("session_date", today)
      .eq("lesson_number", slot.lesson_number || currentBell.lesson_number)
      .limit(1);

    let session: LiveSession;
    if (existingSessions && existingSessions.length > 0) {
      session = existingSessions[0] as any;
      // Reactivate if needed
      if (!session.is_active) {
        await supabase.from("live_sessions").update({ is_active: true }).eq("id", session.id);
        session.is_active = true;
      }
    } else {
      const { data: newSession, error } = await supabase.from("live_sessions").insert({
        school_id: profile.schoolId,
        class_id: slot.class_id,
        subject: slot.subject,
        lesson_number: slot.lesson_number || currentBell.lesson_number,
        teacher_id: profile.id,
        is_active: true,
      }).select().single();

      if (error) {
        toast({ title: "שגיאה ביצירת שיעור", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      session = newSession as any;
    }

    setActiveSession(session);
    await loadSessionData(session.id);
    setLoading(false);
  }, [profile.id, profile.schoolId]);

  useEffect(() => {
    detectCurrentLesson();
    // Refresh every minute
    const interval = setInterval(detectCurrentLesson, 60_000);
    return () => clearInterval(interval);
  }, [detectCurrentLesson]);

  const [pollResponseCounts, setPollResponseCounts] = useState<Record<string, Record<number, number>>>({});

  const loadSessionData = async (sessionId: string) => {
    const [qRes, pRes] = await Promise.all([
      supabase.from("live_questions").select("*").eq("session_id", sessionId).order("upvotes", { ascending: false }),
      supabase.from("live_polls").select("*").eq("session_id", sessionId),
    ]);
    if (qRes.data) setQuestions(qRes.data as any);
    if (pRes.data) {
      setPolls(pRes.data as any);
      // Load response counts for each poll
      const counts: Record<string, Record<number, number>> = {};
      for (const poll of pRes.data) {
        const { data: responses } = await supabase
          .from("live_poll_responses")
          .select("selected_option")
          .eq("poll_id", (poll as any).id);
        if (responses) {
          counts[(poll as any).id] = {};
          responses.forEach((r: any) => {
            counts[(poll as any).id][r.selected_option] = (counts[(poll as any).id][r.selected_option] || 0) + 1;
          });
        }
      }
      setPollResponseCounts(counts);
    }
  };

  // Realtime for questions and poll responses
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase
      .channel(`teacher-live-${activeSession.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "live_questions",
        filter: `session_id=eq.${activeSession.id}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setQuestions(prev => [...prev, payload.new as any].sort((a, b) => b.upvotes - a.upvotes));
        } else if (payload.eventType === "UPDATE") {
          setQuestions(prev => prev.map(q => q.id === (payload.new as any).id ? payload.new as any : q));
        }
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "live_poll_responses",
      }, (payload) => {
        const resp = payload.new as any;
        setPollResponseCounts(prev => {
          const pollCounts = { ...(prev[resp.poll_id] || {}) };
          pollCounts[resp.selected_option] = (pollCounts[resp.selected_option] || 0) + 1;
          return { ...prev, [resp.poll_id]: pollCounts };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSession?.id]);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSession) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${profile.id}/${activeSession.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("lesson-files")
      .upload(path, file, { upsert: true });

    if (error) {
      toast({ title: "שגיאה בהעלאה", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("lesson-files")
      .getPublicUrl(path);

    const isImage = file.type.startsWith("image/");
    const contentType = isImage ? "image" : "link";

    await supabase.from("live_sessions").update({
      shared_content_type: contentType,
      shared_content_url: urlData.publicUrl,
      shared_content_title: file.name,
    }).eq("id", activeSession.id);

    setActiveSession(prev => prev ? {
      ...prev,
      shared_content_type: contentType,
      shared_content_url: urlData.publicUrl,
      shared_content_title: file.name,
    } : null);

    setUploading(false);
    toast({ title: "הקובץ הועלה בהצלחה ✓" });
  };

  const shareContent = async () => {
    if (!activeSession || !shareUrl) return;
    await supabase.from("live_sessions").update({
      shared_content_type: shareType === "file" ? "link" : shareType,
      shared_content_url: shareUrl,
      shared_content_title: shareTitle || null,
    }).eq("id", activeSession.id);
    setActiveSession(prev => prev ? { ...prev, shared_content_type: shareType, shared_content_url: shareUrl, shared_content_title: shareTitle } : null);
    setShareUrl("");
    setShareTitle("");
    toast({ title: "התוכן שותף בהצלחה ✓" });
  };

  const clearContent = async () => {
    if (!activeSession) return;
    await supabase.from("live_sessions").update({
      shared_content_type: "none",
      shared_content_url: null,
      shared_content_title: null,
    }).eq("id", activeSession.id);
    setActiveSession(prev => prev ? { ...prev, shared_content_type: "none", shared_content_url: null, shared_content_title: null } : null);
  };

  const markAnswered = async (questionId: string) => {
    await supabase.from("live_questions").update({ is_answered: true }).eq("id", questionId);
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, is_answered: true } : q));
  };

  const createPoll = async () => {
    if (!activeSession || !pollQuestion || pollOptions.filter(o => o.text).length < 2) return;
    const validOptions = pollOptions.filter(o => o.text.trim());
    await supabase.from("live_polls").insert({
      session_id: activeSession.id,
      question: pollQuestion,
      poll_type: pollType,
      options: validOptions as any,
      is_active: true,
      show_results: false,
    });
    setPollQuestion("");
    setPollOptions([{ text: "", isCorrect: false }, { text: "", isCorrect: false }]);
    setShowPollForm(false);
    await loadSessionData(activeSession.id);
    toast({ title: pollType === "quiz" ? "חידון נוצר! 🧠" : "סקר נוצר! 📊" });
  };

  const togglePollResults = async (pollId: string, show: boolean) => {
    await supabase.from("live_polls").update({ show_results: show }).eq("id", pollId);
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, show_results: show } : p));
  };

  const closePoll = async (pollId: string) => {
    await supabase.from("live_polls").update({ is_active: false }).eq("id", pollId);
    setPolls(prev => prev.filter(p => p.id !== pollId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Radio className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (noLesson || !currentSlot || !activeSession) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" />
          שיעור חי
        </h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-heading font-bold text-lg">אין שיעור כרגע</p>
            <p className="text-sm mt-2">השיעור החי ייפתח אוטומטית כשמתחיל שיעור לפי מערכת השעות שלך.</p>
            <p className="text-xs mt-1 text-muted-foreground/70">הדף מתרענן כל דקה</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" />
          שיעור חי
        </h1>
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <Badge className="bg-green-500/10 text-green-600 border-green-200">משדר</Badge>
        </div>
      </div>

      {/* Current lesson info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 flex items-center justify-between">
          <div>
            <p className="font-heading font-bold">{currentSlot.subject}</p>
            <p className="text-xs text-muted-foreground">
              {currentSlot.class_grade}'{currentSlot.class_number} · שיעור {currentSlot.lesson_number} · {currentSlot.start_time}–{currentSlot.end_time}
              {currentSlot.room && ` · חדר ${currentSlot.room}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="content" dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content" className="gap-1.5">
            <Monitor className="h-4 w-4" />
            שיתוף תוכן
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            שאלות
            {questions.filter(q => !q.is_answered).length > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 mr-1">
                {questions.filter(q => !q.is_answered).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="polls" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            סקרים
          </TabsTrigger>
        </TabsList>

        {/* ── Share Content Tab ── */}
        <TabsContent value="content" className="mt-4 space-y-3">
          {/* Current shared content */}
          {activeSession.shared_content_type && activeSession.shared_content_type !== "none" && activeSession.shared_content_url && (
            <Card className="border-primary/20">
              <CardHeader className="py-2 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-heading">תוכן משותף כעת: {activeSession.shared_content_title || ""}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={clearContent} className="text-xs text-destructive h-7">
                    <Trash2 className="h-3 w-3 ml-1" />
                    הסר
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {activeSession.shared_content_type === "image" ? (
                  <img src={activeSession.shared_content_url} alt="" className="w-full max-h-48 object-contain rounded-lg" />
                ) : (
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary shrink-0" />
                    <a href={activeSession.shared_content_url} target="_blank" rel="noopener noreferrer" className="text-sm truncate text-primary underline">
                      {activeSession.shared_content_title || activeSession.shared_content_url}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Share options */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">שתף תוכן חדש</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Upload file */}
              <div>
                <Label className="text-xs font-heading mb-1.5 block">העלאת קובץ (תמונה, PDF, מצגת)</Label>
                <label className="flex items-center gap-2 border border-dashed border-primary/30 rounded-lg p-4 cursor-pointer hover:bg-primary/5 transition-colors">
                  <Upload className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {uploading ? "מעלה..." : "לחץ לבחירת קובץ"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.pptx,.ppt,.doc,.docx"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-border" />
                <span className="px-3 text-xs text-muted-foreground">או</span>
                <div className="flex-grow border-t border-border" />
              </div>

              {/* Link / image URL */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button variant={shareType === "link" ? "default" : "outline"} size="sm" onClick={() => setShareType("link")} className="gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    קישור
                  </Button>
                  <Button variant={shareType === "image" ? "default" : "outline"} size="sm" onClick={() => setShareType("image")} className="gap-1.5">
                    <Image className="h-3.5 w-3.5" />
                    URL תמונה
                  </Button>
                </div>
                <Input
                  value={shareUrl}
                  onChange={e => setShareUrl(e.target.value)}
                  placeholder={shareType === "link" ? "הכנס קישור (Google Slides, Canva...)" : "הכנס URL לתמונה"}
                  dir="ltr"
                  className="text-sm"
                />
                <Input
                  value={shareTitle}
                  onChange={e => setShareTitle(e.target.value)}
                  placeholder="כותרת (אופציונלי)"
                  className="text-sm"
                />
                <Button onClick={shareContent} disabled={!shareUrl} size="sm" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  שתף עם הכיתה
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Questions Tab ── */}
        <TabsContent value="questions" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                שאלות מתלמידים ({questions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      אין שאלות עדיין. התלמידים יכולים לשאול דרך הפורטל שלהם 🙋
                    </p>
                  ) : (
                    [...questions].sort((a, b) => b.upvotes - a.upvotes).map(q => (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          q.is_answered ? "bg-muted/30 border-muted opacity-60" : "bg-background"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5 text-muted-foreground">
                          <span className="text-xs font-bold">{q.upvotes}</span>
                          <span className="text-[10px]">👍</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-body">{q.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {q.is_anonymous ? "אנונימי/ת" : "תלמיד/ה"} · {new Date(q.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {!q.is_answered ? (
                          <Button variant="ghost" size="sm" onClick={() => markAnswered(q.id)} className="shrink-0 text-xs gap-1 h-7">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            נענה
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[9px] shrink-0">נענה ✓</Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Polls Tab ── */}
        <TabsContent value="polls" className="mt-4 space-y-3">
          {polls.filter(p => p.is_active).map(poll => (
            <Card key={poll.id} className="border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-heading flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    {poll.poll_type === "quiz" ? "חידון" : "סקר"}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => togglePollResults(poll.id, !poll.show_results)}>
                      {poll.show_results ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {poll.show_results ? "הסתר" : "הצג"} תוצאות
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => closePoll(poll.id)}>
                      סגור
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-heading font-medium text-sm mb-2">{poll.question}</p>
                <div className="space-y-1.5">
                  {(() => {
                    const counts = pollResponseCounts[poll.id] || {};
                    const totalResponses = Object.values(counts).reduce((a, b) => a + b, 0);
                    return poll.options.map((opt, i) => {
                      const count = counts[i] || 0;
                      const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
                      return (
                        <div key={i} className={`px-3 py-2 rounded-lg border text-sm relative overflow-hidden ${
                          poll.poll_type === "quiz" && opt.isCorrect ? "border-green-300 bg-green-50/50" : "border-border"
                        }`}>
                          {totalResponses > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 bg-primary/10 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          <div className="relative flex items-center justify-between">
                            <span>
                              {opt.text}
                              {poll.poll_type === "quiz" && opt.isCorrect && (
                                <Badge className="mr-2 text-[9px] bg-green-100 text-green-700">תשובה נכונה</Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {count} ({pct}%)
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {(() => {
                  const counts = pollResponseCounts[poll.id] || {};
                  const totalResponses = Object.values(counts).reduce((a, b) => a + b, 0);
                  return totalResponses > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      סה"כ {totalResponses} תשובות
                    </p>
                  );
                })()}
              </CardContent>
            </Card>
          ))}

          {showPollForm ? (
            <Card className="border-dashed border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading">יצירת סקר/חידון חדש</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant={pollType === "poll" ? "default" : "outline"} size="sm" onClick={() => setPollType("poll")}>📊 סקר</Button>
                  <Button variant={pollType === "quiz" ? "default" : "outline"} size="sm" onClick={() => setPollType("quiz")}>🧠 חידון</Button>
                </div>
                <Input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="שאלה..." className="text-sm" />
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={opt.text}
                        onChange={e => {
                          const newOpts = [...pollOptions];
                          newOpts[i] = { ...newOpts[i], text: e.target.value };
                          setPollOptions(newOpts);
                        }}
                        placeholder={`תשובה ${i + 1}`}
                        className="text-sm flex-1"
                      />
                      {pollType === "quiz" && (
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={opt.isCorrect}
                            onCheckedChange={checked => {
                              const newOpts = [...pollOptions];
                              newOpts[i] = { ...newOpts[i], isCorrect: checked };
                              setPollOptions(newOpts);
                            }}
                            className="scale-75"
                          />
                          <span className="text-[10px] text-muted-foreground">נכון</span>
                        </div>
                      )}
                      {pollOptions.length > 2 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <Button variant="outline" size="sm" onClick={() => setPollOptions([...pollOptions, { text: "", isCorrect: false }])} className="gap-1 text-xs">
                      <Plus className="h-3 w-3" /> הוסף תשובה
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={createPoll} disabled={!pollQuestion || pollOptions.filter(o => o.text).length < 2} size="sm" className="gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    שלח לכיתה
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowPollForm(false)}>ביטול</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => setShowPollForm(true)} variant="outline" className="w-full gap-2 border-dashed">
              <Plus className="h-4 w-4" />
              צור סקר או חידון חדש
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default TeacherLiveLessonPage;
