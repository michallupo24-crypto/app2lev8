import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Check, Users, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";

interface TeacherAttendanceWidgetProps {
  profile: UserProfile;
}

const TeacherAttendanceWidget = ({ profile }: TeacherAttendanceWidgetProps) => {
  const navigate = useNavigate();
  const [todayLessonsCount, setTodayLessonsCount] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!profile.schoolId) return;
      const today = new Date().toISOString().split("T")[0];

      // Count how many lessons the teacher recorded today
      const { count } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", profile.id)
        .eq("lesson_date", today);

      setRecordedCount(count || 0);

      // Count how many timetable slots this teacher has today
      const dayOfWeek = new Date().getDay();
      const { count: slotsCount } = await supabase
        .from("timetable_slots")
        .select("id", { count: "exact", head: true })
        .eq("school_id", profile.schoolId)
        .eq("teacher_id", profile.id)
        .eq("day_of_week", dayOfWeek);

      setTodayLessonsCount(slotsCount || 0);
    };
    load();
  }, [profile.id, profile.schoolId]);

  const allDone = todayLessonsCount > 0 && recordedCount >= todayLessonsCount;

  return (
    <Card className={`border-2 ${allDone ? "border-success/30 bg-success/5" : "border-primary/20 bg-primary/5"}`}>
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${allDone ? "bg-success/10" : "bg-primary/10"}`}>
            {allDone ? <Check className="h-5 w-5 text-success" /> : <ClipboardList className="h-5 w-5 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm">
              {allDone ? "נוכחות הושלמה! ✓" : "הקראת שמות"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] gap-1 py-0.5">
                <Users className="h-3 w-3" />
                {recordedCount}/{todayLessonsCount} שיעורים
              </Badge>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={allDone ? "outline" : "default"}
          className="shrink-0 gap-1 font-heading"
          onClick={() => navigate("/dashboard/roll-call")}
        >
          {allDone ? "צפה" : "סמן"} <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default TeacherAttendanceWidget;
