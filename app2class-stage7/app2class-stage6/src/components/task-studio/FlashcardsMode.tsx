import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Loader2, Send, ChevronLeft, ChevronRight, Upload, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FlashCard {
  front: string;
  back: string;
}

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const FlashcardsMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (assignmentId) generateFromQuestions();
  }, [assignmentId]);

  const generateFromQuestions = async () => {
    if (!assignmentId) return;
    setLoading(true);
    const { data } = await supabase
      .from("task_questions")
      .select("question_text, correct_answer, options, question_type")
      .eq("assignment_id", assignmentId)
      .order("order_num");

    if (data?.length) {
      const generated: FlashCard[] = data.map((q: any) => ({
        front: q.question_text,
        back: q.correct_answer || (q.options?.[0] || ""),
      }));
      setCards(generated);
    }
    setLoading(false);
  };

  // Generate flashcards from PDF/file via AI
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assignmentId) return;
    setImporting(true);
    try {
      const path = `flashcard-imports/${assignmentId}/${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("lesson-files").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data, error } = await supabase.functions.invoke("task-studio-ai", {
        body: {
          action: "scan-file",
          prompt: `הקובץ "${file.name}" הועלה. צור כרטיסיות שינון (flashcards) מהחומר. לכל כרטיסייה: front (שאלה/מושג), back (תשובה/הסבר קצר). החזר JSON array של {front, back}.`,
          numQuestions: 20,
        },
      });
      if (error) throw error;

      const raw = data?.result;
      let generated: FlashCard[] = [];
      if (Array.isArray(raw)) {
        generated = raw.map((r: any) => ({ front: r.front || r.question_text || "", back: r.back || r.correct_answer || "" }));
      }
      if (generated.length > 0) {
        setCards(generated);
        // Also save as task_questions
        await supabase.from("task_questions").delete().eq("assignment_id", assignmentId);
        const rows = generated.map((c, i) => ({
          assignment_id: assignmentId,
          question_type: "open" as any,
          question_text: c.front,
          options: [],
          correct_answer: c.back,
          explanation: "",
          points: 1,
          order_num: i,
        }));
        await supabase.from("task_questions").insert(rows);
        toast({ title: `${generated.length} כרטיסיות נוצרו מהחומר! ✅` });
      } else {
        toast({ title: "לא הצלחתי לחלץ כרטיסיות מהקובץ", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publishFlashcards = async () => {
    if (!assignmentId) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({ published: true }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "כרטיסיות השינון פורסמו לכיתה! 📚🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const nextCard = () => { setFlipped(false); setCurrentIdx((prev) => Math.min(prev + 1, cards.length - 1)); };
  const prevCard = () => { setFlipped(false); setCurrentIdx((prev) => Math.max(prev - 1, 0)); };

  return (
    <StudioModeWrapper title="Flashcards" description="כרטיסיות שינון אוטומטיות מהחומר" icon={<Layers className="h-6 w-6 text-success" />} onBack={onBack}>
      <input type="file" ref={fileRef} accept=".pdf,.pptx,.docx,.txt" className="hidden" onChange={handleFileImport} />

      {!assignmentId ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-heading text-warning">⚠️ בחר משימה פעילה כדי ליצור כרטיסיות</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {/* Import from file */}
          <Button
            variant="outline"
            className="w-full gap-2 font-heading text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "יוצר כרטיסיות מהחומר..." : "ייצא כרטיסיות מ-PDF / מצגת (AI)"}
          </Button>

          {cards.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground font-body">אין כרטיסיות עדיין</p>
                <p className="text-xs text-muted-foreground mt-1">העלה קובץ למעלה, או הוסף שאלות דרך "הזנה ידנית"</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-center">
                <Badge variant="outline" className="text-xs">{currentIdx + 1} / {cards.length} כרטיסיות</Badge>
              </div>

              <div className="flex items-center justify-center gap-4">
                <Button variant="ghost" size="icon" onClick={prevCard} disabled={currentIdx === 0}>
                  <ChevronRight className="h-5 w-5" />
                </Button>

                <div className="cursor-pointer w-full max-w-md" onClick={() => setFlipped(!flipped)} style={{ perspective: "1000px" }}>
                  <motion.div
                    className="relative w-full h-64 rounded-2xl"
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20" style={{ backfaceVisibility: "hidden" }}>
                      <p className="text-lg font-heading font-bold text-center">{cards[currentIdx]?.front || "..."}</p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center p-6 rounded-2xl bg-gradient-to-br from-success/10 to-success/5 border-2 border-success/20" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                      <p className="text-lg font-heading font-bold text-center">{cards[currentIdx]?.back || "..."}</p>
                    </div>
                  </motion.div>
                  <p className="text-center text-xs text-muted-foreground mt-2 font-body">לחץ להפוך</p>
                </div>

                <Button variant="ghost" size="icon" onClick={nextCard} disabled={currentIdx === cards.length - 1}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex justify-center pt-2">
                <Button className="gap-2 font-heading" onClick={publishFlashcards} disabled={publishing}>
                  <Send className="h-4 w-4" /> {publishing ? "שולח..." : "שגר כרטיסיות לכיתה"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default FlashcardsMode;
