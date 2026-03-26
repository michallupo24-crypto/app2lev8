import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folders, Upload, FileText, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const FolderScanMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    setLoading(true);
    const { data } = await supabase.storage.from("lesson-files").list("", { limit: 50 });
    setFiles((data || []).filter(f => f.name?.match(/\.(pdf|pptx?|docx?|txt)$/i)));
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `uploads/${profile.id}/${file.name}`;
      const { error } = await supabase.storage.from("lesson-files").upload(path, file, { upsert: true });
      if (error) throw error;
      toast({ title: `${file.name} הועלה בהצלחה! 📁` });
      loadFiles();
    } catch (err: any) {
      toast({ title: "שגיאה בהעלאה", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleScan = async (fileName: string) => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("task-studio-ai", {
        body: { action: "scan-file", prompt: `חלץ שאלות מקובץ בשם "${fileName}". צור שאלות מגוונות על בסיס שם הקובץ והנושא.`, numQuestions: 10 },
      });
      if (error) throw error;

      const questions = Array.isArray(data?.result) ? data.result : [];
      if (questions.length > 0) {
        const rows = questions.map((q: any, i: number) => ({
          assignment_id: assignmentId,
          question_type: q.question_type || ("multiple_choice" as any),
          question_text: q.question_text,
          options: q.options || [],
          correct_answer: q.correct_answer || "",
          explanation: q.explanation || "",
          points: 1,
          order_num: i,
        }));
        const { error: insertError } = await supabase.from("task_questions").insert(rows);
        if (insertError) throw insertError;
        setImportedCount(questions.length);
        toast({ title: `${questions.length} שאלות חולצו ונשמרו! ✅` });
      } else {
        toast({ title: "לא הצלחתי לחלץ שאלות", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה בסריקה", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <StudioModeWrapper title="סריקת תיקייה (AI)" description="הפיכת מצגות וקבצי PDF מהתיקייה הכיתתית למשימה" icon={<Folders className="h-6 w-6 text-accent" />} badge="AI" onBack={onBack}>
      <input type="file" ref={fileRef} accept=".pdf,.pptx,.ppt,.docx,.doc,.txt" className="hidden" onChange={handleUpload} />

      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
                <Folders className="h-8 w-8 text-accent" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-sm">סריקה חכמה של חומרי למידה</h3>
                <p className="text-xs text-muted-foreground font-body mt-1">העלה קבצים או בחר מהתיקייה - ה-AI יחלץ שאלות אוטומטית</p>
              </div>

              <Button variant="outline" className="gap-2 font-heading" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "מעלה..." : "העלה קובץ חדש"}
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : files.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">לא נמצאו קבצים בתיקייה</p>
                <p className="text-xs text-muted-foreground mt-1">העלה קבצי PDF, מצגות או מסמכים</p>
              </div>
            ) : (
              <div className="grid gap-2 mt-4">
                {files.map((file) => (
                  <div key={file.name} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-body">{file.name}</span>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 text-xs font-heading" onClick={() => handleScan(file.name)} disabled={scanning || !assignmentId}>
                      {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      סרוק
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {importedCount > 0 && (
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <h4 className="font-heading font-bold text-sm text-success">{importedCount} שאלות נוספו למשימה</h4>
                <p className="text-xs text-muted-foreground">עבור ל"הזנה ידנית" כדי לערוך ולעדכן</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </StudioModeWrapper>
  );
};

export default FolderScanMode;
