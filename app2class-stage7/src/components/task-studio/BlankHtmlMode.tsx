import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Code2, Loader2, Sparkles, Send, CheckCircle2, Eye } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const BlankHtmlMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [inputCode, setInputCode] = useState("");
  const [optimizedCode, setOptimizedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Auto-optimize whenever the user pastes code (after 1.5s debounce)
  useEffect(() => {
    if (!inputCode.trim() || inputCode.length < 50) return;
    const timer = setTimeout(() => {
      autoOptimize(inputCode);
    }, 1500);
    return () => clearTimeout(timer);
  }, [inputCode]);

  const autoOptimize = async (code: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: `בצע אופטימיזציה לקוד HTML/JS הבא עבור שימוש בכיתה:
1. התאם לאייפד (responsive, touch-friendly)
2. הוסף מנגנון postMessage לשליחת ציונים: window.parent.postMessage({type:'score',score:X,total:Y},'*')
3. שפר UX עם אנימציות קלות ועיצוב נקי
4. הוסף RTL support לטקסט עברי
5. ודא שהקוד עובד בתוך iframe

הקוד:
${code}

החזר רק את הקוד המעודכן, ללא הסברים.`,
        },
      });
      if (error) throw error;
      const result = typeof data === "string" ? data : (data?.response || data?.content?.[0]?.text || "");
      if (result) {
        setOptimizedCode(result);
        toast({ title: "אופטימיזציה אוטומטית הושלמה ✨" });
      }
    } catch (err: any) {
      // Silent fail for auto-optimize
    } finally {
      setLoading(false);
    }
  };

  const publishHtml = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    const codeToPublish = optimizedCode || inputCode;
    if (!codeToPublish.trim()) { toast({ title: "הוסף קוד HTML קודם", variant: "destructive" }); return; }
    setPublishing(true);
    try {
      const { error } = await supabase.from("assignments").update({
        published: true,
        description: JSON.stringify({ type: "blank-html", code: codeToPublish }),
      }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "דף ה-HTML שוגר לכיתה! 🚀" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const codeToShow = optimizedCode || inputCode;

  return (
    <StudioModeWrapper
      title="Blank HTML Page"
      description="הדבק קוד HTML/JS — אופטימיזציה אוטומטית לאייפד ולכיתה"
      icon={<Code2 className="h-6 w-6 text-muted-foreground" />}
      badge="AI Auto"
      onBack={onBack}
    >
      <div className="space-y-4">
        <Card className="border-info/20 bg-info/5">
          <CardContent className="p-3 text-xs text-info flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            כאשר תדביק קוד, האופטימיזציה תרוץ אוטומטית — ניהול RTL, responsive, ושליחת ציונים via postMessage.
          </CardContent>
        </Card>

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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-heading">קוד מאופטמז</Label>
                {loading && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> מאפטם...</div>}
                {optimizedCode && !loading && <CheckCircle2 className="h-4 w-4 text-success" />}
              </div>
              {optimizedCode ? (
                <Textarea
                  value={optimizedCode}
                  onChange={(e) => setOptimizedCode(e.target.value)}
                  className="font-mono text-xs min-h-[350px] bg-slate-950 text-cyan-400 border-slate-700"
                  dir="ltr"
                />
              ) : (
                <div className="min-h-[350px] rounded-lg border bg-muted/30 flex items-center justify-center">
                  <div className="text-center">
                    <Code2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">האופטימיזציה תרוץ אוטומטית לאחר הדבקת קוד</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        {showPreview && codeToShow && (
          <Card className="border-info/30">
            <CardContent className="p-2">
              <iframe
                srcDoc={codeToShow}
                className="w-full h-96 rounded border-0"
                sandbox="allow-scripts allow-same-origin"
                title="תצוגה מקדימה"
              />
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 justify-end flex-wrap">
          {codeToShow && (
            <Button variant="outline" className="gap-2 font-heading text-xs" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-4 w-4" /> {showPreview ? "סגור תצוגה" : "תצוגה מקדימה"}
            </Button>
          )}
          <Button className="gap-2 font-heading" onClick={publishHtml} disabled={publishing || !assignmentId || !codeToShow.trim()}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {publishing ? "שולח..." : "שגר לכיתה"}
          </Button>
        </div>
      </div>
    </StudioModeWrapper>
  );
};

export default BlankHtmlMode;
