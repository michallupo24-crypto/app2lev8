import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Lock, Clock, Shield, Calendar, Save } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const ScheduleLockMode = ({ profile, assignmentId, onBack }: Props) => {
  const { toast } = useToast();
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [lockDevice, setLockDevice] = useState(false);
  const [lockDuration, setLockDuration] = useState("45");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [oneAttempt, setOneAttempt] = useState(true);

  return (
    <StudioModeWrapper
      title="תזמון ונעילה"
      description="פרסום עתידי וחסימת מכשיר בזמן מבחן"
      icon={<Lock className="h-6 w-6 text-destructive" />}
      onBack={onBack}
    >
      <div className="space-y-4">
        {/* Scheduling */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="font-heading font-bold text-sm">תזמון פרסום</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-heading">תאריך פרסום</Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-heading">שעת פרסום</Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Device lock */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-destructive" />
              <h3 className="font-heading font-bold text-sm">נעילת מכשיר (מצב מבחן)</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm font-heading">חסום יציאה מהאפליקציה</Label>
                  <p className="text-[10px] text-muted-foreground">התלמיד לא יוכל לעבור לאפליקציות אחרות</p>
                </div>
                <Switch checked={lockDevice} onCheckedChange={setLockDevice} />
              </div>
              {lockDevice && (
                <div className="space-y-1 mr-6">
                  <Label className="text-xs font-heading">משך נעילה (דקות)</Label>
                  <Input type="number" value={lockDuration} onChange={(e) => setLockDuration(e.target.value)} className="h-9 text-xs w-24" dir="ltr" />
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm font-heading">ערבוב סדר שאלות</Label>
                  <p className="text-[10px] text-muted-foreground">כל תלמיד מקבל סדר שונה</p>
                </div>
                <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm font-heading">ערבוב אפשרויות</Label>
                  <p className="text-[10px] text-muted-foreground">סדר התשובות משתנה בין תלמידים</p>
                </div>
                <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm font-heading">ניסיון אחד בלבד</Label>
                  <p className="text-[10px] text-muted-foreground">אין אפשרות לחזור אחורה או לשנות תשובה</p>
                </div>
                <Switch checked={oneAttempt} onCheckedChange={setOneAttempt} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full gap-2 font-heading" disabled={!assignmentId} onClick={() => toast({ title: "הגדרות התזמון נשמרו! 🔒" })}>
          <Save className="h-4 w-4" /> שמור הגדרות
        </Button>
      </div>
    </StudioModeWrapper>
  );
};

export default ScheduleLockMode;
