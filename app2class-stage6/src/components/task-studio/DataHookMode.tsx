import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Gamepad2, CheckCircle2, ArrowDown } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const DataHookMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [autoGrade, setAutoGrade] = useState(true);
  const [includeAttempts, setIncludeAttempts] = useState(false);
  const [includeTime, setIncludeTime] = useState(true);
  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    if (!assignmentId) { toast({ title: "בחר משימה קודם", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Store data hook settings in the assignment description as metadata
      const { data: assignment } = await supabase.from("assignments").select("description").eq("id", assignmentId).single();
      let desc: any = {};
      try { desc = JSON.parse(assignment?.description || "{}"); } catch { desc = { text: assignment?.description || "" }; }
      desc.dataHook = { autoGrade, includeAttempts, includeTime };

      const { error } = await supabase.from("assignments").update({ description: JSON.stringify(desc) }).eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "הגדרות Data Hook נשמרו! ✅" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioModeWrapper title="Data Hook (ציונים)" description="הגדרת בוט למשיכת נתונים ממשחקים והזנתם אוטומטית כציונים" icon={<Gamepad2 className="h-6 w-6 text-success" />} onBack={onBack}>
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <div className="text-center p-3 rounded-xl bg-accent/10 border border-accent/20"><span className="text-2xl">🎮</span><p className="text-[10px] font-heading mt-1">משחק</p></div>
              <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
              <div className="text-center p-3 rounded-xl bg-info/10 border border-info/20"><span className="text-2xl">📊</span><p className="text-[10px] font-heading mt-1">נתונים</p></div>
              <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
              <div className="text-center p-3 rounded-xl bg-success/10 border border-success/20"><span className="text-2xl">📋</span><p className="text-[10px] font-heading mt-1">ציון</p></div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div><Label className="text-sm font-heading">הזנה אוטומטית של ציונים</Label><p className="text-[10px] text-muted-foreground">ציון יוזן ל-submissions ברגע שהמשחק נגמר</p></div>
                <Switch checked={autoGrade} onCheckedChange={setAutoGrade} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div><Label className="text-sm font-heading">שמור ניסיונות</Label><p className="text-[10px] text-muted-foreground">כל ניסיון נשמר, לא רק התוצאה הסופית</p></div>
                <Switch checked={includeAttempts} onCheckedChange={setIncludeAttempts} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div><Label className="text-sm font-heading">תיעוד זמן ביצוע</Label><p className="text-[10px] text-muted-foreground">שמור כמה זמן לקח לתלמיד להשלים</p></div>
                <Switch checked={includeTime} onCheckedChange={setIncludeTime} />
              </div>
            </div>

            <Button className="w-full gap-2 font-heading" onClick={saveSettings} disabled={saving || !assignmentId}>
              <CheckCircle2 className="h-4 w-4" /> {saving ? "שומר..." : "שמור הגדרות Data Hook"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </StudioModeWrapper>
  );
};

export default DataHookMode;
