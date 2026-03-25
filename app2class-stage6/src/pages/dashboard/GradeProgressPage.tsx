import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, BookOpen,
  Users, Brain, Activity, Loader2,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine,
} from "recharts";

interface ClassStat {
  classId: string;
  className: string;
  studentCount: number;
  avgGrade: number | null;
  gradeCount: number;
  subjects: string[];
}

interface SubjectComparison {
  subject: string;
  classes: { className: string; avg: number }[];
}

const GradeProgressPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [classes, setClasses] = useState<ClassStat[]>([]);
  const [subjectComparisons, setSubjectComparisons] = useState<SubjectComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: roleData } = await supabase
        .from("user_roles").select("grade").eq("user_id", profile.id).eq("role", "grade_coordinator").maybeSingle();
      if (!roleData?.grade || !profile.schoolId) { setLoading(false); return; }

      const { data: classesData } = await supabase
        .from("classes").select("id, grade, class_number").eq("school_id", profile.schoolId).eq("grade", roleData.grade);
      if (!classesData || classesData.length === 0) { setLoading(false); return; }

      const classIds = classesData.map((c: any) => c.id);

      const { data: students } = await supabase.from("profiles").select("id, class_id").in("class_id", classIds);
      const { data: submissions } = await supabase.from("submissions")
        .select("student_id, grade, assignments(subject, max_grade, class_id)")
        .eq("status", "graded").not("grade", "is", null);

      const filteredSubs = (submissions || []).filter((s: any) => classIds.includes(s.assignments?.class_id));

      // Per class stats
      const classStats: ClassStat[] = classesData.map((c: any) => {
        const classStudents = (students || []).filter((s: any) => s.class_id === c.id);
        const classSubs = filteredSubs.filter((s: any) => s.assignments?.class_id === c.id);
        const grades = classSubs.map((s: any) => (s.grade / (s.assignments?.max_grade || 100)) * 100);
        const avgGrade = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null;
        const uniqueSubjects = [...new Set(classSubs.map((s: any) => s.assignments?.subject).filter(Boolean))];

        return {
          classId: c.id,
          className: `${c.grade}'${c.class_number}`,
          studentCount: classStudents.length,
          avgGrade,
          gradeCount: classSubs.length,
          subjects: uniqueSubjects,
        };
      });
      setClasses(classStats);

      // Subject comparisons across classes
      const subjectMap = new Map<string, Map<string, number[]>>();
      filteredSubs.forEach((s: any) => {
        const subj = s.assignments?.subject;
        const classId = s.assignments?.class_id;
        const className = classesData.find((c: any) => c.id === classId);
        if (!subj || !className) return;
        const cn = `${className.grade}'${className.class_number}`;
        if (!subjectMap.has(subj)) subjectMap.set(subj, new Map());
        const classMap = subjectMap.get(subj)!;
        const norm = (s.grade / (s.assignments?.max_grade || 100)) * 100;
        const list = classMap.get(cn) || [];
        list.push(norm);
        classMap.set(cn, list);
      });

      const comparisons: SubjectComparison[] = [];
      subjectMap.forEach((classMap, subject) => {
        const classAvgs: { className: string; avg: number }[] = [];
        classMap.forEach((gs, cn) => {
          classAvgs.push({ className: cn, avg: Math.round(gs.reduce((a, b) => a + b, 0) / gs.length) });
        });
        if (classAvgs.length > 0) comparisons.push({ subject, classes: classAvgs });
      });
      setSubjectComparisons(comparisons.sort((a, b) => {
        const aAvg = a.classes.reduce((s, c) => s + c.avg, 0) / a.classes.length;
        const bAvg = b.classes.reduce((s, c) => s + c.avg, 0) / b.classes.length;
        return aAvg - bAvg; // weakest first
      }));

      setLoading(false);
    };
    load();
  }, [profile.id, profile.schoolId]);

  const loadAiAnalysis = async () => {
    setLoadingAi(true);
    try {
      const summary = classes.map(c => `כיתה ${c.className}: ממוצע ${c.avgGrade ?? "אין נתונים"}, ${c.studentCount} תלמידים`).join(". ");
      const { data } = await supabase.functions.invoke("grade-coordinator-ai", {
        body: { prompt: `נתח את הנתונים הבאים ותן המלצות תמציתיות: ${summary}`, action: "analyze_progress" },
      });
      setAiAnalysis(data?.message || "לא ניתן לטעון ניתוח");
    } catch {
      setAiAnalysis("שגיאה בטעינת הניתוח. נסה שוב.");
    } finally {
      setLoadingAi(false);
    }
  };

  const overallAvg = classes.length > 0 && classes.some(c => c.avgGrade !== null)
    ? Math.round(classes.filter(c => c.avgGrade !== null).reduce((s, c) => s + c.avgGrade!, 0) / classes.filter(c => c.avgGrade !== null).length)
    : null;

  const gradeColor = (g: number) => {
    if (g >= 85) return "text-green-600 dark:text-green-400";
    if (g >= 70) return "text-primary";
    if (g >= 55) return "text-yellow-600";
    return "text-destructive";
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (classes.length === 0) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground font-body">
      <BookOpen className="h-8 w-8 mr-3 opacity-30" />אין נתוני שכבה זמינים
    </div>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Activity className="h-7 w-7 text-primary" />דופק שכבתי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">ממוצעים, השוואת כיתות ותובנות AI</p>
      </motion.div>

      {/* KPI row */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className={`text-2xl font-heading font-bold ${overallAvg ? gradeColor(overallAvg) : ""}`}>
            {overallAvg ?? "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">ממוצע שכבתי</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-heading font-bold">{classes.reduce((s, c) => s + c.studentCount, 0)}</p>
          <p className="text-[10px] text-muted-foreground">תלמידים</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <BookOpen className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-heading font-bold">{classes.length}</p>
          <p className="text-[10px] text-muted-foreground">כיתות</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" />
          <p className="text-2xl font-heading font-bold text-destructive">
            {classes.filter(c => c.avgGrade !== null && c.avgGrade < 65).length}
          </p>
          <p className="text-[10px] text-muted-foreground">כיתות בסיכון</p>
        </CardContent></Card>
      </motion.div>

      {/* AI Analysis */}
      <motion.div variants={item}><Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />תובנות AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiAnalysis ? (
            <p className="text-sm font-body text-muted-foreground leading-relaxed">{aiAnalysis}</p>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground font-body flex-1">לחץ לניתוח AI של הנתונים השכבתיים</p>
              <Button size="sm" variant="outline" className="gap-2 font-heading shrink-0" onClick={loadAiAnalysis} disabled={loadingAi}>
                {loadingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                {loadingAi ? "מנתח..." : "נתח"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card></motion.div>

      {/* Class comparison chart */}
      <motion.div variants={item}><Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />השוואת ממוצעים בין כיתות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classes.filter(c => c.avgGrade !== null).map(c => ({ name: c.className, avg: c.avgGrade }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${v}`, "ממוצע"]} />
                <ReferenceLine y={overallAvg || 70} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: "ממוצע שכבה", position: "right", fontSize: 10 }} />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {classes.filter(c => c.avgGrade !== null).map((c, i) => (
                    <Cell key={i} fill={c.avgGrade! >= 85 ? "#22c55e" : c.avgGrade! >= 70 ? "hsl(var(--primary))" : c.avgGrade! >= 55 ? "#eab308" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card></motion.div>

      {/* Classes list */}
      <motion.div variants={item} className="space-y-2">
        {classes.map((c) => (
          <Card key={c.classId} className={c.avgGrade !== null && c.avgGrade < 65 ? "border-destructive/30" : ""}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-heading font-bold text-lg">{c.className}</span>
                    {c.avgGrade !== null && c.avgGrade < 65 && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="h-3 w-3" />דורשת תשומת לב
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{c.studentCount} תלמידים</span>
                    <span>•</span>
                    <span>{c.gradeCount} ציונים מוזנים</span>
                    {c.subjects.slice(0, 3).map(s => (
                      <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>
                    ))}
                  </div>
                  {c.avgGrade !== null && (
                    <div className="mt-2">
                      <Progress value={c.avgGrade} className="h-1.5" />
                    </div>
                  )}
                </div>
                <div className="text-left shrink-0">
                  {c.avgGrade !== null ? (
                    <>
                      <p className={`text-2xl font-heading font-bold ${gradeColor(c.avgGrade)}`}>{c.avgGrade}</p>
                      {overallAvg && (
                        <p className={`text-[10px] ${c.avgGrade > overallAvg ? "text-green-500" : c.avgGrade < overallAvg ? "text-destructive" : "text-muted-foreground"}`}>
                          {c.avgGrade > overallAvg ? "▲" : c.avgGrade < overallAvg ? "▼" : "="} {Math.abs(c.avgGrade - overallAvg)} מהממוצע
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">אין נתונים</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Subject comparisons */}
      {subjectComparisons.length > 0 && (
        <motion.div variants={item}><Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />מקצועות חלשים — השוואת כיתות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjectComparisons.slice(0, 3).map((sc) => (
              <div key={sc.subject}>
                <p className="font-heading font-medium text-sm mb-2">{sc.subject}</p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sc.classes}>
                      <XAxis dataKey="className" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${v}`, "ממוצע"]} />
                      <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                        {sc.classes.map((c, i) => (
                          <Cell key={i} fill={c.avg >= 75 ? "hsl(var(--primary))" : c.avg >= 60 ? "#eab308" : "hsl(var(--destructive))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </CardContent>
        </Card></motion.div>
      )}
    </motion.div>
  );
};

export default GradeProgressPage;
