import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Cpu, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const AiOptimizationMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [inputCode, setInputCode] = useState("");
  const [optimizedCode, setOptimizedCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOptimize = async () => {
    if (!inputCode.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: `בצע אופטימיזציה לקוד HTML/JS הבא כדי:
1. להתאים לאייפד (responsive)
2. להוסיף מנגנון postMessage לשליחת ציונים
3. לשפר UX עם אנימציות ועיצוב נקי
4. להוסיף RTL support

הקוד:
${inputCode}

החזר רק את הקוד המעודכן, ללא הסברים.`,
        },
      });
      if (error) throw error;
      setOptimizedCode(typeof data === "string" ? data : data?.response || "");
      toast({ title: "הקוד אופטימז בהצלחה! ✨" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioModeWrapper
      title="AI Optimization"
      description="אופטימיזציה אוטומטית לקוד המורה להתאמה לאייפד"
      icon={<Cpu className="h-6 w-6 text-accent" />}
      badge="AI"
      onBack={onBack}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-heading">קוד מקורי</Label>
            <Textarea
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="הדבק כאן את קוד ה-HTML/JS שלך..."
              className="font-mono text-xs min-h-[350px] bg-slate-950 text-green-400 border-slate-700"
              dir="ltr"
            />
            <Button className="w-full gap-2 font-heading" onClick={handleOptimize} disabled={loading || !inputCode.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "מבצע אופטימיזציה..." : "אופטימז קוד"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-heading">קוד מאופטמז</Label>
              {optimizedCode && <CheckCircle2 className="h-4 w-4 text-success" />}
            </div>
            {optimizedCode ? (
              <Textarea
                value={optimizedCode}
                readOnly
                className="font-mono text-xs min-h-[350px] bg-slate-950 text-cyan-400 border-slate-700"
                dir="ltr"
              />
            ) : (
              <div className="min-h-[350px] rounded-lg border bg-muted/30 flex items-center justify-center">
                <div className="text-center">
                  <Cpu className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">הדבק קוד והפעל אופטימיזציה</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StudioModeWrapper>
  );
};

export default AiOptimizationMode;
