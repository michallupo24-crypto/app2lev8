import { useOutletContext, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Radio, FileText, MessageSquare } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useStudentSubjects } from "@/hooks/useStudentSubjects";

interface TimetableSubject {
  subject: string;
  color: string | null;
}

const SubjectHubsPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const { subjects: studentSubjects } = useStudentSubjects(profile.id, profile.schoolId);
  const [timetableSubjects, setTimetableSubjects] = useState<TimetableSubject[]>([]);
  const [currentSubject, setCurrentSubject] = useState<string | null>(null);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  // Fetch subjects from timetable
  useEffect(() => {
    if (!profile.schoolId || !profile.id) return;
    const load = async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", profile.id)
        .single();
      if (!p?.class_id) return;

      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("subject, color")
        .eq("school_id", profile.schoolId!)
        .eq("class_id", p.class_id);

      if (slots) {
        const uniqueMap = new Map<string, string | null>();
        slots.forEach((s: any) => {
          if (!uniqueMap.has(s.subject)) uniqueMap.set(s.subject, s.color);
        });
        setTimetableSubjects(
          Array.from(uniqueMap.entries()).map(([subject, color]) => ({ subject, color }))
        );
      }
    };
    load();
  }, [profile.id, profile.schoolId]);

  // Check current lesson
  useEffect(() => {
    if (!profile.schoolId || !profile.id) return;
    const load = async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", profile.id)
        .single();
      if (!p?.class_id) return;

      const { data: bells } = await supabase
        .from("bell_schedule")
        .select("lesson_number, start_time, end_time, is_break")
        .eq("school_id", profile.schoolId!)
        .order("lesson_number");

      if (!bells) return;

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const dayOfWeek = now.getDay();
      if (dayOfWeek > 4) return;

      const currentBell = bells.find(
        (b: any) => !b.is_break && currentTime >= b.start_time?.slice(0, 5) && currentTime <= b.end_time?.slice(0, 5)
      );
      if (!currentBell) return;

      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("subject, group_name")
        .eq("school_id", profile.schoolId!)
        .eq("class_id", p.class_id)
        .eq("day_of_week", dayOfWeek)
        .eq("lesson_number", currentBell.lesson_number);

      if (slots && slots.length > 0) {
        // Pick the right slot (simplified - first non-group or matching group)
        const slot = slots.find((s: any) => !s.group_name) || slots[0];
        if (slot) setCurrentSubject(slot.subject);
      }
    };
    load();
  }, [profile.id, profile.schoolId]);

  // Show only the student's personal subjects, with colors from timetable
  const subjects = useMemo(() => {
    const colorMap = new Map<string, string | null>();
    timetableSubjects.forEach(ts => {
      if (!colorMap.has(ts.subject)) colorMap.set(ts.subject, ts.color);
    });

    return studentSubjects.map(s => ({
      name: s,
      color: colorMap.get(s) || null,
      isLive: s === currentSubject,
    }));
  }, [timetableSubjects, studentSubjects, currentSubject]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          המקצועות שלי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">לחצ/י על מקצוע לצפייה בחומרים, ציונים ושיעור חי</p>
      </motion.div>

      {subjects.length === 0 ? (
        <motion.div variants={item}>
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-heading font-medium">אין מקצועות במערכת עדיין</p>
              <p className="text-sm mt-1">המקצועות יופיעו כאן ברגע שמערכת השעות שלך תוזן</p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <motion.div key={subject.name} variants={item}>
              <Card
                className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 group relative overflow-hidden"
                onClick={() => navigate(
                  `/dashboard/subjects/${encodeURIComponent(subject.name)}${subject.isLive ? "?tab=live" : ""}`
                )}
              >
                {subject.isLive && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 animate-pulse" />
                )}
                <CardContent className="py-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: subject.color || "hsl(var(--primary))" }}
                      />
                      <h3 className="font-heading font-bold text-lg">{subject.name}</h3>
                    </div>
                    {subject.isLive && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1" variant="outline">
                        <Radio className="h-3 w-3" />
                        LIVE
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    חומרי לימוד · ציונים · צ'אט כיתתי
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default SubjectHubsPage;
