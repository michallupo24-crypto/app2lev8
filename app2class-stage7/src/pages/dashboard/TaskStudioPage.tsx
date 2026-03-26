import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PenLine, Folders, MessageSquare, Layers,
  FileSpreadsheet, Mountain, Dice5, Flame, Sparkles, Code2,
  Gamepad2, Plus, Wand2, ChevronRight
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ManualQuestionEditor from "@/components/task-studio/ManualQuestionEditor";
import FolderScanMode from "@/components/task-studio/FolderScanMode";
import LiveFeedbackMode from "@/components/task-studio/LiveFeedbackMode";
import FlashcardsMode from "@/components/task-studio/FlashcardsMode";
import SmartTemplateMode from "@/components/task-studio/SmartTemplateMode";
import MountainClimbMode from "@/components/task-studio/MountainClimbMode";
import SnakesAndLaddersMode from "@/components/task-studio/SnakesAndLaddersMode";
import CoopGameMode from "@/components/task-studio/CoopGameMode";
import GamePromptMode from "@/components/task-studio/GamePromptMode";
import BlankHtmlMode from "@/components/task-studio/BlankHtmlMode";
import DataHookMode from "@/components/task-studio/DataHookMode";

interface StudioMode {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: "create" | "game" | "ai" | "tools";
  color: string;
  badge?: string;
}

const STUDIO_MODES: StudioMode[] = [
  { id: "manual", title: "הזנה ידנית", description: "כתיבת בנק שאלות ותשובות במגוון פורמטים", icon: <PenLine className="h-6 w-6" />, category: "create", color: "bg-primary/10 text-primary" },
  { id: "folder-scan", title: "סריקת תיקייה (AI)", description: "הפיכת מצגות וקבצי PDF למשימה אוטומטית", icon: <Folders className="h-6 w-6" />, category: "ai", color: "bg-accent/10 text-accent", badge: "AI" },
  { id: "live-feedback", title: "Live Feedback", description: "הפיכת שאלות מהשיעור האחרון למטלת חזרה", icon: <MessageSquare className="h-6 w-6" />, category: "create", color: "bg-info/10 text-info" },
  { id: "flashcards", title: "Flashcards", description: "כרטיסיות שינון אוטומטיות מהחומר", icon: <Layers className="h-6 w-6" />, category: "create", color: "bg-success/10 text-success" },
  { id: "smart-template", title: "טמפלטים חכמים", description: "בניית מבחן/דף עבודה עם ייבוא מ-PDF", icon: <FileSpreadsheet className="h-6 w-6" />, category: "create", color: "bg-primary/10 text-primary" },
  { id: "mountain-climb", title: "טיפוס על הר", description: "תשובות נכונות מקדמות את האווטאר להצלת נסיכה", icon: <Mountain className="h-6 w-6" />, category: "game", color: "bg-success/10 text-success" },
  { id: "snakes-ladders", title: "נחשים וסולמות", description: "לוח משחק אינטראקטיבי מותנה בפתרון תרגילים", icon: <Dice5 className="h-6 w-6" />, category: "game", color: "bg-destructive/10 text-destructive" },
  { id: "coop-game", title: "בן האש ובת המים", description: "משימת Co-op זוגית עם שיתוף פעולה", icon: <Flame className="h-6 w-6" />, category: "game", color: "bg-warning/10 text-warning" },
  { id: "game-prompt", title: "Game Prompt (AI)", description: "תיאור חופשי לבוט שימציא ויבנה משחק ייעודי", icon: <Sparkles className="h-6 w-6" />, category: "ai", color: "bg-accent/10 text-accent", badge: "AI" },
  { id: "blank-html", title: "Blank HTML Page", description: "דף חלק להדבקת קוד JS/HTML — אופטימיזציה AI אוטומטית", icon: <Code2 className="h-6 w-6" />, category: "tools", color: "bg-muted text-muted-foreground" },
  { id: "data-hook", title: "Data Hook (ציונים)", description: "משיכת נתונים ממשחק והזנה אוטומטית כציונים", icon: <Gamepad2 className="h-6 w-6" />, category: "tools", color: "bg-success/10 text-success" },
];

const TaskStudioPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    const loadAssignments = async () => {
      const { data } = await supabase
        .from("assignments")
        .select("id, title, subject, type, classes(grade, class_number)")
        .eq("teacher_id", profile.id)
        .order("created_at", { ascending: false });
      setAssignments(data || []);
    };
    loadAssignments();
  }, [profile.id]);

  const filteredModes = filterCategory === "all"
    ? STUDIO_MODES
    : STUDIO_MODES.filter((m) => m.category === filterCategory);

  const renderActiveMode = () => {
    if (!activeMode) return null;
    const commonProps = { profile, assignmentId: selectedAssignment, onBack: () => setActiveMode(null) };
    switch (activeMode) {
      case "manual": return <ManualQuestionEditor {...commonProps} />;
      case "folder-scan": return <FolderScanMode {...commonProps} />;
      case "live-feedback": return <LiveFeedbackMode {...commonProps} />;
      case "flashcards": return <FlashcardsMode {...commonProps} />;
      case "smart-template": return <SmartTemplateMode {...commonProps} />;
      case "mountain-climb": return <MountainClimbMode {...commonProps} />;
      case "snakes-ladders": return <SnakesAndLaddersMode {...commonProps} />;
      case "coop-game": return <CoopGameMode {...commonProps} />;
      case "game-prompt": return <GamePromptMode {...commonProps} />;
      case "blank-html": return <BlankHtmlMode {...commonProps} />;
      case "data-hook": return <DataHookMode {...commonProps} />;
      default: return null;
    }
  };

  if (activeMode) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
        {renderActiveMode()}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Wand2 className="h-7 w-7 text-primary" />
            סטודיו משימות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            בחר מצב יצירה כדי לבנות משימה, משחק או בוחן
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <Label className="text-xs text-muted-foreground font-heading">משימה פעילה</Label>
            <Select value={selectedAssignment || ""} onValueChange={setSelectedAssignment}>
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="בחר משימה קיימת..." />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.title} ({a.subject})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" className="mt-4 gap-1 font-heading text-xs" onClick={() => navigate("/dashboard/teacher-assignments")}>
            <Plus className="h-3.5 w-3.5" /> משימה חדשה
          </Button>
        </div>
      </div>

      <Tabs value={filterCategory} onValueChange={setFilterCategory}>
        <TabsList className="grid grid-cols-5 w-full max-w-lg">
          <TabsTrigger value="all" className="font-heading text-xs">הכל</TabsTrigger>
          <TabsTrigger value="create" className="font-heading text-xs">יצירה</TabsTrigger>
          <TabsTrigger value="game" className="font-heading text-xs">משחקים</TabsTrigger>
          <TabsTrigger value="ai" className="font-heading text-xs">AI</TabsTrigger>
          <TabsTrigger value="tools" className="font-heading text-xs">כלים</TabsTrigger>
        </TabsList>
      </Tabs>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
      >
        {filteredModes.map((mode) => (
          <motion.div key={mode.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
            <Card className="cursor-pointer group hover:shadow-lg hover:border-primary/30 transition-all duration-300 h-full" onClick={() => setActiveMode(mode.id)}>
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${mode.color} transition-transform group-hover:scale-110`}>{mode.icon}</div>
                  {mode.badge && <Badge variant="secondary" className="text-[10px] font-heading bg-accent/20 text-accent border-0">{mode.badge}</Badge>}
                </div>
                <h3 className="font-heading font-bold text-sm mb-1">{mode.title}</h3>
                <p className="text-xs text-muted-foreground font-body flex-1">{mode.description}</p>
                <div className="flex items-center justify-end mt-3 text-xs text-primary font-heading opacity-0 group-hover:opacity-100 transition-opacity">
                  התחל <ChevronRight className="h-3.5 w-3.5 mr-0.5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default TaskStudioPage;
