import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowLeftRight, Loader2, CheckCircle2, Send } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const LiveFeedbackMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: sessions } = await supabase
        .from("live_sessions")
        .select("id, subject, session_date, class_id, classes:class_id(grade, class_number)")
        .eq("teacher_id", profile.id)
        .order("session_date", { ascending: false })
        .limit(5);

      if (sessions?.length) {
        const sessionIds = sessions.map((s: any) => s.id);
        const { data: liveQs } = await supabase
          .from("live_questions")
          .select("id, content, upvotes, is_answered, session_id")
          .in("session_id", sessionIds)
          .order("upvotes", { ascending: false });

        setQuestions((liveQs || []).map((q: any) => ({
          ...q, session: sessions.find((s: any) => s.id === q.session_id),
        })));
      }
      setLoading(false);
    };
    load();
  }, [profile.id]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === questions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(questions.map((q) => q.id)));
  };

  const convertToQuestions = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    if (!selectedIds.size) { toast({ title: "בחר שאלות להמרה", variant: "destructive" }); return; }
    setConverting(true);
    try {
      const selected = questions.filter((q) => selectedIds.has(q.id));
      const rows = selected.map((q, i) => ({
        assignment_id: assignmentId, question_type: "open" as any,
        question_text: q.content, options: [], correct_answer: "", explanation: "", points: 1, order_num: i,
      }));
      const { error } = await supabase.from("task_questions").insert(rows);
      if (error) throw error;
      setConverted(true);
      toast({ title: `${selected.length} שאלות הוזנו כמטלת חזרה! ✅` });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const publishAssignment = async () => {
    if (!assignmentId) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({ published: true }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "המטלה פורסמה לכיתה! 🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <StudioModeWrapper title="Live Feedback" description="הפיכת שאלות אמיתיות מהשיעור למטלת חזרה" icon={<MessageSquare className="h-6 w-6 text-info" />} onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground font-body">לא נמצאו שאלות משיעורים אחרונים</p>
            <p className="text-xs text-muted-foreground mt-1">שאלות שתלמידים שואלים בשיעור חי יופיעו כאן</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-body">
              {selectedIds.size > 0 ? `${selectedIds.size} שאלות נבחרו` : "בחר שאלות מהשיעורים האחרונים להפיכה למטלת חזרה"}
            </p>
            <Button variant="ghost" size="sm" className="text-xs" onClick={selectAll}>
              {selectedIds.size === questions.length ? "בטל הכל" : "בחר הכל"}
            </Button>
          </div>

          {questions.map((q) => (
            <Card key={q.id} className={`cursor-pointer transition-all ${selectedIds.has(q.id) ? "ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => toggleSelect(q.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-body">{q.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">{q.session?.subject}</Badge>
                      <span className="text-[10px] text-muted-foreground">👍 {q.upvotes}</span>
                      {q.is_answered && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success border-0">נענתה</Badge>}
                    </div>
                  </div>
                  {selectedIds.has(q.id) && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            {!converted ? (
              <Button className="gap-2 font-heading" onClick={convertToQuestions} disabled={converting || !selectedIds.size || !assignmentId}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                {converting ? "ממיר..." : `הפוך ${selectedIds.size || ""} שאלות למטלה`}
              </Button>
            ) : (
              <>
                <Badge variant="default" className="bg-success text-success-foreground self-center">✅ {selectedIds.size} שאלות נוספו</Badge>
                <Button className="gap-2 font-heading" onClick={publishAssignment} disabled={publishing || !assignmentId}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {publishing ? "שולח..." : "שגר משימה לכיתה"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default LiveFeedbackMode;
