import { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Check, X, Clock, Send, Undo2, Cake } from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface StudentCard {
  id: string;
  name: string;
  avatar: AvatarConfig | null;
  status: "present" | "absent" | "late" | "excused" | null;
  notes: { category: string; note?: string }[];
  isBirthday: boolean;
}

const NOTE_CATEGORIES = [
  { value: "disruption", label: "הפרעה", color: "bg-destructive/10 text-destructive border-destructive/30", emoji: "⚠️" },
  { value: "phone", label: "פלאפון", color: "bg-destructive/10 text-destructive border-destructive/30", emoji: "📱" },
  { value: "disrespect", label: "חוצפה", color: "bg-destructive/10 text-destructive border-destructive/30", emoji: "😤" },
  { value: "no_equipment", label: "חוסר ציוד", color: "bg-warning/10 text-warning border-warning/30", emoji: "🎒" },
  { value: "no_homework", label: "לא הכין ש\"ב", color: "bg-warning/10 text-warning border-warning/30", emoji: "📝" },
  { value: "positive_participation", label: "השתתפות יפה", color: "bg-success/10 text-success border-success/30", emoji: "⭐" },
  { value: "helped_peer", label: "עזרה לחבר", color: "bg-success/10 text-success border-success/30", emoji: "🤝" },
  { value: "excellence", label: "הצטיינות", color: "bg-success/10 text-success border-success/30", emoji: "🏆" },
];

const SWIPE_THRESHOLD = 60;

// Swipeable student row component
const SwipeableStudentRow = ({
  student,
  isMobile,
  onSwipe,
  onLongPress,
}: {
  student: StudentCard;
  isMobile: boolean;
  onSwipe: (id: string, direction: "left" | "right") => void;
  onLongPress: (id: string) => void;
}) => {
  const x = useMotionValue(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);

  // Smooth color transitions based on drag position
  const leftBgOpacity = useTransform(x, [-150, -SWIPE_THRESHOLD, 0], [1, 0.6, 0]);
  const rightBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD, 150], [0, 0.6, 1]);
  const leftScale = useTransform(x, [-150, -SWIPE_THRESHOLD, 0], [1.1, 0.9, 0.5]);
  const rightScale = useTransform(x, [0, SWIPE_THRESHOLD, 150], [0.5, 0.9, 1.1]);
  const cardScale = useTransform(x, [-150, 0, 150], [0.98, 1, 0.98]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    isDragging.current = false;
    if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipe(student.id, "left"); // Present
    } else if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipe(student.id, "right"); // Absent
    }
  };

  const handleTouchStart = () => {
    if (!isMobile) return;
    longPressRef.current = setTimeout(() => {
      if (!isDragging.current) onLongPress(student.id);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const statusConfig = student.status === "present"
    ? { bg: "bg-success/8 border-success/25", ring: "ring-success/20", icon: "✓", label: "נוכח" }
    : student.status === "absent"
      ? { bg: "bg-destructive/8 border-destructive/25", ring: "ring-destructive/20", icon: "✗", label: "חסר" }
      : student.status === "late"
        ? { bg: "bg-warning/8 border-warning/25", ring: "ring-warning/20", icon: "◷", label: "איחור" }
        : { bg: "bg-card border-border/50", ring: "", icon: "", label: "" };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe background - present (left swipe) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-start pr-5 rounded-2xl bg-gradient-to-l from-transparent to-success/30"
        style={{ opacity: leftBgOpacity }}
      >
        <motion.div style={{ scale: leftScale }} className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
            <Check className="h-5 w-5 text-success" />
          </div>
          <span className="text-success font-heading font-bold text-sm">נוכח</span>
        </motion.div>
      </motion.div>

      {/* Swipe background - absent (right swipe) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pl-5 rounded-2xl bg-gradient-to-r from-transparent to-destructive/30"
        style={{ opacity: rightBgOpacity }}
      >
        <motion.div style={{ scale: rightScale }} className="flex items-center gap-2">
          <span className="text-destructive font-heading font-bold text-sm">חסר</span>
          <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
            <X className="h-5 w-5 text-destructive" />
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        drag={isMobile ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 25 }}
        onDragStart={() => { isDragging.current = true; }}
        onDragEnd={handleDragEnd}
        style={{ x, scale: cardScale }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={() => { if (longPressRef.current) clearTimeout(longPressRef.current); }}
        className={`relative z-10 flex items-center gap-3 p-3 rounded-2xl border-2 backdrop-blur-sm transition-colors duration-300 ${statusConfig.bg} ${student.status ? `ring-1 ${statusConfig.ring}` : ""}`}
        whileTap={isMobile ? { scale: 0.98 } : undefined}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {student.avatar ? (
            <AvatarPreview config={student.avatar} size={44} />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center text-lg">👤</div>
          )}
          {student.isBirthday && (
            <motion.span
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute -top-2 -left-1 text-lg"
            >
              🎈
            </motion.span>
          )}
          {/* Status indicator dot */}
          {student.status && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-background ${
                student.status === "present" ? "bg-success text-white" :
                student.status === "absent" ? "bg-destructive text-white" :
                "bg-warning text-white"
              }`}
            >
              {statusConfig.icon}
            </motion.div>
          )}
        </div>

        {/* Name & notes */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-heading font-bold text-sm truncate">{student.name}</p>
            {student.isBirthday && <Cake className="h-3.5 w-3.5 text-secondary shrink-0" />}
          </div>
          {student.notes.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {student.notes.map((n, i) => {
                const cat = NOTE_CATEGORIES.find(c => c.value === n.category);
                return <span key={i} className="text-xs">{cat?.emoji}</span>;
              })}
            </div>
          )}
        </div>

        {/* Desktop buttons */}
        {!isMobile && (
          <div className="flex gap-1.5 shrink-0">
            <Button
              size="sm"
              variant={student.status === "present" ? "default" : "outline"}
              className={`text-xs font-heading px-3 rounded-xl transition-all ${student.status === "present" ? "bg-success hover:bg-success/90 text-success-foreground shadow-sm" : ""}`}
              onClick={() => onSwipe(student.id, "left")}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> נוכח
            </Button>
            <Button
              size="sm"
              variant={student.status === "absent" ? "default" : "outline"}
              className={`text-xs font-heading px-3 rounded-xl transition-all ${student.status === "absent" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm" : ""}`}
              onClick={() => onSwipe(student.id, "right")}
            >
              <X className="h-3.5 w-3.5 mr-1" /> חסר
            </Button>
            <Button
              size="sm"
              variant={student.status === "late" ? "default" : "outline"}
              className={`text-xs font-heading px-3 rounded-xl transition-all ${student.status === "late" ? "bg-warning hover:bg-warning/90 text-warning-foreground shadow-sm" : ""}`}
              onClick={() => onSwipe(student.id, "late" as any)}
            >
              <Clock className="h-3.5 w-3.5 mr-1" /> איחור
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const RollCallPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [students, setStudents] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState("");
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [longPressStudentId, setLongPressStudentId] = useState<string | null>(null);

  useEffect(() => {
    const loadClasses = async () => {
      const { data } = await supabase.from("teacher_classes")
        .select("class_id, classes(id, grade, class_number)")
        .eq("user_id", profile.id);

      if (data) {
        const cls = data.map((d: any) => ({
          id: d.classes.id,
          grade: d.classes.grade,
          number: d.classes.class_number,
        }));
        setClasses(cls);
        if (cls.length > 0) setSelectedClass(cls[0].id);
      }
      setLoading(false);
    };
    loadClasses();
  }, [profile.id]);

  useEffect(() => {
    if (!selectedClass) return;
    const loadStudents = async () => {
      setLoading(true);
      const { data: profilesData } = await supabase.from("profiles")
        .select("id, full_name")
        .eq("class_id", selectedClass)
        .eq("is_approved", true)
        .order("full_name", { ascending: true });

      if (!profilesData || profilesData.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const studentIds = profilesData.map((p: any) => p.id);
      const [avatarsRes, birthdaysRes] = await Promise.all([
        supabase.from("avatars").select("*").in("user_id", studentIds),
        supabase.from("profiles").select("id, date_of_birth" as any).in("id", studentIds),
      ]);

      const avatarMap = new Map((avatarsRes.data || []).map((a: any) => [a.user_id, {
        body_type: a.face_shape || "basic",
        eye_color: a.eye_color || "brown",
        skin: a.skin_color || "#FDDBB4",
        hair_style: a.hair_style || "boy",
        hair_color: a.hair_color || "#2C1A0E",
      }]));

      const today = new Date();
      const birthdaySet = new Set<string>();
      if (birthdaysRes.data) {
        for (const p of birthdaysRes.data as any[]) {
          if (p.date_of_birth) {
            const dob = new Date(p.date_of_birth);
            if (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
              birthdaySet.add(p.id);
            }
          }
        }
      }

      setStudents(profilesData.map((p: any) => ({
        id: p.id,
        name: p.full_name,
        avatar: avatarMap.get(p.id) || null,
        status: null,
        notes: [],
        isBirthday: birthdaySet.has(p.id),
      })));
      setLoading(false);
    };
    loadStudents();
  }, [selectedClass]);

  const handleSwipe = useCallback((studentId: string, direction: "left" | "right" | "late") => {
    const newStatus = direction === "left" ? "present" : direction === "right" ? "absent" : "late";
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, status: s.status === newStatus ? null : newStatus as any } : s
    ));
  }, []);

  const addNote = useCallback((studentId: string, category: string) => {
    const student = students.find(s => s.id === studentId);
    if (student?.status === "absent") {
      toast({ title: "לא ניתן להוסיף הערה לתלמיד שחסר", variant: "destructive" });
      return;
    }

    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      const hasNote = s.notes.some(n => n.category === category);
      return {
        ...s,
        notes: hasNote
          ? s.notes.filter(n => n.category !== category)
          : [...s.notes, { category }],
      };
    }));
    setLongPressStudentId(null);
  }, [students, toast]);

  const markAllPresent = () => {
    setStudents(prev => prev.map(s => ({ ...s, status: s.status || "present" })));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: lesson, error: lessonError } = await supabase.from("lessons").insert({
        teacher_id: profile.id,
        class_id: selectedClass,
        subject: profile.roles.includes("educator") ? "חינוך" : "מקצוע",
        topic: topic || null,
        school_id: profile.schoolId!,
      }).select().single();

      if (lessonError) throw lessonError;

      const attendanceRows = students
        .filter(s => s.status)
        .map(s => ({
          lesson_id: lesson.id,
          student_id: s.id,
          status: s.status as "present" | "absent" | "late" | "excused",
        }));

      if (attendanceRows.length > 0) {
        const { error: attError } = await supabase.from("attendance").insert(attendanceRows);
        if (attError) throw attError;
      }

      const noteRows = students.flatMap(s =>
        s.notes.map(n => ({
          lesson_id: lesson.id,
          student_id: s.id,
          category: n.category as any,
          note: n.note || null,
        }))
      );

      if (noteRows.length > 0) {
        const { error: noteError } = await supabase.from("lesson_notes").insert(noteRows);
        if (noteError) throw noteError;
      }

      // Send birthday greetings to class chat for birthday students
      const birthdayStudents = students.filter(s => s.isBirthday);
      if (birthdayStudents.length > 0) {
        for (const bs of birthdayStudents) {
          // Try to send birthday message to class group chat
          try {
            const selectedClassData = classes.find(c => c.id === selectedClass);
            if (selectedClassData) {
              const { data: classConvo } = await supabase
                .from("conversations")
                .select("id")
                .eq("type", "group")
                .eq("title", `כיתה ${selectedClassData.grade}'${selectedClassData.number}`)
                .limit(1)
                .single();
              
              if (classConvo) {
                await supabase.from("messages").insert({
                  conversation_id: classConvo.id,
                  sender_id: profile.id,
                  content: `🎂🎈 מזל טוב ל${bs.name}! יום הולדת שמח! 🎉`,
                });
              }
            }
          } catch { /* ignore if chat message fails */ }
        }
      }

      const absentCount = students.filter(s => s.status === "absent").length;
      const lateCount = students.filter(s => s.status === "late").length;
      const noteCount = noteRows.length;

      toast({
        title: "הקראת שמות נשמרה! ✅",
        description: `${absentCount} חיסורים, ${lateCount} איחורים, ${noteCount} הערות`,
      });

      setStudents(prev => prev.map(s => ({ ...s, status: null, notes: [] })));
      setTopic("");
    } catch (error: any) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const absentCount = students.filter(s => s.status === "absent").length;
  const lateCount = students.filter(s => s.status === "late").length;
  const presentCount = students.filter(s => s.status === "present").length;
  const unmarkedCount = students.filter(s => !s.status).length;
  const birthdayCount = students.filter(s => s.isBirthday).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" />
            הקראת שמות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            {isMobile ? "החלק ימינה לחיסור, שמאלה לנוכח" : "סמן נוכחות, איחורים והערות"}
          </p>
        </div>
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="בחר כיתה" />
          </SelectTrigger>
          <SelectContent>
            {classes.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Birthday banner */}
      {birthdayCount > 0 && (
        <Card className="border-secondary/30 bg-gradient-to-r from-secondary/10 to-primary/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Cake className="h-5 w-5 text-secondary shrink-0" />
            <p className="font-heading font-medium text-sm">
              🎈 יום הולדת היום: {students.filter(s => s.isBirthday).map(s => s.name).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary bar */}
      <div className="flex gap-2 flex-wrap items-center">
        <Badge variant="outline" className="gap-1 py-1 px-3 bg-success/5">
          <Check className="h-3 w-3 text-success" /> {presentCount}
        </Badge>
        <Badge variant="outline" className="gap-1 py-1 px-3 bg-destructive/5">
          <X className="h-3 w-3 text-destructive" /> {absentCount}
        </Badge>
        <Badge variant="outline" className="gap-1 py-1 px-3 bg-warning/5">
          <Clock className="h-3 w-3 text-warning" /> {lateCount}
        </Badge>
        {unmarkedCount > 0 && (
          <Badge variant="outline" className="gap-1 py-1 px-3 text-muted-foreground">
            {unmarkedCount} טרם
          </Badge>
        )}
        <Button variant="outline" size="sm" className="mr-auto font-heading text-xs" onClick={markAllPresent}>
          ✓ הכל נוכחים
        </Button>
      </div>

      {/* Student List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground font-body">אין תלמידים בכיתה זו</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {students.map(student => (
            <SwipeableStudentRow
              key={student.id}
              student={student}
              isMobile={isMobile}
              onSwipe={handleSwipe}
              onLongPress={(id) => setLongPressStudentId(id)}
            />
          ))}
        </div>
      )}

      {/* Long Press Note Popup */}
      {longPressStudentId && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4"
          onClick={() => setLongPressStudentId(null)}
        >
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="bg-card rounded-2xl p-4 w-full max-w-sm shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-heading font-bold text-base mb-3 text-center">
              {students.find(s => s.id === longPressStudentId)?.name} - הוספת הערה
            </p>
            <div className="grid grid-cols-2 gap-2">
              {NOTE_CATEGORIES.map(cat => {
                const hasNote = students.find(s => s.id === longPressStudentId)?.notes.some(n => n.category === cat.value);
                return (
                  <button
                    key={cat.value}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-heading transition-all ${
                      hasNote ? cat.color + " font-bold" : "bg-muted/30 border-border hover:bg-muted/60"
                    }`}
                    onClick={() => addNote(longPressStudentId, cat.value)}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Late button in popup too */}
            <Button
              variant="outline"
              className="w-full mt-3 font-heading gap-2"
              onClick={() => {
                handleSwipe(longPressStudentId, "late" as any);
                setLongPressStudentId(null);
              }}
            >
              <Clock className="h-4 w-4 text-warning" /> סמן כאיחור
            </Button>
            <Button
              variant="ghost"
              className="w-full mt-1 text-muted-foreground font-heading"
              onClick={() => setLongPressStudentId(null)}
            >
              סגור
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Submit bar */}
      {students.length > 0 && (
        <Card className="sticky bottom-4 z-40 shadow-lg border-primary/20">
          <CardContent className="py-3 flex items-center gap-3">
            <input
              type="text"
              placeholder="נושא השיעור (אופציונלי)"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm font-body outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button className="gap-2 font-heading" onClick={handleSubmit} disabled={submitting || unmarkedCount === students.length}>
              <Send className="h-4 w-4" />
              {submitting ? "שומר..." : "שמור"}
            </Button>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default RollCallPage;
