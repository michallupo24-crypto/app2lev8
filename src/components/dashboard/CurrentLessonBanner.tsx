import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, MapPin, User, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import { motion } from "framer-motion";

interface BellSlot {
  lesson_number: number;
  start_time: string;
  end_time: string;
}

interface TimetableSlot {
  subject: string;
  teacher_name: string | null;
  room: string | null;
  group_name: string | null;
  color: string | null;
  lesson_number: number;
  day_of_week: number;
}

interface StudentTrack {
  track_type: string;
  track_name: string;
}

interface CurrentLessonBannerProps {
  profile: UserProfile;
}

const CurrentLessonBanner = ({ profile }: CurrentLessonBannerProps) => {
  const navigate = useNavigate();
  const [bell, setBell] = useState<BellSlot[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [studentTracks, setStudentTracks] = useState<StudentTrack[]>([]);
  const [now, setNow] = useState(new Date());
  const [attendanceStarted, setAttendanceStarted] = useState(false);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch bell schedule
  useEffect(() => {
    if (!profile.schoolId) return;
    supabase
      .from("bell_schedule")
      .select("lesson_number, start_time, end_time, is_break")
      .eq("school_id", profile.schoolId)
      .order("lesson_number")
      .then(({ data }) => {
        if (data) {
          setBell(
            data
              .filter((b: any) => !b.is_break)
              .map((b: any) => ({
                lesson_number: b.lesson_number,
                start_time: b.start_time?.slice(0, 5),
                end_time: b.end_time?.slice(0, 5),
              }))
          );
        }
      });
  }, [profile.schoolId]);

  // Fetch student tracks for group matching
  useEffect(() => {
    if (!profile.id) return;
    supabase
      .from("student_tracks")
      .select("track_type, track_name")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        if (data) setStudentTracks(data as StudentTrack[]);
      });
  }, [profile.id]);

  // Fetch timetable slots for student's class
  useEffect(() => {
    if (!profile.schoolId || !profile.id) return;
    const load = async () => {
      // Get student's class_id
      let studentId = profile.id;
      const isParent = profile.roles.includes("parent");
      if (isParent) {
        const { data: links } = await supabase
          .from("parent_student")
          .select("student_id")
          .eq("parent_id", profile.id)
          .limit(1);
        if (links?.[0]) studentId = links[0].student_id;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("id", studentId)
        .single();
      if (!p?.class_id) return;

      const { data } = await supabase
        .from("timetable_slots")
        .select("subject, teacher_name, room, group_name, color, lesson_number, day_of_week")
        .eq("school_id", profile.schoolId!)
        .eq("class_id", p.class_id);
      if (data) setSlots(data);
    };
    load();
  }, [profile.id, profile.schoolId, profile.roles]);

  // Pick correct slot based on student tracks (same logic as WeeklyTimetable)
  const pickSlot = useCallback(
    (candidates: TimetableSlot[]): TimetableSlot | undefined => {
      if (candidates.length === 0) return undefined;
      if (studentTracks.length > 0) {
        for (const slot of candidates) {
          if (!slot.group_name) continue;
          const colonIdx = slot.group_name.indexOf(":");
          if (colonIdx === -1) continue;
          const prefix = slot.group_name.substring(0, colonIdx);
          const name = slot.group_name.substring(colonIdx + 1);
          const trackType =
            prefix === "א" ? "megama_a" : prefix === "ב" ? "megama_b" : null;
          if (
            trackType &&
            studentTracks.some(
              (t) => t.track_type === trackType && t.track_name === name
            )
          ) {
            return slot;
          }
        }
      }
      return candidates.find((s) => !s.group_name);
    },
    [studentTracks]
  );

  // Check if teacher started attendance for this lesson
  useEffect(() => {
    if (!profile.schoolId) return;
    const dayOfWeek = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const currentBell = bell.find(
      (b) => currentTime >= b.start_time && currentTime <= b.end_time
    );
    if (!currentBell) return;

    const todayStr = now.toISOString().split("T")[0];
    supabase
      .from("lessons")
      .select("id")
      .eq("school_id", profile.schoolId)
      .eq("lesson_date", todayStr)
      .eq("lesson_number", currentBell.lesson_number)
      .limit(1)
      .then(({ data }) => {
        setAttendanceStarted(!!(data && data.length > 0));
      });
  }, [profile.schoolId, bell, now]);

  const currentLesson = useMemo(() => {
    if (bell.length === 0 || slots.length === 0) return null;

    const dayOfWeek = now.getDay();
    // Only show on school days (Sun-Thu = 0-4)
    if (dayOfWeek > 4) return null;

    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const currentBell = bell.find(
      (b) => currentTime >= b.start_time && currentTime <= b.end_time
    );
    if (!currentBell) return null;

    const candidates = slots.filter(
      (s) =>
        s.day_of_week === dayOfWeek &&
        s.lesson_number === currentBell.lesson_number
    );

    const slot = pickSlot(candidates);
    if (!slot) return null;

    return {
      ...slot,
      bellStart: currentBell.start_time,
      bellEnd: currentBell.end_time,
    };
  }, [bell, slots, now, pickSlot]);

  if (!currentLesson) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        className="border-primary/30 overflow-hidden relative cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate(`/dashboard/subjects/${encodeURIComponent(currentLesson.subject)}?tab=live`)}
        style={{
          background: currentLesson.color
            ? `linear-gradient(135deg, ${currentLesson.color}15, ${currentLesson.color}08)`
            : undefined,
        }}
      >
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-3">
            {/* Pulsing indicator */}
            <div className="relative shrink-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: currentLesson.color
                    ? `${currentLesson.color}25`
                    : "hsl(var(--primary) / 0.15)",
                }}
              >
                <BookOpen
                  className="h-5 w-5"
                  style={{
                    color: currentLesson.color || "hsl(var(--primary))",
                  }}
                />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-heading font-bold" style={{ color: currentLesson.color || undefined }}>
                שיעור {currentLesson.subject} מתקיים כרגע
              </p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {currentLesson.room && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    חדר {currentLesson.room}
                  </span>
                )}
                {currentLesson.teacher_name && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {currentLesson.teacher_name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {currentLesson.bellStart}–{currentLesson.bellEnd}
                </span>
              </div>
            </div>

            {attendanceStarted && (
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px] shrink-0 gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                נוכחות דווחה
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default CurrentLessonBanner;
