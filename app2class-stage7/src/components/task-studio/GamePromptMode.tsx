import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const GamePromptMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [questionsGenerated, setQuestionsGenerated] = useState(0);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!assignmentId) { toast({ title: "בחר משימה פעילה קודם", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("task-studio-ai", {
        body: {
          action: "game-design",
          prompt: `${prompt}

בנוסף לעיצוב המשחק, צור גם שאלות מותאמות. החזר JSON עם:
{
  "name": "שם המשחק",
  "description": "תיאור",
  "rules": ["כלל 1", "כלל 2"],
  "stages": 5,
  "questions_per_stage": 3,
  "scoring": "תיאור ניקוד",
  "questions": [{"question_text": "...", "question_type": "multiple_choice", "options": ["א","ב","ג","ד"], "correct_answer": "...", "explanation": "..."}]
}`,
        },
      });
      if (error) throw error;

      let parsed = data?.result;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed.replace(/```json|```/g, "").trim()); } catch {}
      }
      setResult(parsed);

      // Auto-insert questions if present
      if (parsed?.questions?.length && assignmentId) {
        const rows = parsed.questions.map((q: any, i: number) => ({
          assignment_id: assignmentId,
          question_type: (q.question_type || "multiple_choice") as any,
          question_text: q.question_text,
          options: q.options || [],
          correct_answer: q.correct_answer || "",
          explanation: q.explanation || "",
          points: 1,
          order_num: i,
        }));
        await supabase.from("task_questions").insert(rows);
        setQuestionsGenerated(rows.length);
        toast({ title: `המשחק עוצב ו-${rows.length} שאלות נוצרו! 🎮` });
      } else {
        toast({ title: "המשחק עוצב! 🎮" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const publishGame = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({
        published: true,
        description: typeof result === "string" ? result : JSON.stringify(result),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "המשחק שוגר לכיתה! 🎮🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="Game Prompt (AI)" description="תיאור חופשי לבוט שימציא ויבנה משחק ייעודי" icon={<Sparkles className="h-6 w-6 text-accent" />} badge="AI" onBack={onBack}>
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Wand2 className="h-8 w-8 text-accent" />
              </div>
              <h3 className="font-heading font-bold">תאר את המשחק שאתה רוצה</h3>
              <p className="text-xs text-muted-foreground font-body mt-1">כתוב בשפה חופשית מה המשחק, הנושא, כמה שלבים — ה-AI ייצור גם שאלות</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-heading">תיאור המשחק</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='למשל: "משחק חידון על מלחמת העצמאות עם 10 שלבים, כל שלב שאלה עם 4 תשובות, תמונות של מנהיגים, וטיימר של 20 שניות"'
                rows={5}
                className="text-sm"
              />
            </div>
            {!assignmentId && (
              <p className="text-xs text-warning font-heading">⚠️ בחר משימה פעילה מהתפריט העליון לפני יצירת המשחק</p>
            )}
            <Button className="w-full gap-2 font-heading" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "הבוט מעצב משחק..." : "צור עיצוב משחק + שאלות"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="border-accent/30">
            <CardContent className="p-5">
              <h4 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" /> עיצוב המשחק
                {questionsGenerated > 0 && (
                  <Badge className="bg-success text-success-foreground text-[10px]">✅ {questionsGenerated} שאלות נוצרו</Badge>
                )}
              </h4>
              <div className="bg-muted/30 rounded-lg p-4 max-h-80 overflow-y-auto space-y-2">
                {typeof result === "object" ? (
                  <>
                    <h5 className="font-heading font-bold">{result.name || "משחק"}</h5>
                    <p className="text-sm text-muted-foreground">{result.description}</p>
                    {result.rules?.length > 0 && (
                      <div>
                        <p className="text-xs font-heading font-bold mb-1">כללים:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {result.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <Card className="text-center p-2"><p className="text-lg font-bold">{result.stages || 5}</p><p className="text-[10px] text-muted-foreground">שלבים</p></Card>
                      <Card className="text-center p-2"><p className="text-lg font-bold">{result.questions_per_stage || 3}</p><p className="text-[10px] text-muted-foreground">שאלות/שלב</p></Card>
                      <Card className="text-center p-2"><p className="text-xs font-bold">{result.scoring || "ניקוד"}</p><p className="text-[10px] text-muted-foreground">ניקוד</p></Card>
                    </div>
                  </>
                ) : (
                  <div className="prose prose-sm max-w-none"><ReactMarkdown>{String(result)}</ReactMarkdown></div>
                )}
              </div>
              <Button className="w-full gap-2 font-heading mt-4" onClick={publishGame} disabled={publishing || !assignmentId}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {publishing ? "שולח..." : "שגר משחק לכיתה"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </StudioModeWrapper>
  );
};

export default GamePromptMode;
