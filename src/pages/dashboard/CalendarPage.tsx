import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar as CalendarIcon, Clock3, Sun, School, Sparkles,
  BookOpen, FileText, MapPin, GraduationCap, AlertCircle, Flag
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";

type HolidayPeriod = {
  id: string;
  title: string;
  start: string;
  end: string;
  returnDate?: string;
  note?: string;
};

type GradeEvent = {
  id: string;
  event_date: string;
  title: string;
  event_type: string;
  subject: string | null;
  description: string | null;
};

const HOLIDAY_PERIODS: HolidayPeriod[] = [
  { id: "rosh-hashana", title: "ראש השנה", start: "2025-09-22", end: "2025-09-25", returnDate: "2025-09-26" },
  { id: "yom-kippur", title: "יום כיפור", start: "2025-10-01", end: "2025-10-04", returnDate: "2025-10-05" },
  { id: "sukkot", title: "סוכות", start: "2025-10-06", end: "2025-10-18", returnDate: "2025-10-19" },
  { id: "hanukkah", title: "חנוכה", start: "2025-12-16", end: "2025-12-24", returnDate: "2025-12-25" },
  { id: "purim", title: "פורים", start: "2026-03-01", end: "2026-03-03", returnDate: "2026-03-04" },
  { id: "pesach", title: "פסח", start: "2026-03-24", end: "2026-04-08", returnDate: "2026-04-09" },
  { id: "independence-day", title: "יום העצמאות", start: "2026-04-22", end: "2026-04-22", returnDate: "2026-04-23" },
  { id: "lag-baomer", title: "ל״ג בעומר", start: "2026-05-05", end: "2026-05-05", returnDate: "2026-05-06" },
  { id: "shavuot", title: "שבועות", start: "2026-05-21", end: "2026-05-22", returnDate: "2026-05-24" },
  { id: "high-school-end", title: "סיום שנה - על יסודי", start: "2026-06-19", end: "2026-06-19", note: "בתי ספר על-יסודיים" },
  { id: "elementary-end", title: "סיום שנה - יסודי וגנים", start: "2026-06-30", end: "2026-06-30", note: "יסודי וגני ילדים" },
];

const EVENT_TYPE_CONFIG: Record<string, { color: string; icon: typeof BookOpen; label: string }> = {
  exam: { color: "bg-destructive/10 border-destructive/20 text-destructive", icon: BookOpen, label: "מבחן" },
  bagrut: { color: "bg-destructive/15 border-destructive/30 text-destructive", icon: GraduationCap, label: "בגרות" },
  quiz: { color: "bg-warning/10 border-warning/20 text-warning", icon: FileText, label: "בוחן" },
  deadline: { color: "bg-primary/10 border-primary/20 text-primary", icon: AlertCircle, label: "הגשה" },
  trip: { color: "bg-accent/50 border-accent text-accent-foreground", icon: MapPin, label: "טיול" },
  ceremony: { color: "bg-muted border-border text-muted-foreground", icon: Flag, label: "טקס" },
  event: { color: "bg-secondary border-secondary text-secondary-foreground", icon: Sun, label: "אירוע" },
  other: { color: "bg-muted border-border text-muted-foreground", icon: CalendarIcon, label: "אחר" },
};

const parseSchoolDate = (isoDate: string) => new Date(`${isoDate}T12:00:00`);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const dayDiff = (from: Date, to: Date) => Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

const hebrewFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const gregorianFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const CalendarPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [jerusalemNow, setJerusalemNow] = useState<Date | null>(null);
  const [timeLoadedFromApi, setTimeLoadedFromApi] = useState(false);
  const [gradeEvents, setGradeEvents] = useState<GradeEvent[]>([]);
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const isStudent = profile.roles.includes("student");

  // Load time from API
  useEffect(() => {
    const loadTimeFromApi = async () => {
      try {
        const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Jerusalem");
        const data = await res.json();
        if (data?.datetime) {
          setJerusalemNow(new Date(data.datetime));
          setTimeLoadedFromApi(true);
        }
      } catch {
        setJerusalemNow(new Date());
      }
    };
    loadTimeFromApi();
  }, []);

  // Load student grade and grade events
  useEffect(() => {
    const loadGradeEvents = async () => {
      if (!profile.schoolId) return;

      // Get student's grade from their class
      let grade: string | null = null;
      const { data: myProfile } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();
      if (myProfile?.class_id) {
        const { data: cls } = await supabase
          .from("classes").select("grade").eq("id", myProfile.class_id).single();
        grade = cls?.grade || null;
      }

      // For staff, try to get grade from user_roles
      if (!grade && !isStudent) {
        const { data: roles } = await supabase
          .from("user_roles").select("grade").eq("user_id", profile.id).not("grade", "is", null).limit(1);
        if (roles?.length) grade = roles[0].grade;
      }

      setStudentGrade(grade);

      if (!grade) return;

      const { data: events } = await supabase
        .from("grade_events")
        .select("id, event_date, title, event_type, subject, description")
        .eq("school_id", profile.schoolId)
        .eq("grade", grade as any)
        .eq("status", "approved")
        .order("event_date", { ascending: true });

      setGradeEvents(events || []);
    };

    loadGradeEvents();
  }, [profile.id, profile.schoolId, isStudent]);

  const holidayPeriods = useMemo(
    () =>
      HOLIDAY_PERIODS.map((period) => ({
        ...period,
        startDate: parseSchoolDate(period.start),
        endDate: parseSchoolDate(period.end),
        returnDateObj: period.returnDate ? parseSchoolDate(period.returnDate) : null,
      })),
    []
  );

  const currentDate = startOfDay(jerusalemNow ?? new Date());

  const activeHoliday = holidayPeriods.find(
    (h) => currentDate.getTime() >= startOfDay(h.startDate).getTime() && currentDate.getTime() <= startOfDay(h.endDate).getTime()
  );

  const nextHoliday = holidayPeriods
    .filter((h) => startOfDay(h.startDate).getTime() > currentDate.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

  // Next upcoming exam/bagrut
  const nextExam = gradeEvents
    .filter(e => ["exam", "bagrut", "quiz"].includes(e.event_type) && parseSchoolDate(e.event_date) > currentDate)
    .sort((a, b) => parseSchoolDate(a.event_date).getTime() - parseSchoolDate(b.event_date).getTime())[0];

  // Grade events for selected date
  const selectedDayGradeEvents = useMemo(() => {
    if (!selectedDate) return [];
    return gradeEvents.filter(e => isSameDay(parseSchoolDate(e.event_date), selectedDate));
  }, [gradeEvents, selectedDate]);

  // Holiday events for selected date
  const selectedDayHolidays = useMemo(() => {
    if (!selectedDate) return [];
    return holidayPeriods.flatMap((period) => {
      const selectedDay = startOfDay(selectedDate);
      const start = startOfDay(period.startDate);
      const end = startOfDay(period.endDate);
      const events: { id: string; title: string; type: "holiday" | "return"; subtitle: string }[] = [];
      if (selectedDay.getTime() >= start.getTime() && selectedDay.getTime() <= end.getTime()) {
        events.push({
          id: `${period.id}-holiday`,
          title: period.title,
          type: "holiday",
          subtitle: `${gregorianFormatter.format(period.startDate)} - ${gregorianFormatter.format(period.endDate)}`,
        });
      }
      if (period.returnDateObj && isSameDay(selectedDay, period.returnDateObj)) {
        events.push({
          id: `${period.id}-return`,
          title: `חזרה ללימודים אחרי ${period.title}`,
          type: "return",
          subtitle: gregorianFormatter.format(period.returnDateObj),
        });
      }
      return events;
    });
  }, [holidayPeriods, selectedDate]);

  const holidayRanges = holidayPeriods.map((p) => ({ from: p.startDate, to: p.endDate }));
  const returnDays = holidayPeriods.filter((p) => p.returnDateObj).map((p) => p.returnDateObj as Date);
  const examDays = gradeEvents
    .filter(e => ["exam", "bagrut"].includes(e.event_type))
    .map(e => parseSchoolDate(e.event_date));
  const quizDays = gradeEvents
    .filter(e => e.event_type === "quiz")
    .map(e => parseSchoolDate(e.event_date));

  // Filter events by tab
  const filteredUpcoming = useMemo(() => {
    const future = gradeEvents.filter(e => parseSchoolDate(e.event_date).getTime() >= currentDate.getTime());
    if (activeTab === "all") return future;
    if (activeTab === "exams") return future.filter(e => ["exam", "bagrut", "quiz"].includes(e.event_type));
    if (activeTab === "events") return future.filter(e => ["event", "trip", "ceremony"].includes(e.event_type));
    if (activeTab === "deadlines") return future.filter(e => e.event_type === "deadline");
    return future;
  }, [gradeEvents, currentDate, activeTab]);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <CalendarIcon className="h-7 w-7 text-primary" />
            {studentGrade ? `לוח מבחנים ואירועים - שכבת ${studentGrade}'` : "לוח חופשות ואירועים"}
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            מבוסס תאריכים עבריים + שעון ישראל
            {studentGrade && ` • ${gradeEvents.length} אירועים`}
          </p>
        </div>
        <Badge variant="outline" className="gap-1 shrink-0">
          <Clock3 className="h-3.5 w-3.5" />
          {timeLoadedFromApi ? "API" : "מקומי"}
        </Badge>
      </motion.div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(activeHoliday || nextHoliday) && (
          <motion.div variants={item}>
            <Card className="border-info/20 bg-info/5">
              <CardContent className="py-3 flex items-center justify-between gap-3">
                {activeHoliday ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <Sun className="h-5 w-5 text-info shrink-0" />
                      <span className="font-heading font-medium text-sm truncate">חופשת {activeHoliday.title}</span>
                    </div>
                    <Badge className="bg-info/10 text-info border-info/20" variant="outline">
                      עד {shortDateFormatter.format(activeHoliday.endDate)}
                    </Badge>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="h-5 w-5 text-primary shrink-0" />
                      <span className="font-heading font-medium text-sm truncate">חופשה: {nextHoliday?.title}</span>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                      {nextHoliday ? dayDiff(currentDate, nextHoliday.startDate) : 0} ימים
                    </Badge>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {nextExam && (
          <motion.div variants={item}>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="h-5 w-5 text-destructive shrink-0" />
                  <span className="font-heading font-medium text-sm truncate">{nextExam.title}</span>
                </div>
                <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">
                  {dayDiff(currentDate, parseSchoolDate(nextExam.event_date))} ימים
                </Badge>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Calendar */}
        <motion.div variants={item}>
          <Card>
            <CardContent className="p-4 flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="pointer-events-auto"
                modifiers={{
                  holiday: holidayRanges,
                  returnDay: returnDays,
                  examDay: examDays,
                  quizDay: quizDays,
                }}
                modifiersClassNames={{
                  holiday: "bg-info/15 text-info-foreground font-semibold",
                  returnDay: "bg-primary/15 text-primary font-semibold",
                  examDay: "bg-destructive/15 text-destructive font-semibold",
                  quizDay: "bg-warning/15 text-warning font-semibold",
                }}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Events for selected date & upcoming */}
        <motion.div variants={item} className="space-y-4">
          {/* Selected day details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                {selectedDate
                  ? `${gregorianFormatter.format(selectedDate)} • ${hebrewFormatter.format(selectedDate)}`
                  : "בחר תאריך"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDayHolidays.length === 0 && selectedDayGradeEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">אין אירועים ביום זה</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayHolidays.map((event) => (
                    <div
                      key={event.id}
                      className={`p-3 rounded-lg border ${
                        event.type === "holiday"
                          ? "bg-info/10 border-info/20 text-info"
                          : "bg-primary/10 border-primary/20 text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {event.type === "holiday" ? <Sun className="h-4 w-4" /> : <School className="h-4 w-4" />}
                        <span className="font-heading font-medium text-sm">{event.title}</span>
                      </div>
                    </div>
                  ))}
                  {selectedDayGradeEvents.map((event) => {
                    const cfg = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
                    const Icon = cfg.icon;
                    return (
                      <div key={event.id} className={`p-3 rounded-lg border ${cfg.color}`}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="font-heading font-medium text-sm">{event.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[9px] px-1.5 h-4">{cfg.label}</Badge>
                          {event.subject && <span className="text-[10px] opacity-80">{event.subject}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming events with tabs */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-heading mb-2">אירועים קרובים</CardTitle>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full h-auto p-0 bg-transparent">
                  <TabsTrigger value="all" className="text-[10px] flex-1 py-1.5 data-[state=active]:bg-primary/10">הכל</TabsTrigger>
                  <TabsTrigger value="exams" className="text-[10px] flex-1 py-1.5 data-[state=active]:bg-destructive/10">מבחנים</TabsTrigger>
                  <TabsTrigger value="events" className="text-[10px] flex-1 py-1.5 data-[state=active]:bg-secondary">אירועים</TabsTrigger>
                  <TabsTrigger value="deadlines" className="text-[10px] flex-1 py-1.5 data-[state=active]:bg-primary/10">הגשות</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="pt-2">
              <ScrollArea className="h-[260px]">
                {filteredUpcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">אין אירועים קרובים</p>
                ) : (
                  <div className="space-y-1">
                    {filteredUpcoming.slice(0, 20).map((event) => {
                      const cfg = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
                      const Icon = cfg.icon;
                      const eventDate = parseSchoolDate(event.event_date);
                      const days = dayDiff(currentDate, eventDate);
                      return (
                        <button
                          key={event.id}
                          onClick={() => setSelectedDate(eventDate)}
                          className="w-full flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors text-right"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body truncate">{event.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {shortDateFormatter.format(eventDate)}
                              {event.subject && ` • ${event.subject}`}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[9px] px-1.5 h-4 shrink-0">
                            {days === 0 ? "היום" : days === 1 ? "מחר" : `${days} ימים`}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default CalendarPage;
