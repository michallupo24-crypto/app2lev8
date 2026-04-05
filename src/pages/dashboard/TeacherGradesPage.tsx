import { useState, useEffect, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Users, TrendingUp, TrendingDown, AlertTriangle, Award,
  Loader2, FileText, Save, CheckCircle2, BookOpen, Zap, Trophy,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";

interface ClassOption { id: string; grade: string; number: number; }
interface AssignmentOption { id: string; title: string; subject: string; type: string; maxGrade: number; weight: number; dueDate?: string; description?: string; }
interface StudentGrade { submissionId: string | null; studentId: string; studentName: string; grade: number | null; status: string; feedback: string | null; hasAppeal?: boolean; level?: number; badgeCount?: number; fileUrl?: string | null; gameResult?: { score: number; correctAnswers: number; totalAnswers: number; finalPosition: number; completedAt: string } | null; }
interface AssignmentMeta { isGame: boolean; gameType?: string; }
interface SubjectAvg { subject: string; avg: number; count: number; }

const TYPE_LABELS: Record<string, string> = {
  homework: "שיעורי בית", exam: "מבחן", quiz: "בוחן", project: "פרויקט", exercise: "תרגיל",
};

const PERCENTILE_BINS = [
  { label: "0-54", min: 0, max: 54, color: "hsl(var(--destructive))" },
  { label: "55-69", min: 55, max: 69, color: "#eab308" },
  { label: "70-84", min: 70, max: 84, color: "hsl(var(--primary))" },
  { label: "85-100", min: 85, max: 100, color: "#22c55e" },
];

const TeacherGradesPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [studentGrades, setStudentGrades] = useState<StudentGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradeEdits, setGradeEdits] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [saving, setSaving] = useState(false);
  const [showGrading, setShowGrading] = useState(false);
  const [subjectAvgs, setSubjectAvgs] = useState<SubjectAvg[]>([]);
  const [activeTab, setActiveTab] = useState("grade");
  const [assignmentMeta, setAssignmentMeta] = useState<AssignmentMeta>({ isGame: false });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  // Load classes
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("teacher_classes").select("class_id, classes(id, grade, class_number)").eq("user_id", profile.id);
      if (data) {
        const cls = data.map((d: any) => ({ id: d.classes.id, grade: d.classes.grade, number: d.classes.class_number }));
        setClasses(cls);
        if (cls.length > 0) setSelectedClass(cls[0].id);
      }
      setLoading(false);
    };
    load();
  }, [profile.id]);

  // Load assignments
  useEffect(() => {
    if (!selectedClass) return;
    const load = async () => {
      const { data } = await supabase.from("assignments")
        .select("id, title, subject, type, max_grade, weight_percent, due_date, description")
        .eq("teacher_id", profile.id).eq("class_id", selectedClass)
        .order("created_at", { ascending: false });
      if (data) {
        setAssignments(data.map((a: any) => ({
          id: a.id, title: a.title, subject: a.subject, type: a.type,
          maxGrade: a.max_grade || 100, weight: a.weight_percent || 0, dueDate: a.due_date,
        })));
        setSelectedAssignment(data.length > 0 ? data[0].id : "");
      }
    };
    load();
  }, [selectedClass, profile.id]);

  // Load student grades
  useEffect(() => {
    if (!selectedAssignment || !selectedClass) return;
    const load = async () => {
      setLoading(true);
      const { data: students } = await supabase.from("profiles").select("id, full_name").eq("class_id", selectedClass).order("full_name");
      const { data: submissions } = await supabase.from("submissions").select("id, student_id, grade, status, feedback, file_url, content").eq("assignment_id", selectedAssignment);
      // Detect if this is a game assignment
      const thisAssignment = assignments.find(a => a.id === selectedAssignment) as any;
      let isGame = false;
      let gameType: string | undefined;
      try {
        const descObj = thisAssignment?.description ? JSON.parse(thisAssignment.description) : null;
        if (descObj?.game) { isGame = true; gameType = descObj.game; }
      } catch { }
      setAssignmentMeta({ isGame, gameType });

      // Gamer stats
      const studentIds = (students || []).map(s => s.id);
      const { data: bData } = await supabase.from("user_badges").select("user_id").in("user_id", studentIds);
      const { data: sData } = await supabase.from("user_streaks").select("user_id, total_active_days").in("user_id", studentIds);

      const badgeMap = new Map<string, number>();
      bData?.forEach(b => badgeMap.set(b.user_id, (badgeMap.get(b.user_id) || 0) + 1));

      const streakMap = new Map<string, number>();
      sData?.forEach(s => streakMap.set(s.user_id, s.total_active_days || 0));

      const subMap = new Map((submissions || []).map((s: any) => [s.student_id, s]));
      setStudentGrades((students || []).map((st: any) => {
        const sub = subMap.get(st.id);
        const bCount = badgeMap.get(st.id) || 0;
        const activeDays = streakMap.get(st.id) || 0;
        const xp = (activeDays * 10) + (bCount * 100);
        const lvl = Math.floor(xp / 500) + 1;

        let gameResult = null;
        if (sub?.content) {
          try {
            const parsed = JSON.parse(sub.content);
            if (parsed?.type === "snakes-ladders") gameResult = parsed;
          } catch { }
        }
        return {
          submissionId: sub?.id || null, studentId: st.id, studentName: st.full_name,
          grade: sub?.grade ?? null, status: sub?.status || "draft", feedback: sub?.feedback || null,
          hasAppeal: sub?.feedback?.startsWith("[ערעור") || false,
          level: lvl,
          badgeCount: bCount,
          fileUrl: sub?.file_url ?? null,
          gameResult,
        };
      }));
      setGradeEdits({});
      setLoading(false);
    };
    load();
  }, [selectedAssignment, selectedClass]);

  // Load subject averages for analytics tab
  useEffect(() => {
    if (!selectedClass) return;
    const load = async () => {
      const { data } = await supabase.from("submissions")
        .select("grade, assignments(subject, max_grade, class_id)")
        .eq("status", "graded").not("grade", "is", null);
      if (!data) return;

      const classData = (data as any[]).filter((s: any) => s.assignments?.class_id === selectedClass);
      const bySubject = new Map<string, number[]>();

      classData.forEach((s: any) => {
        const subj = s.assignments?.subject;
        const maxG = s.assignments?.max_grade || 100;
        if (!subj) return;
        const norm = (s.grade / maxG) * 100;
        const list = bySubject.get(subj) || [];
        list.push(norm);
        bySubject.set(subj, list);
      });
      const avgs: SubjectAvg[] = [];
      bySubject.forEach((gs, subj) => {
        avgs.push({ subject: subj, avg: Math.round(gs.reduce((a, b) => a + b, 0) / gs.length), count: gs.length });
      });
      setSubjectAvgs(avgs.sort((a, b) => b.avg - a.avg));
    };
    load();
  }, [selectedClass]);

  const stats = useMemo(() => {
    const graded = studentGrades.filter((s) => s.grade !== null);
    if (graded.length === 0) return null;
    const assignment = assignments.find((a) => a.id === selectedAssignment);
    const maxG = assignment?.maxGrade || 100;
    const norms = graded.map((s) => (s.grade! / maxG) * 100);
    const sorted = [...norms].sort((a, b) => a - b);
    const avg = Math.round(sorted.reduce((s, g) => s + g, 0) / sorted.length);
    const median = Math.round(sorted[Math.floor(sorted.length / 2)]);
    const stdDev = Math.round(Math.sqrt(sorted.reduce((s, g) => s + (g - avg) ** 2, 0) / sorted.length));
    const weak = graded.filter((s) => (s.grade! / maxG) * 100 < 60).length;
    const strong = graded.filter((s) => (s.grade! / maxG) * 100 >= 90).length;
    const distribution = PERCENTILE_BINS.map((bin) => ({
      ...bin, count: norms.filter((g) => g >= bin.min && g <= bin.max).length,
    }));
    // All grade trend (sorted list)
    const gradeTrend = graded.map((sg, i) => ({
      name: sg.studentName.split(" ")[0],
      grade: Math.round((sg.grade! / maxG) * 100),
      avg,
    })).sort((a, b) => b.grade - a.grade);

    return { avg, median, stdDev, weak, strong, total: studentGrades.length, graded: graded.length, distribution, gradeTrend };
  }, [studentGrades, selectedAssignment, assignments]);

  const handleGradeChange = (studentId: string, field: "grade" | "feedback", value: string) => {
    setGradeEdits((prev) => ({
      ...prev,
      [studentId]: { grade: prev[studentId]?.grade || "", feedback: prev[studentId]?.feedback || "", [field]: value },
    }));
  };

  const saveGrades = async () => {
    setSaving(true);
    try {
      for (const [studentId, edit] of Object.entries(gradeEdits)) {
        const gradeNum = parseInt(edit.grade);
        if (isNaN(gradeNum)) continue;
        const existing = studentGrades.find((s) => s.studentId === studentId);
        if (existing?.submissionId) {
          await supabase.from("submissions").update({
            grade: gradeNum, feedback: edit.feedback || null,
            status: "graded" as any, graded_by: profile.id, graded_at: new Date().toISOString(),
          }).eq("id", existing.submissionId);
        } else {
          await supabase.from("submissions").insert({
            assignment_id: selectedAssignment, student_id: studentId,
            grade: gradeNum, feedback: edit.feedback || null, status: "graded" as any,
            graded_by: profile.id, graded_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
          });
        }
      }
      toast({ title: "הציונים נשמרו! ✅" });
      setShowGrading(false);
      setSelectedAssignment((prev) => { setTimeout(() => setSelectedAssignment(prev), 100); return ""; });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const gradeColor = (g: number) => {
    if (g >= 90) return "text-green-600 dark:text-green-400";
    if (g >= 75) return "text-primary";
    if (g >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-destructive";
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-primary" />ציונים וסטטיסטיקות
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">הזנת ציונים, ניתוח התפלגות וזיהוי תלמידים</p>
      </motion.div>

      <motion.div variants={item}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="grade" className="font-heading">הזנת ציונים</TabsTrigger>
            <TabsTrigger value="analytics" className="font-heading">אנליטיקה</TabsTrigger>
          </TabsList>

          {/* GRADE TAB */}
          <TabsContent value="grade" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-32"><SelectValue placeholder="כיתה" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                <SelectTrigger className="w-64"><SelectValue placeholder="בחר משימה" /></SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{TYPE_LABELS[a.type] || a.type} — {a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-2 font-heading" onClick={() => setShowGrading(true)} disabled={!selectedAssignment}>
                <FileText className="h-4 w-4" />הזן ציונים
              </Button>
              {assignmentMeta.isGame && studentGrades.some(sg => sg.gameResult) && (
                <Button variant="outline" className="gap-2 font-heading text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                  onClick={() => {
                    // Auto-fill grade edits from game scores
                    const autoEdits: Record<string, { grade: string; feedback: string }> = {};
                    studentGrades.forEach(sg => {
                      if (sg.gameResult) {
                        autoEdits[sg.studentId] = {
                          grade: sg.gameResult.score.toString(),
                          feedback: `🎮 ציון משחק אוטומטי — ${sg.gameResult.correctAnswers}/${sg.gameResult.totalAnswers} נכון`,
                        };
                      }
                    });
                    setGradeEdits(autoEdits);
                    setShowGrading(true);
                    toast({ title: "הציונים מולאו אוטומטית מתוצאות המשחק ✅", description: "עיין ואשר לפני השמירה" });
                  }}>
                  <Zap className="h-4 w-4" />הזן ציוני משחק אוטומטית
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : !selectedAssignment ? (
              <Card><CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-body">בחר כיתה ומשימה</p>
              </CardContent></Card>
            ) : (
              <>
                {/* Stats */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "ממוצע", val: stats.avg, col: gradeColor(stats.avg) },
                      { label: "חציון", val: stats.median, col: "text-primary" },
                      { label: "סט״ת", val: stats.stdDev, col: "" },
                      { label: "נכשלים (<60)", val: stats.weak, col: "text-destructive" },
                      { label: "מצטיינים (>90)", val: stats.strong, col: "text-green-600" },
                    ].map((s) => (
                      <Card key={s.label}><CardContent className="py-3 text-center">
                        <p className={`text-2xl font-heading font-bold ${s.col}`}>{s.val}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </CardContent></Card>
                    ))}
                  </div>
                )}

                {/* Distribution */}
                {stats && stats.graded > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-heading flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />התפלגות ציונים
                        <Badge variant="outline" className="text-[10px]">{stats.graded}/{stats.total} נבדקו</Badge>
                        {stats.weak > 0 && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />{stats.weak} נכשלים
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.distribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                              formatter={(v: any) => [`${v} תלמידים`, "כמות"]} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {stats.distribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Student list */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />ציוני תלמידים
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {studentGrades.map((sg) => {
                      const assignment = assignments.find((a) => a.id === selectedAssignment);
                      const maxG = assignment?.maxGrade || 100;
                      const normalized = sg.grade !== null ? Math.round((sg.grade / maxG) * 100) : null;
                      return (
                        <div key={sg.studentId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-heading text-sm truncate">{sg.studentName}</span>
                            <div className="flex items-center gap-1.5 mr-2">
                              <Badge variant="outline" className="h-5 text-[9px] gap-1 bg-primary/5 border-primary/20 text-primary">
                                <Zap className="h-2.5 w-2.5 fill-primary" />
                                LVL {sg.level}
                              </Badge>
                              <Badge variant="outline" className="h-5 text-[9px] gap-1 bg-yellow-500/5 border-yellow-500/20 text-yellow-600">
                                <Trophy className="h-2.5 w-2.5 fill-yellow-500/20" />
                                {sg.badgeCount}
                              </Badge>
                            </div>
                            {sg.hasAppeal && (
                              <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-300">⚠ ערעור</Badge>
                            )}
                            {sg.feedback && !sg.hasAppeal && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-32">💬 {sg.feedback}</span>
                            )}
                            {sg.gameResult && (
                              <Badge variant="outline" className="text-[9px] gap-1 border-green-300 text-green-600 bg-green-50 dark:bg-green-900/20 shrink-0">
                                🎮 {sg.gameResult.score}% • {sg.gameResult.correctAnswers}/{sg.gameResult.totalAnswers}
                              </Badge>
                            )}
                            {sg.fileUrl && !sg.gameResult && (
                              <a href={sg.fileUrl} target="_blank" rel="noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0">
                                📎 קובץ
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:text-primary"
                              onClick={() => navigate(`/dashboard/report/${sg.studentId}`)}
                              title="צפה בתעודת רבעון"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            {sg.grade !== null ? (
                              <>
                                <span className={`font-heading font-bold text-lg ${gradeColor(normalized!)}`}>{sg.grade}</span>
                                {maxG !== 100 && <span className="text-xs text-muted-foreground">/{maxG}</span>}
                                {normalized! >= 90 && <Award className="h-4 w-4 text-yellow-500" />}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">טרם הוזן</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics" className="space-y-4 mt-4">
            <div className="flex gap-3">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-36"><SelectValue placeholder="בחר כיתה" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {subjectAvgs.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">אין נתוני ציונים עדיין לכיתה זו</p>
              </CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />ממוצעים לפי מקצוע
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={subjectAvgs}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any) => [`${v}`, "ממוצע"]} />
                          <ReferenceLine y={60} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                          <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                            {subjectAvgs.map((s, i) => (
                              <Cell key={i} fill={s.avg >= 90 ? "#22c55e" : s.avg >= 75 ? "hsl(var(--primary))" : s.avg >= 60 ? "#eab308" : "hsl(var(--destructive))"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  {subjectAvgs.map((s) => (
                    <Card key={s.subject}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <p className="font-heading font-medium text-sm">{s.subject}</p>
                          <p className="text-[10px] text-muted-foreground">{s.count} ציונים מוזנים</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {s.avg < 60 && <Badge variant="destructive" className="text-[10px]">דורש תשומת לב</Badge>}
                          {s.avg >= 90 && <Badge className="text-[10px] bg-green-500">מעולה</Badge>}
                          <span className={`font-heading font-bold text-2xl ${s.avg >= 90 ? "text-green-600" : s.avg >= 75 ? "text-primary" : s.avg >= 60 ? "text-yellow-600" : "text-destructive"}`}>
                            {s.avg}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Grading Dialog */}
      <Dialog open={showGrading} onOpenChange={setShowGrading}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">הזנת ציונים</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {studentGrades.map((sg) => {
              const edit = gradeEdits[sg.studentId];
              const currentGrade = edit?.grade ?? (sg.grade?.toString() || "");
              const currentFeedback = edit?.feedback ?? (sg.feedback?.startsWith("[ערעור") ? "" : sg.feedback || "");
              const gradeNum = parseInt(currentGrade);
              const assignment = assignments.find(a => a.id === selectedAssignment);
              const maxG = assignment?.maxGrade || 100;

              return (
                <div key={sg.studentId} className="py-2 border-b border-border/50 last:border-0 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-sm flex-1 min-w-0 truncate">{sg.studentName}</span>
                    {sg.hasAppeal && <Badge variant="outline" className="text-[10px] text-orange-500 shrink-0">⚠ ערעור</Badge>}
                    <Input type="number" placeholder="ציון" className="w-20 text-center" dir="ltr"
                      min={0} max={maxG} value={currentGrade}
                      onChange={(e) => handleGradeChange(sg.studentId, "grade", e.target.value)} />
                    {!isNaN(gradeNum) && gradeNum > 0 && (
                      <span className={`text-xs font-heading font-bold ${gradeNum >= 90 ? "text-green-500" : gradeNum >= 60 ? "text-yellow-500" : "text-destructive"}`}>
                        {Math.round((gradeNum / maxG) * 100)}%
                      </span>
                    )}
                  </div>
                  <Input placeholder="משוב קצר..." className="text-xs" value={currentFeedback}
                    onChange={(e) => handleGradeChange(sg.studentId, "feedback", e.target.value)} />
                </div>
              );
            })}
            <Button className="w-full gap-2 font-heading" onClick={saveGrades}
              disabled={saving || Object.keys(gradeEdits).length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "שומר..." : `שמור ציונים (${Object.keys(gradeEdits).length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default TeacherGradesPage;
