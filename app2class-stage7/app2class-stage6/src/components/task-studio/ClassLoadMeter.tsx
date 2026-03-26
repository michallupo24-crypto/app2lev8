import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  profile: UserProfile;
  classId?: string; // If provided, show only this class
}

interface ClassLoad {
  id: string;
  label: string;
  homeworkThisWeek: number;
  examsThisWeek: number;
  total: number;
}

const ClassLoadMeter = ({ profile, classId }: Props) => {
  const [loadData, setLoadData] = useState<ClassLoad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: tc } = await supabase
        .from("teacher_classes")
        .select("class_id, classes(id, grade, class_number)")
        .eq("user_id", profile.id);

      if (!tc?.length) { setLoading(false); return; }
      const classIds = classId
        ? [classId]
        : tc.map((t: any) => t.classes.id);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Get all assignments (homework)
      const { data: assignments } = await supabase
        .from("assignments")
        .select("class_id, due_date, type")
        .in("class_id", classIds)
        .eq("published", true)
        .gte("due_date", weekAgo.toISOString())
        .lte("due_date", nextWeek.toISOString());

      // Get exams from grade_events table
      const { data: exams } = await supabase
        .from("grade_events")
        .select("class_id, event_date, event_type")
        .in("class_id", classIds)
        .eq("event_type", "exam")
        .gte("event_date", weekAgo.toISOString())
        .lte("event_date", nextWeek.toISOString());

      const map: Record<string, ClassLoad> = {};
      classIds.forEach((id: string) => {
        const cls = tc.find((t: any) => t.classes.id === id)?.classes;
        map[id] = {
          id,
          label: cls ? `${cls.grade}'${cls.class_number}` : id,
          homeworkThisWeek: 0,
          examsThisWeek: 0,
          total: 0,
        };
      });

      assignments?.forEach((a: any) => {
        if (map[a.class_id]) {
          map[a.class_id].homeworkThisWeek++;
          map[a.class_id].total++;
        }
      });

      exams?.forEach((e: any) => {
        if (map[e.class_id]) {
          map[e.class_id].examsThisWeek++;
          map[e.class_id].total++;
        }
      });

      setLoadData(Object.values(map));
      setLoading(false);
    };
    load();
  }, [profile.id, classId]);

  const getLoadLevel = (total: number, exams: number) => {
    if (exams >= 2 || total > 6) return { label: "עומס יתר!", color: "text-destructive", bg: "bg-destructive", value: 100 };
    if (exams === 1 || total > 3) return { label: "עמוס", color: "text-warning", bg: "bg-warning", value: 65 };
    return { label: "תקין", color: "text-success", bg: "bg-success", value: Math.min(total * 15, 40) };
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-heading font-bold text-sm flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-info" /> מדד עומס כיתתי (7 ימים)
      </h3>
      {loadData.length === 0 ? (
        <p className="text-xs text-muted-foreground">לא נמצאו כיתות</p>
      ) : (
        loadData.map((cls) => {
          const level = getLoadLevel(cls.total, cls.examsThisWeek);
          return (
            <Card key={cls.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading font-bold text-sm">{cls.label}</h4>
                    <Badge variant="outline" className={`text-[10px] ${level.color}`}>{level.label}</Badge>
                  </div>
                  {cls.total > 6 || cls.examsThisWeek >= 2
                    ? <AlertTriangle className="h-4 w-4 text-destructive" />
                    : <CheckCircle2 className="h-4 w-4 text-success" />
                  }
                </div>
                <Progress value={level.value} className="h-2 mb-2" />
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span>📝 {cls.homeworkThisWeek} מטלות</span>
                  <span className={cls.examsThisWeek > 0 ? "text-destructive font-bold" : ""}>
                    📋 {cls.examsThisWeek} מבחנים
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default ClassLoadMeter;
