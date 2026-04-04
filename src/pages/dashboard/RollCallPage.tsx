import { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Check, X, Clock, Send, Undo2, Cake, MoreHorizontal, LayoutGrid, List } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSmartSeat } from "@/hooks/useSmartSeat";
import { ClassroomGrid } from "@/components/smartseat/ClassroomGrid";

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

const SwipeableStudentRow = ({
  student,
  isMobile,
  onSwipe,
  onLongPress,
}: {
  student: StudentCard;
  isMobile: boolean;
  onSwipe: (id: string, direction: "left" | "right" | "late") => void;
  onLongPress: (id: string) => void;
}) => {
  const x = useMotionValue(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);

  const leftBgOpacity = useTransform(x, [-150, -SWIPE_THRESHOLD, 0], [1, 0.6, 0]);
  const rightBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD, 150], [0, 0.6, 1]);
  const leftScale = useTransform(x, [-150, -SWIPE_THRESHOLD, 0], [1.1, 0.9, 0.5]);
  const rightScale = useTransform(x, [0, SWIPE_THRESHOLD, 150], [0.5, 0.9, 1.1]);
  const cardScale = useTransform(x, [-150, 0, 150], [0.98, 1, 0.98]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    isDragging.current = false;
    if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipe(student.id, "left");
    } else if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipe(student.id, "right");
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
        className={`relative z-10 flex items-center gap-3 p-3 rounded-2xl border-2 backdrop-blur-sm transition-colors duration-300 ${statusConfig.bg} ${student.status ? `ring-1 ${statusConfig.ring}` : ""}`}
      >
        <div className="relative shrink-0">
          {student.avatar ? (
            <AvatarPreview config={student.avatar} size={44} />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center text-lg">👤</div>
          )}
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

        <div className="flex-1 min-w-0 text-right">
          <p className="font-heading font-bold text-sm truncate">{student.name}</p>
        </div>

        {!isMobile && (
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant={student.status === "present" ? "default" : "outline"} className={`text-xs font-heading ${student.status === "present" ? "bg-success hover:bg-success/90" : ""}`} onClick={() => onSwipe(student.id, "left")}>
              <Check className="h-3.5 w-3.5 mr-1" /> נוכח
            </Button>
            <Button size="sm" variant={student.status === "absent" ? "default" : "outline"} className={`text-xs font-heading ${student.status === "absent" ? "bg-destructive hover:bg-destructive/90" : ""}`} onClick={() => onSwipe(student.id, "right")}>
              <X className="h-3.5 w-3.5 mr-1" /> חסר
            </Button>
            <Button size="sm" variant={student.status === "late" ? "default" : "outline"} className={`text-xs font-heading ${student.status === "late" ? "bg-warning hover:bg-warning/90" : ""}`} onClick={() => onSwipe(student.id, "late")}>
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
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
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
    };
    loadClasses();
  }, [profile.id]);

  useEffect(() => {
    if (!selectedClass) return;
    const loadStudents = async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles")
        .select("id, full_name, avatar")
        .eq("class_id", selectedClass)
        .eq("is_approved", true);
      if (data) {
        setStudents(data.map(p => ({ id: p.id, name: p.full_name, avatar: p.avatar, status: null, notes: [], isBirthday: false })));
      }
      setLoading(false);
    };
    loadStudents();
  }, [selectedClass]);

  const ss = useSmartSeat(selectedClass);

  const handleSwipe = useCallback((id: string, direction: "left" | "right" | "late") => {
    const status = direction === "left" ? "present" : direction === "right" ? "absent" : "late";
    setStudents(prev => prev.map(s => s.id === id ? { ...s, status: s.status === status ? null : status } : s));
  }, []);

  const unmarkedCount = students.filter(s => !s.status).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">הקראת שמות</h1>
        <div className="flex gap-2 items-center">
            <div className="flex bg-muted rounded-lg p-1">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="h-8 shadow-none"><List className="h-4 w-4 mr-2" /> רשימה</Button>
                <Button variant={viewMode === "map" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("map")} className="h-8 shadow-none"><LayoutGrid className="h-4 w-4 mr-2" /> מפה</Button>
            </div>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-32 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>)}</SelectContent>
            </Select>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="space-y-2">
            {students.map(s => <SwipeableStudentRow key={s.id} student={s} isMobile={isMobile} onSwipe={handleSwipe} onLongPress={setLongPressStudentId} />)}
        </div>
      ) : (
        <Card className="min-h-[500px]">
            <CardContent className="p-0">
                <ClassroomGrid
                    config={ss.config}
                    students={students.map(s => {
                        const seated = ss.students.find(st => st.id === s.id);
                        return { ...s, attendance: s.status || 'none', seatRow: seated?.seatRow, seatCol: seated?.seatCol } as any;
                    })}
                    mode="lesson"
                    highlightedId={null}
                    getStudentAt={(r, c) => {
                        const seated = ss.students.find(st => st.seatRow === r && st.seatCol === c);
                        if (!seated) return undefined;
                        const s = students.find(st => st.id === seated.id);
                        return s ? ({ ...s, attendance: s.status || 'none', seatRow: r, seatCol: c } as any) : undefined;
                    }}
                    onCellClick={(r, c, student) => student && handleSwipe(student.id, student.status === 'present' ? 'right' : 'left')}
                    onDrop={() => {}}
                />
            </CardContent>
        </Card>
      )}

      <Card className="sticky bottom-4 z-40">
        <CardContent className="py-3 flex items-center gap-3">
          <input placeholder="נושא השיעור..." value={topic} onChange={e => setTopic(e.target.value)} className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none" />
          <Button disabled={unmarkedCount === students.length}>שמור</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default RollCallPage;
