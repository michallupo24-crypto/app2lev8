import { useParams, useOutletContext, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, FileText, BarChart3, MessageSquare, Download,
  Send, ArrowRight, Radio, Play, Loader2, CheckCircle2,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import LiveLessonTab from "@/components/live-lesson/LiveLessonTab";

// ─── Real data fetching (no mock data) ───

interface GradeItem {
  id: string;
  title: string;
  grade: number | null;
  max: number;
  date: string;
  type: string;
}

interface MaterialItem {
  id: string;
  name: string;
  type: string;
  date: string;
  url?: string;
}

const SubjectDetailPage = () => {
  const { subjectName } = useParams();
  const [searchParams] = useSearchParams();
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const subject = decodeURIComponent(subjectName || "");
  const [chatInput, setChatInput] = useState("");
  const defaultTab = searchParams.get("tab") || "materials";

  // Practice tab state
  const [practiceAssignments, setPracticeAssignments] = useState<any[]>([]);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizDone, setQuizDone] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [flashFlipped, setFlashFlipped] = useState(false);
  const [practiceMode, setPracticeMode] = useState<"quiz"|"flash">("quiz");

  const loadPractice = async () => {
    if (!profile.id) return;
    setLoadingPractice(true);
    const { data: profileData } = await supabase.from("profiles").select("class_id").eq("id", profile.id).single();
    const classId = (profileData as any)?.class_id;
    if (!classId) { setLoadingPractice(false); return; }

    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, type")
      .eq("class_id", classId)
      .eq("subject", subject)
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (!assignments) { setLoadingPractice(false); return; }

    // Only those with questions
    const ids = assignments.map((a: any) => a.id);
    const { data: qCounts } = await supabase
      .from("task_questions")
      .select("assignment_id")
      .in("assignment_id", ids);
    const qSet = new Set((qCounts || []).map((q: any) => q.assignment_id));
    setPracticeAssignments(assignments.filter((a: any) => qSet.has(a.id)));
    setLoadingPractice(false);
  };

  const openPractice = async (assignment: any, mode: "quiz"|"flash") => {
    setPracticeMode(mode);
    setActiveQuiz(assignment);
    setQuizIdx(0);
    setQuizAnswers({});
    setQuizDone(false);
    setQuizScore(0);
    setFlashFlipped(false);
    const { data } = await supabase.from("task_questions").select("*")
      .eq("assignment_id", assignment.id).order("order_num");
    setQuizQuestions(data || []);
  };

  const submitPracticeQuiz = () => {
    let correct = 0;
    quizQuestions.forEach((q, i) => { if (quizAnswers[i] === q.correct_answer) correct++; });
    setQuizScore(Math.round((correct / quizQuestions.length) * 100));
    setQuizDone(true);
  };

  // Fetch student's grade level
  const { data: studentGrade } = useQuery({
    queryKey: ["student-grade", profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("class_id, classes(grade)")
        .eq("id", profile.id)
        .single();
      return (data as any)?.classes?.grade || null;
    },
  });

  // Fetch real assignments/grades for this subject
  const { data: grades = [] } = useQuery<GradeItem[]>({
    queryKey: ["subject-grades", profile.id, subject],
    queryFn: async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", profile.id)
        .single();
      if (!p?.class_id) return [];

      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, title, type, due_date, max_grade")
        .eq("class_id", p.class_id)
        .eq("subject", subject)
        .eq("published", true)
        .order("due_date", { ascending: false });

      if (!assignments || assignments.length === 0) return [];

      // Get submissions for these assignments
      const assignmentIds = assignments.map(a => a.id);
      const { data: submissions } = await supabase
        .from("submissions")
        .select("assignment_id, grade, status")
        .eq("student_id", profile.id)
        .in("assignment_id", assignmentIds);

      const subMap = new Map<string, { grade: number | null; status: string }>();
      (submissions || []).forEach((s: any) => {
        subMap.set(s.assignment_id, { grade: s.grade, status: s.status });
      });

      const typeLabels: Record<string, string> = {
        homework: "שיעורי בית",
        exam: "מבחן",
        quiz: "בוחן",
        project: "פרויקט",
        exercise: "תרגיל",
      };

      return assignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        grade: subMap.get(a.id)?.grade ?? null,
        max: a.max_grade || 100,
        date: a.due_date ? new Date(a.due_date).toLocaleDateString("he-IL") : "",
        type: typeLabels[a.type] || a.type,
      }));
    },
  });

  const average = grades.filter(g => g.grade !== null).length > 0
    ? Math.round(grades.filter(g => g.grade !== null).reduce((sum, g) => sum + g.grade!, 0) / grades.filter(g => g.grade !== null).length)
    : null;

  // Mock chat messages (will be replaced with real conversation system later)
  const [messages, setMessages] = useState([
    { from: "system", text: `ברוכים הבאים לצ'אט כיתתי של ${subject}!`, time: "09:00", name: "" },
  ]);

  const handleSend = () => {
    if (!chatInput.trim()) return;
    setMessages(prev => [...prev, {
      from: "student",
      name: profile.fullName,
      text: chatInput,
      time: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    }]);
    setChatInput("");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/subjects")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            {subject}
          </h1>
          <p className="text-sm text-muted-foreground">
            {studentGrade ? `שכבה ${studentGrade}` : ""}
            {average !== null ? ` · ממוצע נוכחי: ` : ""}
            {average !== null && <span className="font-bold text-foreground">{average}</span>}
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="live" className="gap-1.5">
            <Radio className="h-4 w-4" />
            שיעור חי
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5">
            <FileText className="h-4 w-4" />
            חומרים
          </TabsTrigger>
          <TabsTrigger value="grades" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            ציונים
          </TabsTrigger>
          <TabsTrigger value="practice" className="gap-1.5" onClick={loadPractice}>
            <Play className="h-4 w-4" />
            תרגול
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            צ'אט
          </TabsTrigger>
        </TabsList>

        {/* Live Lesson Tab */}
        <TabsContent value="live" className="mt-4">
          <LiveLessonTab profile={profile} subjectName={subject} />
        </TabsContent>

        {/* Materials Tab */}
        <TabsContent value="materials" className="mt-4">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-heading font-medium">חומרי לימוד</p>
              <p className="text-sm mt-1">חומרים יופיעו כאן כשהמורה יעלה אותם</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grades Tab */}
        <TabsContent value="grades" className="mt-4 space-y-3">
          {grades.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-heading font-medium">אין ציונים עדיין</p>
                <p className="text-sm mt-1">ציונים יופיעו כאן כשהמורה יזין אותם</p>
              </CardContent>
            </Card>
          ) : (
            grades.map((g) => (
              <Card key={g.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-heading font-bold text-sm ${
                      g.grade === null ? "bg-muted text-muted-foreground" :
                      g.grade >= 85 ? "bg-green-100 text-green-700" :
                      g.grade >= 70 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {g.grade ?? "—"}
                    </div>
                    <div>
                      <p className="font-heading font-medium text-sm">{g.title}</p>
                      <p className="text-xs text-muted-foreground">{g.date}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{g.type}</Badge>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Practice Tab */}
        <TabsContent value="practice" className="mt-4">
          {!activeQuiz ? (
            <div className="space-y-3">
              {loadingPractice ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              ) : practiceAssignments.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">
                  <Play className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-heading font-medium">אין חומרי תרגול עדיין</p>
                  <p className="text-sm mt-1">כשהמורה יוסיף שאלות הן יופיעו כאן</p>
                </CardContent></Card>
              ) : practiceAssignments.map((a: any) => (
                <Card key={a.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <p className="font-heading font-medium text-sm">{a.title}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 font-heading"
                        onClick={() => openPractice(a, "flash")}>🃏 פלאשקארדס</Button>
                      <Button size="sm" className="h-7 text-[11px] gap-1 font-heading"
                        onClick={() => openPractice(a, "quiz")}><Play className="h-3 w-3" />בוחן</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : quizDone ? (
            /* Results */
            <Card><CardContent className="py-6 space-y-4">
              <div className="text-center">
                <p className="text-5xl font-heading font-bold">{quizScore}</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {Math.round(quizScore * quizQuestions.length / 100)}/{quizQuestions.length} נכון
                </p>
              </div>
              <div className="space-y-2">
                {quizQuestions.map((q: any, i: number) => {
                  const correct = quizAnswers[i] === q.correct_answer;
                  return (
                    <div key={i} className={`p-3 rounded-lg text-sm ${correct ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                      <p className="font-heading font-medium text-xs mb-1">{q.question_text}</p>
                      <p className="text-xs">תשובתך: <span className={correct ? "text-green-600" : "text-destructive"}>{quizAnswers[i] || "—"}</span></p>
                      {!correct && <p className="text-xs text-green-600">נכון: {q.correct_answer}</p>}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 font-heading" onClick={() => setActiveQuiz(null)}>חזור לרשימה</Button>
                <Button className="flex-1 font-heading" onClick={() => { setQuizIdx(0); setQuizAnswers({}); setQuizDone(false); }}>נסה שוב</Button>
              </div>
            </CardContent></Card>
          ) : practiceMode === "flash" ? (
            /* Flashcard */
            <Card><CardContent className="py-4 space-y-4">
              <p className="text-xs text-muted-foreground text-center">{quizIdx + 1} / {quizQuestions.length}</p>
              <div className="min-h-[160px] rounded-xl border-2 border-primary/20 bg-primary/5 p-6 cursor-pointer flex items-center justify-center text-center"
                onClick={() => setFlashFlipped(!flashFlipped)}>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2">{flashFlipped ? "תשובה" : "שאלה"} — לחץ להפוך</p>
                  <p className="font-heading font-medium">{flashFlipped ? quizQuestions[quizIdx]?.correct_answer : quizQuestions[quizIdx]?.question_text}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={quizIdx === 0} onClick={() => { setQuizIdx(i => i - 1); setFlashFlipped(false); }}>← הקודם</Button>
                {quizIdx < quizQuestions.length - 1
                  ? <Button className="flex-1" onClick={() => { setQuizIdx(i => i + 1); setFlashFlipped(false); }}>הבא →</Button>
                  : <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setQuizDone(true)}>סיום ✓</Button>}
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setActiveQuiz(null)}>← חזור</Button>
            </CardContent></Card>
          ) : (
            /* Quiz */
            <Card><CardContent className="py-4 space-y-4">
              <p className="text-xs text-muted-foreground text-center">שאלה {quizIdx + 1} / {quizQuestions.length}</p>
              {quizQuestions[quizIdx] && (() => {
                const q = quizQuestions[quizIdx];
                const opts = q.question_type === "true_false" ? ["נכון", "לא נכון"] : (Array.isArray(q.options) ? q.options.filter(Boolean) : []);
                return (
                  <div className="space-y-3">
                    <div className="p-4 bg-muted/30 rounded-xl">
                      <p className="font-heading font-medium">{q.question_text}</p>
                    </div>
                    {opts.length > 0 ? (
                      <div className="space-y-2">
                        {opts.map((opt: string, i: number) => (
                          <button key={i} className={`w-full text-right p-3 rounded-lg border transition-all text-sm ${quizAnswers[quizIdx] === opt ? "border-primary bg-primary/10 font-medium" : "border-border hover:border-primary/40"}`}
                            onClick={() => setQuizAnswers(prev => ({ ...prev, [quizIdx]: opt }))}>
                            <span className="font-heading text-xs text-muted-foreground ml-2">{String.fromCharCode(1488 + i)}.</span>{opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input className="w-full border rounded-lg p-3 text-sm" placeholder="תשובתך..."
                        value={quizAnswers[quizIdx] || ""}
                        onChange={(e) => setQuizAnswers(prev => ({ ...prev, [quizIdx]: e.target.value }))} />
                    )}
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={quizIdx === 0} onClick={() => setQuizIdx(i => i - 1)}>← הקודם</Button>
                {quizIdx < quizQuestions.length - 1
                  ? <Button className="flex-1" onClick={() => setQuizIdx(i => i + 1)}>הבא →</Button>
                  : <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitPracticeQuiz} disabled={!quizAnswers[quizIdx]}>הגש ובדוק</Button>}
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setActiveQuiz(null)}>← חזור</Button>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="mt-4">
          <Card className="flex flex-col" style={{ height: 400 }}>
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-heading">צ'אט כיתתי - {subject}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto py-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.from === "student" && msg.name === profile.fullName ? "items-start" : "items-end"}`}>
                  {msg.from !== "system" ? (
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                      msg.from === "teacher" ? "bg-primary/10 text-foreground" :
                      msg.name === profile.fullName ? "bg-accent text-accent-foreground" :
                      "bg-muted text-foreground"
                    }`}>
                      <p className="text-[10px] font-bold text-muted-foreground mb-0.5">{msg.name}</p>
                      <p className="text-sm">{msg.text}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{msg.time}</p>
                    </div>
                  ) : (
                    <div className="w-full text-center">
                      <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">{msg.text}</span>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
            <div className="border-t p-3 flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder="כתוב הודעה..."
                className="flex-1 text-sm"
              />
              <Button size="icon" onClick={handleSend}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default SubjectDetailPage;
