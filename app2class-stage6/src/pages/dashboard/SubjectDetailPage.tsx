import { useParams, useOutletContext, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, FileText, BarChart3, MessageSquare, Download,
  Send, ArrowRight, Radio,
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
        <TabsList className="grid w-full grid-cols-4">
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
