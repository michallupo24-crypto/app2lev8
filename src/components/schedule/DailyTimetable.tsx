import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import { HEBREW_DAYS } from "@/lib/constants";

interface TimetableSlot {
  id: string;
  day_of_week: number;
  lesson_number: number;
  subject: string;
  teacher_name: string | null;
  group_name: string | null;
  color: string;
  room: string | null;
}

interface BellSlot {
  lesson_number: number;
  label: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  break_duration_minutes: number | null;
}

interface StudentTrack {
  track_type: string;
  track_name: string;
}

const SCHOOL_DAYS = [0, 1, 2, 3, 4];

interface DailyTimetableProps {
  profile: UserProfile;
}

const DailyTimetable = ({ profile }: DailyTimetableProps) => {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [bell, setBell] = useState<BellSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"my" | "class">("my");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [studentTracks, setStudentTracks] = useState<StudentTrack[]>([]);
  const [currentDay, setCurrentDay] = useState(() => {
    const d = new Date().getDay();
    return d >= 0 && d <= 4 ? d : 0;
  });

  const isStudent = profile.roles.includes("student");
  const isParent = profile.roles.includes("parent");
  const isTeacher = profile.roles.some(r => ["educator", "professional_teacher", "subject_coordinator"].includes(r));
  const isCoordinator = profile.roles.includes("grade_coordinator");
  const isAdmin = profile.roles.some(r => ["management", "system_admin"].includes(r));

  // Load bell schedule (including breaks)
  useEffect(() => {
    if (!profile.schoolId) return;
    supabase.from("bell_schedule")
      .select("*")
      .eq("school_id", profile.schoolId)
      .order("lesson_number", { ascending: true })
      .then(({ data }) => {
        if (data) setBell(data.map((b: any) => ({
          lesson_number: b.lesson_number,
          label: b.label,
          start_time: b.start_time?.slice(0, 5),
          end_time: b.end_time?.slice(0, 5),
          is_break: b.is_break,
          break_duration_minutes: b.break_duration_minutes,
        })));
      });
  }, [profile.schoolId]);

  useEffect(() => {
    if (!isStudent && !isParent) return;
    const load = async () => {
      let studentId = profile.id;
      if (isParent) {
        const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id).limit(1);
        if (links?.[0]) studentId = links[0].student_id;
      }
      const { data } = await supabase.from("student_tracks").select("track_type, track_name").eq("user_id", studentId);
      if (data) setStudentTracks(data as StudentTrack[]);
    };
    load();
  }, [profile.id, isStudent, isParent]);

  useEffect(() => {
    if (!profile.schoolId || (!isCoordinator && !isAdmin && !isTeacher)) return;
    const load = async () => {
      if (isTeacher && !isCoordinator && !isAdmin) {
        const { data } = await supabase.from("teacher_classes")
          .select("class_id, classes(id, grade, class_number)")
          .eq("user_id", profile.id);
        if (data) setClasses(data.map((d: any) => ({ id: d.classes.id, grade: d.classes.grade, number: d.classes.class_number })));
      } else {
        const { data } = await supabase.from("classes")
          .select("id, grade, class_number")
          .eq("school_id", profile.schoolId!)
          .order("grade").order("class_number");
        if (data) setClasses(data.map((d: any) => ({ id: d.id, grade: d.grade, number: d.class_number })));
      }
    };
    load();
  }, [profile.schoolId, profile.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let classId: string | null = null;

      if (viewMode === "class" && selectedClassId) {
        classId = selectedClassId;
      } else if (isStudent || isParent) {
        let studentId = profile.id;
        if (isParent) {
          const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id).limit(1);
          if (links?.[0]) studentId = links[0].student_id;
        }
        const { data: p } = await supabase.from("profiles").select("class_id").eq("id", studentId).single();
        classId = p?.class_id || null;
      } else if (isTeacher && viewMode === "my") {
        const { data: byTeacherId } = await supabase.from("timetable_slots")
          .select("*")
          .eq("school_id", profile.schoolId!)
          .eq("teacher_id", profile.id)
          .order("day_of_week").order("lesson_number");

        if (byTeacherId && byTeacherId.length > 0) {
          setSlots(byTeacherId);
          setLoading(false);
          return;
        }

        const { data: tc } = await supabase.from("teacher_classes")
          .select("class_id")
          .eq("user_id", profile.id);
        if (tc && tc.length > 0) {
          const classIds = tc.map((t: any) => t.class_id);
          const { data: roleData } = await supabase.from("user_roles")
            .select("subject")
            .eq("user_id", profile.id)
            .not("subject", "is", null)
            .limit(1);
          const teacherSubject = roleData?.[0]?.subject;

          let query = supabase.from("timetable_slots")
            .select("*")
            .eq("school_id", profile.schoolId!)
            .in("class_id", classIds)
            .order("day_of_week").order("lesson_number");
          if (teacherSubject) {
            query = query.eq("subject", teacherSubject);
          }
          const { data: byClass } = await query;
          setSlots(byClass || []);
        } else {
          setSlots([]);
        }
        setLoading(false);
        return;
      }

      if (!classId && !selectedClassId) {
        setSlots([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase.from("timetable_slots")
        .select("*")
        .eq("school_id", profile.schoolId!)
        .eq("class_id", classId || selectedClassId!)
        .order("day_of_week").order("lesson_number");
      setSlots(data || []);
      setLoading(false);
    };
    load();
  }, [profile.id, profile.schoolId, viewMode, selectedClassId]);

  const pickSlot = useCallback((candidates: TimetableSlot[]): TimetableSlot | undefined => {
    if (candidates.length === 0) return undefined;
    if (studentTracks.length > 0) {
      for (const slot of candidates) {
        if (!slot.group_name) continue;
        const colonIdx = slot.group_name.indexOf(':');
        if (colonIdx === -1) continue;
        const prefix = slot.group_name.substring(0, colonIdx);
        const name = slot.group_name.substring(colonIdx + 1);
        const trackType = prefix === 'א' ? 'megama_a' : prefix === 'ב' ? 'megama_b' : null;
        if (trackType && studentTracks.some(t => t.track_type === trackType && t.track_name === name)) {
          return slot;
        }
      }
    }
    const ungrouped = candidates.find(s => !s.group_name);
    if (ungrouped) return ungrouped;
    if ((isAdmin || isCoordinator || isTeacher) && candidates.length > 0) {
      const prefix = candidates[0].group_name?.charAt(0);
      return {
        ...candidates[0],
        subject: prefix === 'א' ? "אשכול א'" : prefix === 'ב' ? "אשכול ב'" : "בחירה",
        group_name: null,
        teacher_name: null,
        color: prefix === 'א' ? '#F97316' : '#6366F1',
      };
    }
    return undefined;
  }, [studentTracks, isAdmin, isCoordinator, isTeacher]);

  const daySlots = useMemo(() => {
    return slots.filter(s => s.day_of_week === currentDay);
  }, [slots, currentDay]);

  const lessonBells = useMemo(() => {
    const map: Record<number, BellSlot> = {};
    for (const b of bell) if (!b.is_break) map[b.lesson_number] = b;
    return map;
  }, [bell]);

  const allLessons = useMemo(() => {
    const nums = new Set(daySlots.map(s => s.lesson_number));
    return Array.from(nums).sort((a, b) => a - b);
  }, [daySlots]);

  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayDow = now.getDay();
  const isToday = currentDay === todayDow;
  const isSchoolDay = todayDow >= 0 && todayDow <= 4;

  // Compute next break info
  const nextBreakInfo = useMemo(() => {
    if (!isSchoolDay || bell.length === 0) return null;
    // Find break entries that haven't ended yet
    const breakEntries = bell.filter(b => b.is_break && b.end_time > nowTime);
    if (breakEntries.length === 0) {
      // Also look for gaps between lessons (break = end of lesson N to start of lesson N+1)
      const lessons = bell.filter(b => !b.is_break).sort((a, b) => a.lesson_number - b.lesson_number);
      for (let i = 0; i < lessons.length - 1; i++) {
        const endCurrent = lessons[i].end_time;
        const startNext = lessons[i + 1].start_time;
        if (endCurrent < startNext && endCurrent > nowTime) {
          const durationMs = timeToMinutes(startNext) - timeToMinutes(endCurrent);
          return { label: `הפסקה אחרי שיעור ${lessons[i].lesson_number}`, startsAt: endCurrent, duration: durationMs };
        }
      }
      return null;
    }
    const next = breakEntries.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
    const dur = next.break_duration_minutes || (timeToMinutes(next.end_time) - timeToMinutes(next.start_time));
    const isNow = nowTime >= next.start_time && nowTime <= next.end_time;
    return { label: next.label || "הפסקה", startsAt: next.start_time, duration: dur, isNow };
  }, [bell, nowTime, isSchoolDay]);

  const getSlot = (lessonNum: number): TimetableSlot | undefined => {
    const candidates = daySlots.filter(s => s.lesson_number === lessonNum);
    return pickSlot(candidates);
  };

  const renderSlot = (slot: TimetableSlot | undefined, lessonNum: number) => {
    if (!slot) return <div className="h-full rounded-lg bg-muted/30 border border-border/30 min-h-[56px]" />;
    const b = lessonBells[lessonNum];
    const isNow = isToday && b && nowTime >= b.start_time && nowTime <= b.end_time;

    return (
      <div
        className={`rounded-xl p-3 border transition-all min-h-[56px] ${isNow ? "ring-2 ring-primary shadow-md" : ""}`}
        style={{
          backgroundColor: slot.color ? `${slot.color}22` : undefined,
          borderColor: slot.color ? `${slot.color}44` : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <p className="font-heading font-bold text-sm" style={{ color: slot.color || undefined }}>{slot.subject}</p>
          {isNow && <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px]" variant="outline">עכשיו</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1">
          {slot.teacher_name && <p className="text-xs text-muted-foreground">{slot.teacher_name}</p>}
          {slot.room && <p className="text-xs text-muted-foreground/70">חדר {slot.room}</p>}
        </div>
        {slot.group_name && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{slot.group_name}</p>}
      </div>
    );
  };

  const prevDay = () => setCurrentDay(d => d > 0 ? d - 1 : 4);
  const nextDay = () => setCurrentDay(d => d < 4 ? d + 1 : 0);

  return (
    <div className="space-y-4">
      {/* View controls for staff */}
      {(isTeacher || isCoordinator || isAdmin) && (
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {isTeacher && <SelectItem value="my">שלי</SelectItem>}
              <SelectItem value="class">כיתה</SelectItem>
            </SelectContent>
          </Select>
          {viewMode === "class" && classes.length > 0 && (
            <Select value={selectedClassId || ""} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-28"><SelectValue placeholder="בחר כיתה" /></SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={nextDay}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <div className="flex gap-1.5">
          {SCHOOL_DAYS.map(d => (
            <Button
              key={d}
              variant={currentDay === d ? "default" : "ghost"}
              size="sm"
              className={`text-xs px-3 py-2 ${todayDow === d && currentDay !== d ? "ring-2 ring-primary/30" : ""}`}
              onClick={() => setCurrentDay(d)}
            >
              {HEBREW_DAYS[d]}
              {todayDow === d && <span className="mr-1 text-[9px]">●</span>}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={prevDay}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Bell schedule button */}
      {bell.length > 0 && (
        <div className="flex justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Bell className="h-3.5 w-3.5" />
                צלצולים
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              {nextBreakInfo ? (
                <div className="space-y-2">
                  <p className="text-xs font-heading font-bold text-center">
                    {nextBreakInfo.isNow ? "🔔 עכשיו בהפסקה!" : "ההפסקה הבאה"}
                  </p>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-sm font-heading font-medium">{nextBreakInfo.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {nextBreakInfo.isNow ? "נגמרת ב-" : "מתחילה ב-"}{nextBreakInfo.startsAt}
                    </p>
                    <Badge className="mt-2" variant="secondary">
                      {nextBreakInfo.duration} דקות
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {isSchoolDay ? "אין עוד הפסקות היום" : "אין לימודים היום"}
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : allLessons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-body">אין שיעורים ביום {HEBREW_DAYS[currentDay]}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allLessons.map(num => {
            const slot = getSlot(num);
            const b = lessonBells[num];
            return (
              <div key={num} className="flex gap-3 items-stretch">
                <div className="w-14 shrink-0 text-center py-2 flex flex-col justify-center">
                  <p className="text-[10px] text-muted-foreground">{b?.start_time || ""}</p>
                  <p className="text-sm font-heading font-bold">{b?.label || `${num}`}</p>
                  <p className="text-[10px] text-muted-foreground">{b?.end_time || ""}</p>
                </div>
                <div className="flex-1">
                  {renderSlot(slot, num)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default DailyTimetable;
