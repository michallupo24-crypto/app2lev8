import { useState, useEffect, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, TrendingUp, TrendingDown, Minus, Award, BarChart3,
  BookOpen, Target, Loader2, MessageSquare, Send, Sparkles,
  ChevronRight, BrainCircuit, Star, Printer, Zap, Trophy,
} from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [appealGrade, setAppealGrade] = useState<GradeEntry | null>(null);
  const [appealText, setAppealText] = useState("");
  const [sendingAppeal, setSendingAppeal] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const { badges, streak } = useGamification(profile.id);

  const stats_gamified = useMemo(() => {
    const totalBadges = badges.length;
    const activeDays = streak?.total_active_days || 0;
    const xp = (activeDays * 10) + (totalBadges * 100);
    const lvl = Math.floor(xp / 500) + 1;
    return { lvl, xp };
  }, [badges, streak]);

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
        const { data: rpcAvgs, error: rpcError } = await supabase.rpc('get_assignment_averages', { 
          p_assignment_ids: assignmentIds 
        });
        
        if (!rpcError && rpcAvgs) {
          rpcAvgs.forEach((avg: any) => {
            avgMap.set(avg.assignment_id, avg.avg_grade);
          });
        } else if (rpcError) {
          console.error("RPC Error fetching averages:", rpcError);
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

  useEffect(() => {
    if (grades.length === 0 || loading) return;
    const getInsight = async () => {
      setLoadingInsight(true);
      try {
        const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
        if (!GEMINI_API_KEY) return;
        const summary = grades.slice(0, 5).map(g => `${g.subject}: ${g.grade}/${g.maxGrade}`).join(", ");
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `כמנטור לימודי חכם, תן משפט אחד קצר ומעודד (בעברית) לתלמיד ${profile.fullName} על סמך הציונים האלו: ${summary}.` }] }]
          })
        });
        const data = await resp.json();
        setAiInsight(data.candidates?.[0]?.content?.parts?.[0]?.text || null);
      } catch (e) {
        console.error("AI Insight failed", e);
      } finally {
        setLoadingInsight(false);
      }
    };
    getInsight();
  }, [grades, loading]);

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
  const unfilteredGrades = grades;
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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 text-right" dir="rtl">
      <motion.div variants={item} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Zap className="h-8 w-8 text-primary fill-primary/20" />
            </div>
            <Badge className="absolute -bottom-2 -right-2 bg-primary text-white border-2 border-background px-1.5 h-6 font-black">
              LVL {stats_gamified.lvl}
            </Badge>
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" />תיק הציונים שלי
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-1">ציונים, ממוצעים, מגמות והשוואה לכיתה</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/dashboard/report/${profile.id}`)}
            className="gap-2 border-primary/20 text-primary hover:bg-primary/5 rounded-xl font-heading shadow-sm"
          >
            <Printer className="h-4 w-4" /> הפק תעודה
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate("/dashboard/badges")}
            className="gap-2 border-yellow-500/20 text-yellow-600 hover:bg-yellow-500/5 rounded-xl font-heading shadow-sm"
          >
            <Trophy className="h-4 w-4" /> {badges.length} מדליות
          </Button>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <CardContent className="py-5 text-center relative z-10">
            <BarChart3 className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className={`text-3xl font-heading font-black ${gradeColor(overallAvg)}`}>{overallAvg || "—"}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">ממוצע כללי</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <CardContent className="py-5 text-center relative z-10">
            <Target className="h-5 w-5 mx-auto mb-2 text-blue-500" />
            <p className="text-3xl font-heading font-black">{grades.length}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">סה"כ ציונים</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <CardContent className="py-5 text-center relative z-10">
            <Star className="h-5 w-5 mx-auto mb-2 text-green-500 animate-pulse" />
            <p className="text-sm font-heading font-black truncate text-green-600 dark:text-green-400">{bestSubject?.subject || "—"}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">החזק ביותר</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <CardContent className="py-5 text-center relative z-10">
            <TrendingUp className="h-5 w-5 mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-heading font-black truncate text-amber-600 dark:text-amber-400">
               {subjectSummaries[0]?.trend === "up" ? subjectSummaries[0].subject : "המשך כך!"}
            </p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">במגמת שיפור</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Insight Header */}
      <AnimatePresence>
        {(aiInsight || loadingInsight) ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 overflow-hidden">
              <CardContent className="py-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <BrainCircuit className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-heading font-bold text-primary flex items-center gap-1 mb-0.5">
                    <Sparkles className="h-3 w-3" /> תובנת מנטור AI
                  </p>
                  {loadingInsight ? (
                    <div className="flex gap-1 py-1">
                      {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />)}
                    </div>
                  ) : (
                    <p className="text-sm font-body italic leading-relaxed">{aiInsight}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
              <TabsTrigger value="overview" className="font-heading text-xs">סקירה</TabsTrigger>
              <TabsTrigger value="trend" className="font-heading text-xs">מגמה</TabsTrigger>
              <TabsTrigger value="list" className="font-heading text-xs">כל הציונים</TabsTrigger>
            </TabsList>
          </motion.div>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjectSummaries.map((ss) => (
                <Card 
                  key={ss.subject} 
                  className="group hover:shadow-md transition-all border-primary/5 cursor-pointer overflow-hidden relative"
                  onClick={() => { setSelectedSubject(ss.subject); setActiveTab("trend"); }}
                >
                  <div className="absolute top-0 left-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="h-4 w-4 text-primary" />
                  </div>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3 text-right">
                      <div className="text-left w-20">
                        <span className={`text-2xl font-heading font-black ${gradeColor(ss.weightedAvg)}`}>
                          {ss.weightedAvg}
                        </span>
                      </div>
                      <div className="text-right">
                        <h3 className="font-heading font-bold text-lg leading-none mb-1">{ss.subject}</h3>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                            {ss.count} מטלות
                          </span>
                          {ss.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                          {ss.trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
                        </div>
                      </div>
                    </div>
                    {/* Tiny Sparkline */}
                    <div className="h-8 w-full mt-2 opacity-40 group-hover:opacity-100 transition-opacity">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={ss.grades.slice(-5).map(g => ({ g: (g.grade/g.maxGrade)*100 }))}>
                          <Line type="monotone" dataKey="g" stroke="currentColor" strokeWidth={2} dot={false} strokeOpacity={0.8} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {subjectSummaries.length > 1 && (
              <motion.div variants={item}><Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center justify-end gap-2 text-right">
                    השוואה בין מקצועות
                    <Award className="h-5 w-5 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectSummaries.map(s => ({ name: s.subject, avg: s.weightedAvg }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} orientation="right" />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}`, "ממוצע"]} />
                        <ReferenceLine y={60} stroke="hsl(var(--destructive))" strokeDasharray="4 4" orientation="right" />
                        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                          {subjectSummaries.map((ss, i) => (
                            <Cell key={i} fill={ss.weightedAvg >= 90 ? "#22c55e" : "hsl(var(--primary))"} />
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
            <motion.div variants={item} className="flex items-center justify-end gap-3">
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
                  <CardTitle className="text-base font-heading flex items-center justify-end gap-2 text-right">
                    מגמת ציונים
                    {selectedSubject !== "all" && <Badge variant="outline" className="text-[10px]">{selectedSubject}</Badge>}
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} orientation="right" />
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
                </CardContent>
              </Card></motion.div>
            ) : (
              <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
                צריך לפחות 2 ציונים לתצוגת מגמה
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="list" className="space-y-4 mt-4">
            <motion.div variants={item} className="flex items-center justify-end gap-3 mb-2">
              <Badge variant="outline" className="text-[11px] font-medium">{filteredGrades.length} ציונים</Badge>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-48"><SelectValue placeholder="כל המקצועות" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המקצועות</SelectItem>
                  {subjectSummaries.map((ss) => <SelectItem key={ss.subject} value={ss.subject}>{ss.subject}</SelectItem>)}
                </SelectContent>
              </Select>
            </motion.div>

            {filteredGrades.map((g) => {
              const normalized = Math.round((g.grade / g.maxGrade) * 100);
              const vsClass = g.classAvg != null ? normalized - g.classAvg : null;
              return (
                <motion.div key={g.id} variants={item}><Card className="hover:shadow-md transition-all border-muted/50 overflow-hidden group">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center">
                      <div className={`w-1 md:w-1.5 self-stretch ${normalized >= 85 ? 'bg-green-500' : normalized >= 60 ? 'bg-primary' : 'bg-destructive'}`} />
                      <div className="flex-1 p-4 flex flex-col md:flex-row md:items-center gap-4 text-right">
                         
                         {/* Class Comparison Section (Left side in RTL) */}
                         <div className="flex items-center gap-6 md:border-l md:pl-6 border-muted/30 order-2 md:order-1">
                            <div className="flex flex-col items-center gap-2">
                              {vsClass !== null && (
                                <Badge variant={vsClass >= 0 ? "outline" : "destructive"} className={`h-6 text-[10px] font-black px-2 ${vsClass >= 0 ? "bg-green-500/10 text-green-600 border-green-200" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                                  {vsClass > 0 ? "+" : ""}{vsClass} vs כיתה
                                </Badge>
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                                onClick={() => { setAppealGrade(g); setAppealText(""); }}>
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="text-center min-w-[70px]">
                               <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1.5">ממוצע כיתה</p>
                               <div className="flex items-baseline justify-center gap-1">
                                  <span className="text-xl font-heading font-bold text-foreground/80">{g.classAvg ?? "—"}</span>
                                  <span className="text-[10px] text-muted-foreground">/100</span>
                               </div>
                            </div>
                         </div>

                         {/* Title & info (Middle) */}
                         <div className="flex-1 min-w-0 order-3 md:order-2">
                            <div className="flex items-center justify-end gap-2 mb-1">
                              <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1.5 font-bold uppercase tracking-tighter opacity-80">
                                {TYPE_LABELS[g.type] || g.type}
                              </Badge>
                              <h4 className="font-heading font-bold text-base truncate">{g.title}</h4>
                            </div>
                            <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                              {g.weight > 0 && <><span>{g.weight}% משקל</span><span className="opacity-40">•</span></>}
                              <span>{new Date(g.gradedAt).toLocaleDateString("he-IL")}</span>
                              <span className="opacity-40">•</span>
                              <span className="font-bold text-foreground/70">{g.subject}</span>
                            </div>
                            {g.feedback && !g.feedback.startsWith("[ערעור") && (
                              <p className="text-[11px] text-muted-foreground mt-2 italic border-l-2 border-primary/20 pl-2 py-0.5">
                                "{g.feedback}"
                              </p>
                            )}
                         </div>

                         {/* Grade Circle (Right side in RTL) */}
                         <div className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-2xl border-2 border-muted/20 bg-muted/5 order-1 md:order-3">
                            <span className={`text-2xl font-heading font-black leading-none ${gradeColor(normalized)}`}>{g.grade}</span>
                            {g.maxGrade !== 100 && <span className="text-[9px] text-muted-foreground mt-0.5">/{g.maxGrade}</span>}
                         </div>

                      </div>
                    </div>
                  </CardContent>
                </Card></motion.div>
              );
            })}
          </TabsContent>
        </Tabs>
      )}

      {/* Appeal Dialog */}
      <Dialog open={!!appealGrade} onOpenChange={(o) => { if (!o) setAppealGrade(null); }}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center justify-end gap-2">
              ערעור על ציון
              <MessageSquare className="h-5 w-5 text-primary" />
            </DialogTitle>
          </DialogHeader>
          <AnimatePresence>
          {appealGrade && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-heading font-medium text-sm">{appealGrade.title}</p>
                <p className="text-xs text-muted-foreground">{appealGrade.subject} • ציון: {appealGrade.grade}/{appealGrade.maxGrade}</p>
              </div>
              <Textarea 
                placeholder="לדוגמה: אשמח להבין למה ירדו נקודות בשאלה 4..."
                value={appealText} 
                onChange={(e) => setAppealText(e.target.value)}
                className="font-body text-sm resize-none text-right" 
                rows={3} 
              />
              <Button 
                className="w-full gap-2 font-heading" 
                onClick={sendAppeal} 
                disabled={sendingAppeal || !appealText.trim()}
              >
                {sendingAppeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rotate-180" />}
                {sendingAppeal ? "שולח..." : "שלח ערעור למורה"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">הפנייה תתועד במערכת ותישלח למורה הרלוונטי</p>
            </motion.div>
          )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default StudentGradesPage;
