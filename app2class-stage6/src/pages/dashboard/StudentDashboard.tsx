import { useOutletContext } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen, Target, Calendar, Brain, Clock, Sun, School,
  GraduationCap, FileText, AlertCircle, MapPin, Flag, Sparkles, Loader2, Cake,
} from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import CurrentLessonBanner from "@/components/dashboard/CurrentLessonBanner";
import GamificationWidget from "@/components/gamification/GamificationWidget";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import { useStudentSubjects, filterEventsBySubjects, personalizeEventTitle } from "@/hooks/useStudentSubjects";

type GradeEvent = {
  id: string;
  event_date: string;
  title: string;
  event_type: string;
  subject: string | null;
  description: string | null;
};

type HolidayPeriod = {
  title: string;
  start: string;
  end: string;
  returnDate?: string;
};

const HOLIDAY_PERIODS: HolidayPeriod[] = [
  { title: "ראש השנה", start: "2025-09-22", end: "2025-09-25", returnDate: "2025-09-26" },
  { title: "יום כיפור", start: "2025-10-01", end: "2025-10-04", returnDate: "2025-10-05" },
  { title: "סוכות", start: "2025-10-06", end: "2025-10-18", returnDate: "2025-10-19" },
  { title: "חנוכה", start: "2025-12-16", end: "2025-12-24", returnDate: "2025-12-25" },
  { title: "פורים", start: "2026-03-01", end: "2026-03-03", returnDate: "2026-03-04" },
  { title: "פסח", start: "2026-03-24", end: "2026-04-08", returnDate: "2026-04-09" },
  { title: "יום העצמאות", start: "2026-04-22", end: "2026-04-22", returnDate: "2026-04-23" },
  { title: "ל״ג בעומר", start: "2026-05-05", end: "2026-05-05", returnDate: "2026-05-06" },
  { title: "שבועות", start: "2026-05-21", end: "2026-05-22", returnDate: "2026-05-24" },
  { title: "סיום שנה - על יסודי", start: "2026-06-19", end: "2026-06-19" },
];

const EVENT_TYPE_CONFIG: Record<string, { color: string; icon: typeof BookOpen; label: string }> = {
  exam: { color: "bg-destructive/10 border-destructive/20", icon: BookOpen, label: "מבחן" },
  bagrut: { color: "bg-destructive/10 border-destructive/25", icon: GraduationCap, label: "בגרות" },
  quiz: { color: "bg-secondary/15 border-secondary/30", icon: FileText, label: "בוחן" },
  deadline: { color: "bg-primary/10 border-primary/20", icon: AlertCircle, label: "הגשה" },
  trip: { color: "bg-accent/20 border-accent/30", icon: MapPin, label: "טיול" },
  ceremony: { color: "bg-muted border-border", icon: Flag, label: "טקס" },
  event: { color: "bg-secondary/15 border-secondary/30", icon: Sun, label: "אירוע" },
  other: { color: "bg-muted border-border", icon: Calendar, label: "אחר" },
};

const parseDate = (iso: string) => new Date(`${iso}T12:00:00`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (from: Date, to: Date) => Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

const hebrewDayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const shortDateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" });

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const StudentDashboard = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();

  const [now, setNow] = useState<Date>(new Date());
  const [gradeEvents, setGradeEvents] = useState<GradeEvent[]>([]);
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isBirthday, setIsBirthday] = useState(false);
  const { subjects: mySubjects, trackNames, hasMegamaA, hasMegamaB } = useStudentSubjects(profile.id, profile.schoolId);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  // Fetch Jerusalem time
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://worldtimeapi.org/api/timezone/Asia/Jerusalem");
        const data = await res.json();
        if (data?.datetime) setNow(new Date(data.datetime));
      } catch { /* fallback to local */ }
    })();
  }, []);

  // Check birthday
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles").select("*").eq("id", profile.id).single();
      if ((data as any)?.date_of_birth) {
        const dob = new Date((data as any).date_of_birth);
        const today = new Date(now);
        if (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
          setIsBirthday(true);
        }
      }
    })();
  }, [profile.id, now]);

  // Fetch grade events
  useEffect(() => {
    (async () => {
      if (!profile.schoolId) return;
      const { data: myProfile } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();
      if (!myProfile?.class_id) return;
      const { data: cls } = await supabase
        .from("classes").select("grade").eq("id", myProfile.class_id).single();
      if (!cls?.grade) return;
      setStudentGrade(cls.grade);

      const { data: events } = await supabase
        .from("grade_events")
        .select("id, event_date, title, event_type, subject, description")
        .eq("school_id", profile.schoolId)
        .eq("grade", cls.grade as any)
        .eq("status", "approved")
        .order("event_date", { ascending: true });
      setGradeEvents(filterEventsBySubjects(events || [], mySubjects, hasMegamaA, hasMegamaB));
    })();
  }, [profile.id, profile.schoolId, mySubjects, hasMegamaA, hasMegamaB]);

  const todayTs = useMemo(() => startOfDay(now).getTime(), [now]);
  const today = useMemo(() => new Date(todayTs), [todayTs]);

  const weekStart = useMemo(() => {
    const d = new Date(todayTs);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [todayTs]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const thisWeekEvents = useMemo(() => {
    return gradeEvents.filter(e => {
      const d = startOfDay(parseDate(e.event_date));
      return d >= weekStart && d <= weekEnd;
    });
  }, [gradeEvents, weekStart, weekEnd]);

  const activeHoliday = useMemo(() => {
    return HOLIDAY_PERIODS.find(h => {
      const s = startOfDay(parseDate(h.start));
      const e = startOfDay(parseDate(h.end));
      return today >= s && today <= e;
    });
  }, [today]);

  const holidayThisWeek = useMemo(() => {
    return HOLIDAY_PERIODS.find(h => {
      const s = startOfDay(parseDate(h.start));
      const e = startOfDay(parseDate(h.end));
      return (s >= weekStart && s <= weekEnd) || (e >= weekStart && e <= weekEnd) || (s <= weekStart && e >= weekEnd);
    });
  }, [weekStart, weekEnd]);

  const nextExam = useMemo(() => {
    return gradeEvents
      .filter(e => ["exam", "bagrut", "quiz"].includes(e.event_type) && startOfDay(parseDate(e.event_date)) > today)
      .sort((a, b) => parseDate(a.event_date).getTime() - parseDate(b.event_date).getTime())[0];
  }, [gradeEvents, today]);

  // AI Insight - use fetch directly for proper SSE handling
  useEffect(() => {
    if (thisWeekEvents.length === 0 && !activeHoliday && !holidayThisWeek) return;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const controller = new AbortController();
    const generateInsight = async () => {
      setAiLoading(true);
      try {
        const eventsText = thisWeekEvents.map(e => {
          const d = parseDate(e.event_date);
          const dayName = hebrewDayNames[d.getDay()];
          return `יום ${dayName} (${shortDateFmt.format(d)}): ${e.title}${e.subject ? ` [${e.subject}]` : ""} (${EVENT_TYPE_CONFIG[e.event_type]?.label || e.event_type})`;
        }).join("\n");

        const holidayText = activeHoliday
          ? `כרגע חופשת ${activeHoliday.title}. חזרה ללימודים: ${activeHoliday.returnDate || "לא ידוע"}.`
          : holidayThisWeek
            ? `השבוע יש חופשת ${holidayThisWeek.title} (${holidayThisWeek.start} עד ${holidayThisWeek.end}).`
            : "";

        const nextExamText = nextExam
          ? `המבחן הקרוב ביותר: ${nextExam.title}${nextExam.subject ? ` ב${nextExam.subject}` : ""} בעוד ${dayDiff(today, parseDate(nextExam.event_date))} ימים.`
          : "";

        const birthdayText = isBirthday ? "היום יום ההולדת של התלמיד/ה! תברך אותו/ה." : "";

        const tracksText = trackNames.length > 0 ? `המגמות שלו/ה: ${trackNames.join(", ")}.` : "";

        const prompt = `אתה עוזר לימודי AI חכם בשם "מנטור". תן תובנה קצרה (2-3 משפטים) לתלמיד/ה בשכבת ${studentGrade || "יא"} על השבוע הקרוב שלו/ה.
${tracksText}

הנה מה שקורה השבוע:
${eventsText || "אין אירועים מתוכננים השבוע."}
${holidayText}
${nextExamText}
${birthdayText}

תן המלצה פרקטית אחת, ספציפית ורלוונטית. אל תפרט יותר מדי. תהיה חם ומעודד. ענה בעברית.`;

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            grade: studentGrade,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("AI error");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let content = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const json = JSON.parse(line.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) content += delta;
              } catch { /* skip */ }
            }
          }
        }

        setAiInsight(content || "שבוע טוב! 📚 בדוק את לוח האירועים שלך לפרטים.");
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setAiInsight("");
        }
      } finally {
        setAiLoading(false);
      }
    };
    generateInsight();
    return () => controller.abort();
  }, [thisWeekEvents, activeHoliday, holidayThisWeek, nextExam, studentGrade, isBirthday, trackNames]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Birthday Banner */}
      {isBirthday && (
        <motion.div variants={item}>
          <Card className="border-secondary/30 bg-gradient-to-r from-secondary/10 via-primary/5 to-accent/10 overflow-hidden relative">
            <CardContent className="py-5 flex items-center gap-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Cake className="h-10 w-10 text-secondary" />
              </motion.div>
              <div>
                <h2 className="text-xl font-heading font-bold">יום הולדת שמח! 🎂🎈🎉</h2>
                <p className="text-sm text-muted-foreground font-body">כל הכבוד שהגעת לעוד שנה! מאחלים לך שנה מלאה בהצלחות!</p>
              </div>
              <div className="absolute -top-2 -left-2 text-4xl animate-bounce">🎈</div>
              <div className="absolute -bottom-1 left-8 text-3xl animate-bounce" style={{ animationDelay: "0.3s" }}>🎈</div>
              <div className="absolute top-1 left-20 text-2xl animate-bounce" style={{ animationDelay: "0.6s" }}>🎈</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Welcome */}
      <motion.div variants={item} className="flex items-center gap-4">
        {profile.avatar && <AvatarPreview config={profile.avatar} size={72} />}
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">שלום, {profile.fullName} 👋</h1>
          {profile.schoolName && (
            <p className="text-sm text-muted-foreground font-body mt-0.5">{profile.schoolName}</p>
          )}
        </div>
      </motion.div>

      {/* Current lesson banner */}
      {!activeHoliday && (
        <motion.div variants={item}>
          <CurrentLessonBanner profile={profile} />
        </motion.div>
      )}

      {/* Active holiday banner */}
      {activeHoliday && (
        <motion.div variants={item}>
          <Card className="border-info/20 bg-info/5">
            <CardContent className="py-3 flex items-center gap-3">
              <Sun className="h-5 w-5 text-info shrink-0" />
              <div>
                <p className="font-heading font-medium text-sm">חופשת {activeHoliday.title} 🎉</p>
                {activeHoliday.returnDate && (
                  <p className="text-xs text-muted-foreground">חזרה ללימודים: {shortDateFmt.format(parseDate(activeHoliday.returnDate))}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Status cards row */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        {nextExam && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-destructive shrink-0" />
                  <span className="font-heading font-medium text-xs truncate">{personalizeEventTitle(nextExam.title, nextExam.subject, trackNames)}</span>
                </div>
                {nextExam.subject && <p className="text-[10px] text-muted-foreground mr-5">{nextExam.subject}</p>}
              </div>
              <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0" variant="outline">
                {dayDiff(today, parseDate(nextExam.event_date))} ימים
              </Badge>
            </CardContent>
          </Card>
        )}

        {!activeHoliday && (() => {
          const next = HOLIDAY_PERIODS.find(h => startOfDay(parseDate(h.start)) > today);
          if (!next) return null;
          return (
            <Card className="border-info/20 bg-info/5">
              <CardContent className="py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-heading font-medium text-xs truncate">{next.title}</span>
                </div>
                <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0" variant="outline">
                  {dayDiff(today, parseDate(next.start))} ימים
                </Badge>
              </CardContent>
            </Card>
          );
        })()}
      </motion.div>

      {/* AI Insight */}
      {(aiLoading || aiInsight) && (
        <motion.div variants={item}>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4 flex items-start gap-3">
              <Brain className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-heading font-medium text-sm text-primary mb-1">תובנת מנטור לשבוע 🎯</p>
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>מנתח את השבוע שלך...</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/80 font-body leading-relaxed">{aiInsight}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Gamification */}
      <motion.div variants={item}>
        <GamificationWidget userId={profile.id} />
      </motion.div>

      {/* This week events */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              מה קורה השבוע
              {holidayThisWeek && !activeHoliday && (
                <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/20 mr-2">
                  חופשת {holidayThisWeek.title}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {thisWeekEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {activeHoliday ? "חופשה! 🎉 אין אירועים השבוע." : "אין אירועים מתוכננים השבוע"}
              </p>
            ) : (
              <ScrollArea className="max-h-[220px]">
                <div className="space-y-1.5">
                  {thisWeekEvents.map((event) => {
                    const cfg = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
                    const Icon = cfg.icon;
                    const eventDate = parseDate(event.event_date);
                    const dayName = hebrewDayNames[eventDate.getDay()];
                    const isToday = dayDiff(today, startOfDay(eventDate)) === 0;
                    const isPast = startOfDay(eventDate) < today;
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg border transition-colors ${
                          isToday ? "ring-2 ring-primary/30 " : ""
                        }${isPast ? "opacity-50 " : ""}${cfg.color}`}
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-background/50">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-body truncate">{personalizeEventTitle(event.title, event.subject, trackNames)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            יום {dayName} {shortDateFmt.format(eventDate)}
                            {event.subject && ` • ${event.subject}`}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 h-4 shrink-0">
                          {isToday ? "היום!" : isPast ? "עבר" : cfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Access */}
      <motion.div variants={item}>
        <h2 className="font-heading font-bold text-lg mb-3">גישה מהירה</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: BookOpen, label: "המקצועות שלי", path: "/dashboard/subjects", color: "text-primary" },
            { icon: Calendar, label: "לוח שנה", path: "/dashboard/calendar", color: "text-info" },
            { icon: Target, label: "משימות", path: "/dashboard/tasks", color: "text-warning" },
            { icon: Brain, label: "עוזר AI", path: "/dashboard/ai-tutor", color: "text-accent" },
          ].map((quickItem, i) => (
            <Card key={i} className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
              onClick={() => navigate(quickItem.path)}>
              <CardContent className="py-5 text-center">
                <quickItem.icon className={`h-8 w-8 mx-auto mb-2 ${quickItem.color}`} />
                <p className="text-sm font-heading font-medium">{quickItem.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StudentDashboard;
