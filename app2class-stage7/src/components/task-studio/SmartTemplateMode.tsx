import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Plus, Eye, Upload, Send, Loader2, Trash2 } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

interface Section {
  title: string;
  points: number;
  questionCount: number;
}

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  points: number;
}

const TEMPLATES = [
  { id: "exam", label: "מבחן", icon: "📝", description: "מבחן עם חלקים, ניקוד וזמן" },
  { id: "worksheet", label: "דף עבודה", icon: "📄", description: "תרגילים עם שורות מילוי" },
  { id: "quiz", label: "בוחן קצר", icon: "⚡", description: "בוחן מהיר 5-10 שאלות" },
  { id: "table", label: "טבלת מיון", icon: "📊", description: "טבלה להשלמה ומיון" },
];

const SmartTemplateMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("45");
  const [sections, setSections] = useState<Section[]>([
    { title: "חלק א׳ - אמריקאי", points: 40, questionCount: 10 },
    { title: "חלק ב׳ - פתוח", points: 60, questionCount: 5 },
  ]);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [importedQuestions, setImportedQuestions] = useState<Question[]>([]);

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const path = `task-imports/${assignmentId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from("lesson-files").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke("task-studio-ai", {
        body: {
          action: "scan-file",
          prompt: `קובץ "${file.name}" הועלה. חלץ שאלות מהחומר לפי המבנה: question_text, question_type (multiple_choice/open/fill_blank), options (אם אמריקאי), correct_answer, points. החזר JSON array בלבד.`,
          numQuestions: sections.reduce((s, sec) => s + sec.questionCount, 0) || 15,
        },
      });
      if (error) throw error;

      const questions: Question[] = Array.isArray(data?.result) ? data.result : [];
      if (questions.length > 0) {
        setImportedQuestions(questions);
        const rows = questions.map((q, i) => ({
          assignment_id: assignmentId,
          question_type: (q.question_type || "multiple_choice") as any,
          question_text: q.question_text,
          options: q.options || [],
          correct_answer: q.correct_answer || "",
          explanation: "",
          points: q.points || 1,
          order_num: i,
        }));
        await supabase.from("task_questions").insert(rows);
        toast({ title: `${questions.length} שאלות יובאו מה-PDF! ✅` });
      } else {
        toast({ title: "לא הצלחתי לחלץ שאלות מהקובץ", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה בייבוא", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publishTemplate = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({
        published: true,
        description: JSON.stringify({ template: selectedTemplate, title, timeLimit, sections }),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "המשימה פורסמה לכיתה! 📝🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="טמפלטים חכמים" description="בניית מבחן/דף עבודה עם ייבוא מ-PDF" icon={<FileSpreadsheet className="h-6 w-6 text-primary" />} onBack={onBack}>
      <input type="file" ref={fileRef} accept=".pdf,.docx,.pptx" className="hidden" onChange={handlePdfImport} />

      {!selectedTemplate ? (
        <div className="space-y-4">
          {/* PDF import first — prominent */}
          <Card className="border-primary/30 bg-primary/5 cursor-pointer hover:shadow-md transition-all" onClick={() => fileRef.current?.click()}>
            <CardContent className="p-5 flex items-center gap-4">
              {importing ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Upload className="h-8 w-8 text-primary" />}
              <div>
                <h3 className="font-heading font-bold text-sm">ייבא מ-PDF / מצגת</h3>
                <p className="text-xs text-muted-foreground">AI יחלץ את השאלות ויהפוך אותן למשימה</p>
              </div>
              {importing && <Badge className="mr-auto">מייבא...</Badge>}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground text-center font-heading">— או בחר תבנית —</p>
          <div className="grid grid-cols-2 gap-4">
            {TEMPLATES.map((t) => (
              <Card key={t.id} className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => setSelectedTemplate(t.id)}>
                <CardContent className="p-6 text-center space-y-2">
                  <span className="text-4xl">{t.icon}</span>
                  <h3 className="font-heading font-bold text-sm">{t.label}</h3>
                  <p className="text-xs text-muted-foreground font-body">{t.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-heading">כותרת המשימה</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='מבחן יח׳ 5 - משוואות' className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-heading">זמן (דקות)</Label>
                  <Input type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className="h-9 text-xs" dir="ltr" />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-heading">חלקי המשימה</Label>
                {sections.map((sec, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border">
                    <Input value={sec.title} onChange={(e) => { const u = [...sections]; u[idx].title = e.target.value; setSections(u); }} className="h-8 text-xs flex-1" />
                    <div className="flex items-center gap-1">
                      <Input type="number" value={sec.points} onChange={(e) => { const u = [...sections]; u[idx].points = +e.target.value; setSections(u); }} className="h-8 text-xs w-16" dir="ltr" />
                      <span className="text-[10px] text-muted-foreground">נק׳</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input type="number" value={sec.questionCount} onChange={(e) => { const u = [...sections]; u[idx].questionCount = +e.target.value; setSections(u); }} className="h-8 text-xs w-14" dir="ltr" />
                      <span className="text-[10px] text-muted-foreground">שאלות</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSections(sections.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSections([...sections, { title: "", points: 0, questionCount: 0 }])}>
                  <Plus className="h-3 w-3" /> הוסף חלק
                </Button>
              </div>

              {importedQuestions.length > 0 && (
                <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                  <p className="text-xs text-success font-heading">✅ {importedQuestions.length} שאלות יובאו מ-PDF ומוכנות לשיגור</p>
                </div>
              )}
            </CardContent>
          </Card>

          {showPreview && (
            <Card className="border-info/30">
              <CardContent className="p-6 space-y-3">
                <h3 className="font-heading font-bold text-center text-lg">{title || "משימה"}</h3>
                <p className="text-center text-xs text-muted-foreground">זמן: {timeLimit} דקות | סה"כ: {sections.reduce((s, sec) => s + sec.points, 0)} נקודות</p>
                <hr />
                {sections.map((sec, idx) => (
                  <div key={idx} className="space-y-1">
                    <h4 className="font-heading font-bold text-sm">{sec.title} ({sec.points} נקודות)</h4>
                    {Array.from({ length: sec.questionCount }).map((_, qi) => (
                      <div key={qi} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                        <span className="text-xs text-muted-foreground w-6 shrink-0">{qi + 1}.</span>
                        {importedQuestions[qi] ? (
                          <p className="text-xs">{importedQuestions[qi].question_text}</p>
                        ) : (
                          <div className="h-3 bg-muted rounded flex-1" />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="gap-2 font-heading text-xs" onClick={() => setSelectedTemplate(null)}>
              חזור לתבניות
            </Button>
            <Button variant="outline" className="gap-2 font-heading text-xs" onClick={() => fileRef.current?.click()} disabled={importing || !assignmentId}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              ייבא מ-PDF
            </Button>
            <Button variant="secondary" className="gap-2 font-heading text-xs" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-4 w-4" /> {showPreview ? "סגור תצוגה" : "תצוגה מקדימה"}
            </Button>
            <Button className="gap-2 font-heading text-xs flex-1" onClick={publishTemplate} disabled={publishing || !assignmentId}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publishing ? "שולח..." : "שגר לכיתה"}
            </Button>
          </div>
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default SmartTemplateMode;
