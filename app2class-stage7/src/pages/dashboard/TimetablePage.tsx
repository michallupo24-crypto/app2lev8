import { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
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
}

interface StudentTrack {
  track_type: string;
  track_name: string;
}

const SCHOOL_DAYS = [0, 1, 2, 3, 4]; // Sun-Thu

const TimetablePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const isMobile = useIsMobile();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [bell, setBell] = useState<BellSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"my" | "class">("my");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [studentTracks, setStudentTracks] = useState<StudentTrack[]>([]);
  const [mobileDay, setMobileDay] = useState(() => {
    const d = new Date().getDay();
    return d >= 0 && d <= 4 ? d : 0;
  });

  const isStudent = profile.roles.includes("student");
  const isParent = profile.roles.includes("parent");
  const isTeacher = profile.roles.some(r => ["educator", "professional_teacher", "subject_coordinator"].includes(r));
  const isCoordinator = profile.roles.includes("grade_coordinator");
  const isAdmin = profile.roles.some(r => ["management", "system_admin"].includes(r));

  // Load bell schedule
  useEffect(() => {
    if (!profile.schoolId) return;
    supabase.from("bell_schedule")
      .select("*")
      .eq("school_id", profile.schoolId)
      .order("lesson_number", { ascending: true })
      .then(({ data }) => {
        if (data) setBell(data.filter((b: any) => !b.is_break).map((b: any) => ({
          lesson_number: b.lesson_number,
          label: b.label,
          start_time: b.start_time?.slice(0, 5),
          end_time: b.end_time?.slice(0, 5),
          is_break: b.is_break,
        })));
      });
  }, [profile.schoolId]);

  // Load student tracks for personalization
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

  // Load classes for coordinators/admins
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

  // Load timetable slots
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
        const { data } = await supabase.from("timetable_slots")
          .select("*")
          .eq("school_id", profile.schoolId!)
          .eq("teacher_id", profile.id)
          .order("day_of_week").order("lesson_number");
        setSlots(data || []);
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

  // Pick best slot for a student based on their tracks
  const pickSlot = useCallback((candidates: TimetableSlot[]): TimetableSlot | undefined => {
    if (candidates.length === 0) return undefined;

    // If student has tracks, try to find matching elective
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

    // Fallback: non-grouped slot
    const ungrouped = candidates.find(s => !s.group_name);
    if (ungrouped) return ungrouped;

    // For admin/coordinator/teacher class view: show cluster summary
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

  // Group by day
  const slotsByDay = useMemo(() => {
    const map: Record<number, TimetableSlot[]> = {};
    for (const day of SCHOOL_DAYS) map[day] = [];
    for (const s of slots) {
      if (map[s.day_of_week]) map[s.day_of_week].push(s);
    }
    return map;
  }, [slots]);

  const bellMap = useMemo(() => {
    const map: Record<number, BellSlot> = {};
    for (const b of bell) map[b.lesson_number] = b;
    return map;
  }, [bell]);

  // Find all lesson numbers used
  const allLessons = useMemo(() => {
    const nums = new Set(slots.map(s => s.lesson_number));
    return Array.from(nums).sort((a, b) => a - b);
  }, [slots]);

  // Current lesson indicator
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const renderSlot = (slot: TimetableSlot | undefined, lessonNum: number) => {
    if (!slot) return <div className="h-full rounded-lg bg-muted/30 border border-border/30 min-h-[48px]" />;
    const b = bellMap[lessonNum];
    const isNow = currentDay === slot.day_of_week && b && currentTime >= b.start_time && currentTime <= b.end_time;

    return (
      <div
        className={`rounded-lg p-2 text-xs border transition-all min-h-[48px] ${isNow ? "ring-2 ring-primary shadow-md" : ""}`}
        style={{
          backgroundColor: slot.color ? `${slot.color}22` : undefined,
          borderColor: slot.color ? `${slot.color}44` : undefined,
        }}
      >
        <p className="font-heading font-bold truncate text-[11px]" style={{ color: slot.color || undefined }}>{slot.subject}</p>
        {slot.teacher_name && <p className="text-[9px] text-muted-foreground truncate">{slot.teacher_name}</p>}
        {slot.group_name && <p className="text-[9px] text-muted-foreground/70 truncate">{slot.group_name}</p>}
        {slot.room && <p className="text-[9px] text-muted-foreground/50">{slot.room}</p>}
      </div>
    );
  };

  // Helper to get the resolved slot for a (day, lessonNumber)
  const getSlot = (day: number, lessonNum: number): TimetableSlot | undefined => {
    const candidates = slotsByDay[day]?.filter(s => s.lesson_number === lessonNum) || [];
    return pickSlot(candidates);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Calendar className="h-7 w-7 text-primary" />
            מערכת שעות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            {isStudent ? "המערכת האישית שלך" : isParent ? "מערכת הילד/ה" : "מערכת שעות"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {(isTeacher || isCoordinator || isAdmin) && (
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {isTeacher && <SelectItem value="my">שלי</SelectItem>}
                <SelectItem value="class">כיתה</SelectItem>
              </SelectContent>
            </Select>
          )}
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
      </div>

      {/* Bell schedule summary */}
      {bell.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> לוח צלצולים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {bell.slice(0, 13).map(b => (
                <Badge key={b.lesson_number} variant="outline" className="text-[10px] gap-1 py-1">
                  {b.label || `שיעור ${b.lesson_number}`}: {b.start_time}-{b.end_time}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : slots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-body">אין מערכת שעות זמינה</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* Mobile: Single day view */
        <div>
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={() => setMobileDay(d => d > 0 ? d - 1 : 4)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="flex gap-1">
              {SCHOOL_DAYS.map(d => (
                <Button
                  key={d}
                  variant={mobileDay === d ? "default" : "ghost"}
                  size="sm"
                  className={`text-xs px-2 ${currentDay === d ? "ring-2 ring-primary/30" : ""}`}
                  onClick={() => setMobileDay(d)}
                >
                  {HEBREW_DAYS[d]}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileDay(d => d < 4 ? d + 1 : 0)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {allLessons.map(num => {
              const slot = getSlot(mobileDay, num);
              const b = bellMap[num];
              return (
                <div key={num} className="flex gap-2 items-stretch">
                  <div className="w-12 shrink-0 text-center py-2">
                    <p className="text-[9px] text-muted-foreground">{b?.start_time || ""}</p>
                    <p className="text-xs font-heading font-bold">{num}</p>
                    <p className="text-[9px] text-muted-foreground">{b?.end_time || ""}</p>
                  </div>
                  <div className="flex-1">
                    {renderSlot(slot, num)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Desktop: Full week grid */
        <Card>
          <CardContent className="p-3">
            <ScrollArea className="w-full">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="w-16 p-1 text-[10px] text-muted-foreground font-heading">שעה</th>
                    {SCHOOL_DAYS.map(d => (
                      <th key={d} className={`p-1 text-xs font-heading ${currentDay === d ? "text-primary" : "text-muted-foreground"}`}>
                        {HEBREW_DAYS[d]}
                        {currentDay === d && <span className="block text-[9px]">● היום</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLessons.map(num => {
                    const b = bellMap[num];
                    return (
                      <tr key={num}>
                        <td className="p-1 text-center border-t border-border/20">
                          <p className="text-[9px] text-muted-foreground">{b?.start_time || ""}</p>
                          <p className="text-[10px] font-heading font-bold">{b?.label || `${num}`}</p>
                          <p className="text-[9px] text-muted-foreground">{b?.end_time || ""}</p>
                        </td>
                        {SCHOOL_DAYS.map(d => {
                          const slot = getSlot(d, num);
                          return (
                            <td key={d} className="p-0.5 border-t border-border/20" style={{ minWidth: 120 }}>
                              {renderSlot(slot, num)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default TimetablePage;
