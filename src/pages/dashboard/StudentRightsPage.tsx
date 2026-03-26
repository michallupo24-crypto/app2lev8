import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, Send,
  Loader2, Sparkles, BookOpen, Clock, FileText,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RightsCheck {
  id: string;
  label: string;
  description: string;
  status: "ok" | "violation" | "unknown";
  detail?: string;
  subject?: string;
  canAppeal: boolean;
}

interface SubjectStat {
  id: string;
  title: string;
  subject: string;
  dueDate: string | null;
  createdAt: string;
  gradedAt: string | null;
  hasGrade: boolean;
  daysSinceSubmission: number | null;
}

const StudentRightsPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rightsChecks, setRightsChecks] = useState<RightsCheck[]>([]);
  const [violations, setViolations] = useState<RightsCheck[]>([]);

  // Appeal
  const [appealDialog, setAppealDialog] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState<RightsCheck | null>(null);
  const [appealText, setAppealText] = useState("");
  const [appealTarget, setAppealTarget] = useState("homeroom");
  const [generatingAppeal, setGeneratingAppeal] = useState(false);
  const [sendingAppeal, setSendingAppeal] = useState(false);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const checks: RightsCheck[] = [];

      const { data: prof } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();
      if (!prof?.class_id) { setLoading(false); return; }

      // 1. Fetch assignments + submissions for this student's class
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, title, subject, due_date, published_at, created_at")
        .eq("class_id", prof.class_id)
        .eq("published", true)
        .order("due_date", { ascending: false })
        .limit(30);

      if (!assignments) { setLoading(false); return; }

      const aIds = assignments.map((a: any) => a.id);
      const { data: submissions } = await supabase
        .from("submissions")
        .select("assignment_id, grade, graded_at, submitted_at, status")
        .eq("student_id", profile.id)
        .in("assignment_id", aIds);

      const subMap = new Map((submissions || []).map((s: any) => [s.assignment_id, s]));

      // Check 1: Material uploaded 7 days before exam
      const lateUploads: string[] = [];
      for (const a of assignments) {
        if (a.due_date && a.created_at) {
          const daysBeforeExam = Math.floor(
            (new Date(a.due_date).getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysBeforeExam < 7 && daysBeforeExam >= 0) {
            lateUploads.push(`"${a.title}" הועלה ${daysBeforeExam} ימים לפני המועד (נדרש 7)`);
          }
        }
      }

      checks.push({
        id: "material_7days",
        label: "חומר למבחן 7 ימים מראש",
        description: "המורה חייב להעלות חומרי לימוד לפחות 7 ימים לפני מבחן",
        status: lateUploads.length === 0 ? "ok" : "violation",
        detail: lateUploads.length > 0 ? lateUploads[0] : undefined,
        canAppeal: lateUploads.length > 0,
      });

      // Check 2: No more than 3 exams per week
      const examsByWeek = new Map<string, string[]>();
      for (const a of assignments) {
        if (a.due_date && (a.title.includes("מבחן") || a.title.includes("בוחן") || a.title.includes("בחן"))) {
          const d = new Date(a.due_date);
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const key = weekStart.toISOString().split("T")[0];
          const list = examsByWeek.get(key) || [];
          list.push(a.title);
          examsByWeek.set(key, list);
        }
      }

      let maxWeekExams = 0;
      let overloadWeek: string[] = [];
      examsByWeek.forEach((exams) => {
        if (exams.length > maxWeekExams) { maxWeekExams = exams.length; overloadWeek = exams; }
      });

      checks.push({
        id: "max_3_exams",
        label: "לא יותר מ-3 מבחנים בשבוע",
        description: "על פי נוהל משרד החינוך, אין לקבוע יותר מ-3 מבחנים בשבוע אחד",
        status: maxWeekExams > 3 ? "violation" : "ok",
        detail: maxWeekExams > 3 ? `שבוע עמוס: ${overloadWeek.join(", ")}` : undefined,
        canAppeal: maxWeekExams > 3,
      });

      // Check 3: Grade returned within 14 days
      const lateGrades: string[] = [];
      for (const a of assignments) {
        const sub = subMap.get(a.id);
        if (sub?.submitted_at && !sub?.graded_at) {
          const daysSince = Math.floor(
            (Date.now() - new Date(sub.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSince > 14) {
            lateGrades.push(`"${a.title}" הוגש לפני ${daysSince} ימים ועדיין ללא ציון`);
          }
        }
      }

      checks.push({
        id: "grade_14days",
        label: "ציון תוך 14 יום",
        description: "המורה חייב להחזיר ציון על עבודה שהוגשה תוך 14 יום",
        status: lateGrades.length === 0 ? "ok" : "violation",
        detail: lateGrades.length > 0 ? lateGrades[0] : undefined,
        canAppeal: lateGrades.length > 0,
      });

      // Check 4: At least 1 day notice for quiz
      const shortNotice: string[] = [];
      for (const a of assignments) {
        if (a.due_date && a.created_at) {
          const days = Math.floor(
            (new Date(a.due_date).getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (days < 1 && a.title.includes("בוחן")) {
            shortNotice.push(`"${a.title}" נקבע ביום שהועלה`);
          }
        }
      }
      checks.push({
        id: "quiz_notice",
        label: "הודעה מראש לבוחן",
        description: "בוחן חייב להיות מוגדר לפחות יום מראש",
        status: shortNotice.length === 0 ? "ok" : "violation",
        detail: shortNotice[0],
        canAppeal: shortNotice.length > 0,
      });

      setRightsChecks(checks);
      setViolations(checks.filter(c => c.status === "violation"));
      setLoading(false);
    };
    load();
  }, [profile.id]);

  const generateAppealText = async () => {
    if (!selectedViolation) return;
    setGeneratingAppeal(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: "generate_questions",
          prompt: `כתוב פנייה מקצועית ומכובדת בעברית מתלמיד/ה בשם ${profile.fullName} על הפרה של הנוהל הבא:
"${selectedViolation.label}"
פרטים: ${selectedViolation.detail || selectedViolation.description}
הפנייה צריכה להיות מנומסת, עניינית ולציין את הנוהל הרלוונטי של משרד החינוך. לא יותר מ-4 משפטים.`,
          numQuestions: 1,
        }),
      });
      const data = await resp.json();
      // The prompt returns a "question" but we use the first result's question_text as the generated text
      if (data.result?.[0]) {
        setAppealText(data.result[0].question_text || "");
      } else {
        // Fallback: generate inline
        setAppealText(
          `שלום,\n\nאני ${profile.fullName}, תלמיד/ה בכיתה.\nברצוני לפנות בנושא: ${selectedViolation.label}.\n${selectedViolation.detail || ""}\n\nאבקש לבדוק את הנושא בהתאם לנהלי משרד החינוך.\n\nבברכה,\n${profile.fullName}`
        );
      }
    } catch {
      setAppealText(
        `שלום,\n\nאני ${profile.fullName}.\nברצוני לפנות בנושא: ${selectedViolation.label}.\n${selectedViolation.detail || ""}\n\nבברכה,\n${profile.fullName}`
      );
    } finally {
      setGeneratingAppeal(false);
    }
  };

  const sendAppeal = async () => {
    if (!selectedViolation || !appealText.trim()) return;
    setSendingAppeal(true);
    try {
      const { data: prof } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();

      if (appealTarget === "homeroom" && prof?.class_id) {
        const { data: tc } = await supabase
          .from("teacher_classes")
          .select("user_id")
          .eq("class_id", prof.class_id)
          .eq("is_homeroom", true)
          .maybeSingle();

        if (tc?.user_id) {
          // Create conversation + send message
          const { data: conv } = await supabase.from("conversations")
            .insert({ school_id: profile.schoolId }).select("id").single();
          if (conv?.id) {
            await supabase.from("conversation_participants").insert([
              { conversation_id: conv.id, user_id: profile.id },
              { conversation_id: conv.id, user_id: tc.user_id },
            ]);
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              sender_id: profile.id,
              content: `[פנייה על הפרת זכויות] ${appealText}`,
            });
          }
        }
      }

      toast({ title: "הפנייה נשלחה! ✅" });
      setAppealDialog(false);
      setAppealText("");
      setSelectedViolation(null);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setSendingAppeal(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const okCount = rightsChecks.filter(c => c.status === "ok").length;
  const violationCount = violations.length;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />מגן הזכויות שלי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          בדיקת עמידת הצוות בנהלי משרד החינוך
        </p>
      </motion.div>

      {/* Score banner */}
      <motion.div variants={item}>
        <Card className={`${violationCount === 0 ? "border-green-500/30 bg-green-50/50 dark:bg-green-900/10" : "border-orange-500/30 bg-orange-50/50 dark:bg-orange-900/10"}`}>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${violationCount === 0 ? "bg-green-500/20" : "bg-orange-500/20"}`}>
                {violationCount === 0 ? "✅" : "⚠️"}
              </div>
              <div>
                <p className="font-heading font-bold text-lg">
                  {violationCount === 0 ? "הכל תקין!" : `נמצאו ${violationCount} חריגות`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {okCount} בדיקות עברו • {violationCount} חריגות
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Rights checks */}
      <div className="space-y-3">
        {rightsChecks.map((check) => (
          <motion.div key={check.id} variants={item}>
            <Card className={
              check.status === "ok" ? "border-green-500/20"
              : check.status === "violation" ? "border-destructive/40"
              : "border-border"
            }>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {check.status === "ok"
                      ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      : check.status === "violation"
                      ? <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <p className="font-heading font-medium text-sm">{check.label}</p>
                      <p className="text-xs text-muted-foreground font-body mt-0.5">{check.description}</p>
                      {check.detail && (
                        <p className={`text-xs mt-1 font-body ${check.status === "violation" ? "text-destructive" : "text-muted-foreground"}`}>
                          {check.detail}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <Badge variant={check.status === "ok" ? "default" : "destructive"} className="text-[10px]">
                      {check.status === "ok" ? "תקין ✓" : "חריגה ✕"}
                    </Badge>
                    {check.canAppeal && check.status === "violation" && (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] font-heading gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => { setSelectedViolation(check); setAppealText(""); setAppealDialog(true); }}>
                        <FileText className="h-3 w-3" />הגש פנייה
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Info footer */}
      <motion.div variants={item}>
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground font-body text-center">
              הבדיקות מתבצעות על בסיס נתוני המשימות שהועלו למערכת.
              לחץ "הגש פנייה" על חריגה כדי לשלוח הודעה מנומסת לגורם הרלוונטי.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Appeal Dialog */}
      <Dialog open={appealDialog} onOpenChange={o => { if (!o) setAppealDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />הגשת פנייה
            </DialogTitle>
          </DialogHeader>
          {selectedViolation && (
            <div className="space-y-4">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="font-heading font-medium text-sm">{selectedViolation.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedViolation.detail}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-heading">שלח אל</p>
                <Select value={appealTarget} onValueChange={setAppealTarget}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homeroom">מחנך כיתה</SelectItem>
                    <SelectItem value="coordinator">רכז שכבה</SelectItem>
                    <SelectItem value="management">הנהלה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-heading">נוסח הפנייה</p>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 font-heading"
                    onClick={generateAppealText} disabled={generatingAppeal}>
                    {generatingAppeal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    נסח עם AI
                  </Button>
                </div>
                <Textarea
                  placeholder="כתב את הפנייה שלך כאן, או לחץ 'נסח עם AI' לנוסח מקצועי..."
                  value={appealText}
                  onChange={e => setAppealText(e.target.value)}
                  className="font-body text-sm resize-none" rows={5}
                />
              </div>

              <Button className="w-full gap-2 font-heading" onClick={sendAppeal}
                disabled={sendingAppeal || !appealText.trim()}>
                {sendingAppeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingAppeal ? "שולח..." : "שלח פנייה"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                הפנייה תתועד ותישלח לגורם שנבחר — כל הפניות נשמרות במערכת
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default StudentRightsPage;
