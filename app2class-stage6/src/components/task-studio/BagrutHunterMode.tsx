import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, Search, Loader2, Sparkles } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SUBJECTS } from "@/lib/constants";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const BagrutHunterMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [numQuestions, setNumQuestions] = useState("5");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!subject) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: `אתה מומחה במערכת הבגרויות הישראלית. צור ${numQuestions} שאלות מסגנון בגרות במקצוע ${subject}${topic ? ` בנושא ${topic}` : ""}. לכל שאלה: question_text, question_type (multiple_choice), options (4 אפשרויות), correct_answer, explanation. החזר JSON array בלבד.`,
        },
      });
      if (error) throw error;
      const questions = typeof data === "string" ? JSON.parse(data) : data?.questions || data;
      setResults(Array.isArray(questions) ? questions : []);
      toast({ title: `נמצאו ${Array.isArray(questions) ? questions.length : 0} שאלות! 🎯` });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const importToAssignment = async () => {
    if (!assignmentId || !results.length) return;
    const rows = results.map((q: any, i: number) => ({
      assignment_id: assignmentId,
      question_type: q.question_type || ("multiple_choice" as any),
      question_text: q.question_text,
      options: q.options || [],
      correct_answer: q.correct_answer || "",
      explanation: q.explanation || "",
      points: 1,
      order_num: i,
    }));
    const { error } = await supabase.from("task_questions").insert(rows);
    if (error) toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    else toast({ title: `${results.length} שאלות יובאו למשימה! ✅` });
  };

  return (
    <StudioModeWrapper
      title="צייד הבגרויות"
      description="משיכת שאלות ממאגר הבגרויות המסונכרנות לחומר הלימוד"
      icon={<GraduationCap className="h-6 w-6 text-warning" />}
      badge="AI"
      onBack={onBack}
    >
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-heading">מקצוע</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="בחר מקצוע" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-heading">נושא (אופציונלי)</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="משוואות ריבועיות" className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-heading">כמות שאלות</Label>
              <Input type="number" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} className="h-9 text-xs" dir="ltr" min={1} max={20} />
            </div>
          </div>
          <Button className="w-full gap-2 font-heading" onClick={handleSearch} disabled={loading || !subject}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "מחפש שאלות..." : "חפש שאלות בגרות"}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-3 mt-4">
          {results.map((q: any, idx: number) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <p className="text-sm font-body font-medium mb-2">{idx + 1}. {q.question_text}</p>
                {q.options?.map((opt: string, i: number) => (
                  <p key={i} className={`text-xs font-body mr-4 ${opt === q.correct_answer ? "text-success font-bold" : "text-muted-foreground"}`}>
                    {String.fromCharCode(1488 + i)}. {opt}
                  </p>
                ))}
                {q.explanation && <p className="text-xs text-info mt-2 border-t pt-2">💡 {q.explanation}</p>}
              </CardContent>
            </Card>
          ))}
          <Button className="w-full gap-2 font-heading" onClick={importToAssignment} disabled={!assignmentId}>
            <Sparkles className="h-4 w-4" /> ייבא {results.length} שאלות למשימה
          </Button>
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default BagrutHunterMode;
