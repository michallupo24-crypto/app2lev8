import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, TrendingUp, TrendingDown, Minus, Award, BarChart3,
  BookOpen, Target, Loader2, MessageSquare, Send,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";

interface GradeEntry {
  id: string;
  assignmentId: string;
  title: string;
  subject: string;
  type: string;
  grade: number;
  maxGrade: number;
  weight: number;
  gradedAt: string;
  feedback: string | null;
  classAvg?: number | null;
}

interface SubjectSummary {
  subject: string;
  average: number;
  weightedAvg: number;
  count: number;
  grades: GradeEntry[];
  trend: "up" | "down" | "stable";
}

const TYPE_LABELS: Record<string, string> = {
  homework: "שיעורי בית",
  exam: "מבחן",
  quiz: "בוחן",
  project: "פרויקט",
  exercise: "תרגיל",
};

const StudentGradesPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [appealGrade, setAppealGrade] = useState<GradeEntry | null>(null);
  const [appealText, setAppealText] = useState("");
  const [sendingAppeal, setSendingAppeal] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("submissions")
        .select("id, grade, graded_at, feedback, status, assignment_id, assignments(id, title, subject, type, weight_percent, max_grade, class_id)")
        .eq("student_id", profile.id)
        .eq("status", "graded")
        .not("grade", "is", null)
        .order("graded_at", { ascending: false });

      if (!data) { setLoading(false); return; }

      const assignmentIds = [...new Set(data.map((s: any) => s.assignment_id))];
      const avgMap = new Map<string, number>();

      if (assignmentIds.length > 0) {
        const { data: allSubs } = await supabase
          .from("submissions")
          .select("assignment_id, grade, assignments(max_grade)")
          .in("assignment_id", assignmentIds)
          .eq("status", "graded")
          .not("grade", "is", null);

        if (allSubs) {
          const grouped = new Map<string, number[]>();
          allSubs.forEach((s: any) => {
            const maxG = s.assignments?.max_grade || 100;
            const norm = (s.grade / maxG) * 100;
            const list = grouped.get(s.assignment_id) || [];
            list.push(norm);
            grouped.set(s.assignment_id, list);
          });
          grouped.forEach((gs, aId) => {
            avgMap.set(aId, Math.round(gs.reduce((a, b) => a + b, 0) / gs.length));
          });
        }
      }

      setGrades(data.map((s: any) => ({
        id: s.id,
        assignmentId: s.assignment_id,
        title: s.assignments?.title || "",
        subject: s.assignments?.subject || "",
        type: s.assignments?.type || "homework",
        grade: s.grade,
        maxGrade: s.assignments?.max_grade || 100,
        weight: s.assignments?.weight_percent || 0,
        gradedAt: s.graded_at,
        feedback: s.feedback,
        classAvg: avgMap.get(s.assignment_id) ?? null,
      })));
      setLoading(false);
    };
    load();
  }, [profile.id]);

  const subjectSummaries = useMemo<SubjectSummary[]>(() => {
    const map = new Map<string, GradeEntry[]>();
    grades.forEach((g) => { const l = map.get(g.subject) || []; l.push(g); map.set(g.subject, l); });

    return Array.from(map.entries()).map(([subject, entries]) => {
      const sorted = [...entries].sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime());
      const norms = sorted.map((e) => (e.grade / e.maxGrade) * 100);
      const avg = norms.reduce((s, g) => s + g, 0) / norms.length;
      const totalW = entries.reduce((s, e) => s + e.weight, 0);
      let weightedAvg = avg;
      if (totalW > 0) weightedAvg = entries.reduce((s, e) => s + ((e.grade / e.maxGrade) * 100) * e.weight, 0) / totalW;

      let trend: "up" | "down" | "stable" = "stable";
      if (norms.length >= 2) {
        const diff = norms[norms.length - 1] - norms[norms.length - 2];
        if (diff > 3) trend = "up"; else if (diff < -3) trend = "down";
      }
      return { subject, average: Math.round(avg), weightedAvg: Math.round(weightedAvg), count: entries.length, grades: sorted, trend };
    }).sort((a, b) => b.weightedAvg - a.weightedAvg);
  }, [grades]);

  const overallAvg = useMemo(() =>
    subjectSummaries.length === 0 ? 0
    : Math.round(subjectSummaries.reduce((s, ss) => s + ss.weightedAvg, 0) / subjectSummaries.length),
    [subjectSummaries]
  );

  const bestSubject = subjectSummaries[0];
  const worstSubject = subjectSummaries[subjectSummaries.length - 1];
  const filteredGrades = selectedSubject === "all" ? grades : grades.filter((g) => g.subject === selectedSubject);

  const chartData = useMemo(() => {
    const source = selectedSubject === "all" ? grades : grades.filter(g => g.subject === selectedSubject);
    return [...source]
      .sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime())
      .map((g) => ({
        name: g.title.length > 12 ? g.title.slice(0, 12) + "…" : g.title,
        grade: Math.round((g.grade / g.maxGrade) * 100),
        classAvg: g.classAvg ?? undefined,
      }));
  }, [grades, selectedSubject]);

  const gradeColor = (g: number) => {
    if (g >= 90) return "text-green-600 dark:text-green-400";
    if (g >= 75) return "text-primary";
    if (g >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-destructive";
  };

  const sendAppeal = async () => {
    if (!appealGrade || !appealText.trim()) return;
    setSendingAppeal(true);
    try {
      await supabase.from("submissions").update({
        feedback: `[ערעור תלמיד]: ${appealText}\n\n${appealGrade.feedback ? "[משוב מורה]: " + appealGrade.feedback : ""}`,
      }).eq("id", appealGrade.id);
      toast({ title: "הערעור נשלח! ✅", description: "המורה יקבל את פנייתך" });
      setAppealGrade(null);
      setAppealText("");
    } catch {
      toast({ title: "שגיאה בשליחה", variant: "destructive" });
    } finally {
      setSendingAppeal(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" />תיק הציונים שלי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">ציונים, ממוצעים, מגמות והשוואה לכיתה</p>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className={`text-2xl font-heading font-bold ${gradeColor(overallAvg)}`}>{overallAvg || "—"}</p>
          <p className="text-[10px] text-muted-foreground">ממוצע כללי</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <Target className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-heading font-bold">{grades.length}</p>
          <p className="text-[10px] text-muted-foreground">ציונים</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-500" />
          <p className="text-sm font-heading font-bold truncate">{bestSubject?.subject || "—"}</p>
          <p className="text-[10px] text-muted-foreground">{bestSubject ? `ממוצע ${bestSubject.weightedAvg}` : "חזק ביותר"}</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <TrendingDown className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
          <p className="text-sm font-heading font-bold truncate">
            {worstSubject && worstSubject.subject !== bestSubject?.subject ? worstSubject.subject : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {worstSubject && worstSubject.subject !== bestSubject?.subject ? `ממוצע ${worstSubject.weightedAvg}` : "לשיפור"}
          </p>
        </CardContent></Card>
      </motion.div>

      {grades.length === 0 ? (
        <motion.div variants={item}><Card><CardContent className="py-16 text-center">
          <FileText className="h-14 w-14 mx-auto text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground font-body text-lg">אין ציונים עדיין</p>
          <p className="text-sm text-muted-foreground mt-1">הציונים יופיעו כאן ברגע שהמורה יזין אותם</p>
        </CardContent></Card></motion.div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <motion.div variants={item}>
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="overview" className="font-heading">סקירה</TabsTrigger>
              <TabsTrigger value="trend" className="font-heading">מגמה</TabsTrigger>
              <TabsTrigger value="list" className="font-heading">כל הציונים</TabsTrigger>
            </TabsList>
          </motion.div>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <motion.div variants={item}><Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />ממוצעים לפי מקצוע
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {subjectSummaries.map((ss) => (
                  <div key={ss.subject}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => { setSelectedSubject(ss.subject); setActiveTab("trend"); }}
                  >
                    <div className="flex items-center gap-3">
                      {ss.trend === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                      {ss.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive" />}
                      {ss.trend === "stable" && <Minus className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <p className="font-heading font-medium text-sm">{ss.subject}</p>
                        <p className="text-[10px] text-muted-foreground">{ss.count} ציונים</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className={`font-heading font-bold text-xl ${gradeColor(ss.weightedAvg)}`}>{ss.weightedAvg}</span>
                      {ss.weightedAvg !== ss.average && (
                        <span className="text-[10px] text-muted-foreground block">ממוצע: {ss.average}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card></motion.div>

            {subjectSummaries.length > 1 && (
              <motion.div variants={item}><Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />השוואה בין מקצועות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectSummaries.map(s => ({ name: s.subject, avg: s.weightedAvg }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}`, "ממוצע"]} />
                        <ReferenceLine y={60} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                          {subjectSummaries.map((ss, i) => (
                            <Cell key={i} fill={ss.weightedAvg >= 90 ? "#22c55e" : ss.weightedAvg >= 75 ? "hsl(var(--primary))" : ss.weightedAvg >= 60 ? "#eab308" : "hsl(var(--destructive))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card></motion.div>
            )}
          </TabsContent>

          <TabsContent value="trend" className="space-y-4 mt-4">
            <motion.div variants={item} className="flex items-center gap-3">
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-48"><SelectValue placeholder="כל המקצועות" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המקצועות</SelectItem>
                  {subjectSummaries.map((ss) => <SelectItem key={ss.subject} value={ss.subject}>{ss.subject}</SelectItem>)}
                </SelectContent>
              </Select>
            </motion.div>

            {chartData.length >= 2 ? (
              <motion.div variants={item}><Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />מגמת ציונים
                    {selectedSubject !== "all" && <Badge variant="outline" className="text-[10px]">{selectedSubject}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: any, name: string) => [`${v}`, name === "grade" ? "הציון שלי" : "ממוצע כיתה"]} />
                        <ReferenceLine y={60} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="grade" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", r: 4 }} name="grade" />
                        {chartData.some(d => d.classAvg !== undefined) && (
                          <Line type="monotone" dataKey="classAvg" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="classAvg" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {chartData.some(d => d.classAvg !== undefined) && (
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" />הציון שלי</span>
                      <span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-muted-foreground inline-block" />ממוצע כיתה</span>
                    </div>
                  )}
                </CardContent>
              </Card></motion.div>
            ) : (
              <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
                צריך לפחות 2 ציונים לתצוגת מגמה
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="list" className="space-y-3 mt-4">
            <motion.div variants={item} className="flex items-center gap-3">
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-48"><SelectValue placeholder="כל המקצועות" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המקצועות</SelectItem>
                  {subjectSummaries.map((ss) => <SelectItem key={ss.subject} value={ss.subject}>{ss.subject}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">{filteredGrades.length} ציונים</span>
            </motion.div>

            {filteredGrades.map((g) => {
              const normalized = Math.round((g.grade / g.maxGrade) * 100);
              const vsClass = g.classAvg != null ? normalized - g.classAvg : null;
              return (
                <motion.div key={g.id} variants={item}><Card className="hover:shadow-sm transition-all">
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] shrink-0">{TYPE_LABELS[g.type] || g.type}</Badge>
                          <p className="font-heading font-medium text-sm truncate">{g.title}</p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{g.subject}</span>
                          {g.weight > 0 && <><span>•</span><span>{g.weight}% מהציון</span></>}
                          {g.gradedAt && <><span>•</span><span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span></>}
                        </div>
                        {g.feedback && !g.feedback.startsWith("[ערעור") && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">💬 {g.feedback}</p>
                        )}
                      </div>
                      <div className="text-left shrink-0 flex flex-col items-end gap-1">
                        <div>
                          <span className={`font-heading font-bold text-xl ${gradeColor(normalized)}`}>{g.grade}</span>
                          {g.maxGrade !== 100 && <span className="text-xs text-muted-foreground">/{g.maxGrade}</span>}
                        </div>
                        {vsClass !== null && (
                          <span className={`text-[10px] font-medium ${vsClass > 0 ? "text-green-500" : vsClass < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {vsClass > 0 ? `+${vsClass}` : vsClass} מממוצע
                          </span>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-primary"
                          onClick={() => { setAppealGrade(g); setAppealText(""); }}>
                          <MessageSquare className="h-3 w-3 mr-1" />ערעור
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card></motion.div>
              );
            })}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!appealGrade} onOpenChange={(o) => { if (!o) setAppealGrade(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />ערעור על ציון
            </DialogTitle>
          </DialogHeader>
          {appealGrade && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-heading font-medium text-sm">{appealGrade.title}</p>
                <p className="text-xs text-muted-foreground">{appealGrade.subject} • ציון: {appealGrade.grade}/{appealGrade.maxGrade}</p>
              </div>
              <Textarea placeholder="לדוגמה: אשמח להבין למה ירדו נקודות בשאלה 4..."
                value={appealText} onChange={(e) => setAppealText(e.target.value)}
                className="font-body text-sm resize-none" rows={3} />
              <Button className="w-full gap-2 font-heading" onClick={sendAppeal} disabled={sendingAppeal || !appealText.trim()}>
                {sendingAppeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingAppeal ? "שולח..." : "שלח ערעור למורה"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">הפנייה תתועד במערכת ותישלח למורה הרלוונטי</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default StudentGradesPage;
