import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Loader2 } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const GradeComparisonMode = ({ profile, assignmentId, onBack }: Props) => {
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Get teacher's classes
      const { data: tc } = await supabase
        .from("teacher_classes")
        .select("class_id, classes(id, grade, class_number)")
        .eq("user_id", profile.id);

      if (!tc?.length) { setLoading(false); return; }

      const grades = [...new Set(tc.map((t: any) => t.classes.grade))];
      
      // Get all classes in same grades
      const { data: allClasses } = await supabase
        .from("classes")
        .select("id, grade, class_number")
        .in("grade", grades)
        .eq("school_id", profile.schoolId!);

      if (!allClasses?.length) { setLoading(false); return; }

      // Get assignment counts per class
      const { data: assignments } = await supabase
        .from("assignments")
        .select("class_id")
        .in("class_id", allClasses.map((c: any) => c.id))
        .eq("published", true);

      const counts: Record<string, number> = {};
      assignments?.forEach((a: any) => {
        counts[a.class_id] = (counts[a.class_id] || 0) + 1;
      });

      setClassData(
        allClasses.map((c: any) => ({
          ...c,
          taskCount: counts[c.id] || 0,
          isMine: tc.some((t: any) => t.classes.id === c.id),
        }))
      );
      setLoading(false);
    };
    load();
  }, [profile.id]);

  const maxCount = Math.max(...classData.map((c) => c.taskCount), 1);

  return (
    <StudioModeWrapper
      title="השוואה שכבתית"
      description="סטטוס משימות של כיתות מקבילות לשמירה על אחידות"
      icon={<Users className="h-6 w-6 text-primary" />}
      onBack={onBack}
    >
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {classData.sort((a, b) => a.grade.localeCompare(b.grade) || a.class_number - b.class_number).map((cls) => (
            <Card key={cls.id} className={cls.isMine ? "ring-1 ring-primary/30" : ""}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-16 text-center">
                  <p className="font-heading font-bold text-sm">{cls.grade}'{cls.class_number}</p>
                  {cls.isMine && <Badge className="text-[8px] bg-primary/10 text-primary border-0">שלי</Badge>}
                </div>
                <div className="flex-1">
                  <Progress value={(cls.taskCount / maxCount) * 100} className="h-3" />
                </div>
                <span className="font-heading font-bold text-sm w-12 text-left">{cls.taskCount}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </StudioModeWrapper>
  );
};

export default GradeComparisonMode;
