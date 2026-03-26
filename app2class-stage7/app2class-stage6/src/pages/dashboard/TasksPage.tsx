import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Clock, CheckCircle2, AlertTriangle, Upload, Camera, FileText, RotateCcw } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";

interface Task {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  status: "pending" | "submitted" | "graded" | "revision";
  urgency: "red" | "orange" | "green";
  weight: number;
  grade?: number;
  feedback?: string;
}

const TasksPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [tab, setTab] = useState("pending");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  // Mock tasks
  const tasks: Task[] = [
    { id: "1", title: "עבודה בהיסטוריה - מלחמת העולם השנייה", subject: "היסטוריה", dueDate: "2026-02-12", status: "pending", urgency: "red", weight: 15 },
    { id: "2", title: "תרגיל 5 - משוואות ריבועיות", subject: "מתמטיקה", dueDate: "2026-02-14", status: "pending", urgency: "orange", weight: 10 },
    { id: "3", title: "חיבור - My Future Career", subject: "אנגלית", dueDate: "2026-02-20", status: "pending", urgency: "green", weight: 20 },
    { id: "4", title: "ניתוח שיר - רחל", subject: "ספרות", dueDate: "2026-02-08", status: "submitted", urgency: "green", weight: 10 },
    { id: "5", title: "דו\"ח מעבדה - כוחות", subject: "פיזיקה", dueDate: "2026-02-05", status: "graded", urgency: "green", weight: 15, grade: 88, feedback: "עבודה טובה, חסר ניתוח שגיאות" },
    { id: "6", title: "תרגיל 3 - גבולות", subject: "מתמטיקה", dueDate: "2026-02-03", status: "revision", urgency: "red", weight: 10, grade: 65, feedback: "יש לתקן שאלות 3-5" },
  ];

  const filtered = tasks.filter(t => {
    if (tab === "pending") return t.status === "pending";
    if (tab === "submitted") return t.status === "submitted";
    if (tab === "graded") return t.status === "graded";
    if (tab === "revision") return t.status === "revision";
    return true;
  });

  const urgencyDot = (u: string) => u === "red" ? "bg-destructive" : u === "orange" ? "bg-warning" : "bg-success";

  const statusIcon = (s: string) => {
    if (s === "pending") return <Clock className="h-4 w-4 text-warning" />;
    if (s === "submitted") return <Upload className="h-4 w-4 text-info" />;
    if (s === "graded") return <CheckCircle2 className="h-4 w-4 text-success" />;
    return <RotateCcw className="h-4 w-4 text-destructive" />;
  };

  const getDaysLeft = (date: string) => {
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" />
          המשימות שלי
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">ניהול מטלות, הגשות ומשוב</p>
      </motion.div>

      {/* Stats bar */}
      <motion.div variants={item} className="grid grid-cols-4 gap-3">
        {[
          { label: "טרם הוגשו", count: tasks.filter(t => t.status === "pending").length, color: "text-warning", icon: Clock },
          { label: "בבדיקה", count: tasks.filter(t => t.status === "submitted").length, color: "text-info", icon: Upload },
          { label: "קיבלו ציון", count: tasks.filter(t => t.status === "graded").length, color: "text-success", icon: CheckCircle2 },
          { label: "לתיקון", count: tasks.filter(t => t.status === "revision").length, color: "text-destructive", icon: RotateCcw },
        ].map((stat, i) => (
          <Card key={i} className="cursor-pointer" onClick={() => setTab(["pending", "submitted", "graded", "revision"][i])}>
            <CardContent className="py-3 text-center">
              <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
              <p className="text-xl font-heading font-bold">{stat.count}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={item}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="pending" className="font-heading text-xs">⏳ טרם הוגשו</TabsTrigger>
            <TabsTrigger value="submitted" className="font-heading text-xs">📤 בבדיקה</TabsTrigger>
            <TabsTrigger value="graded" className="font-heading text-xs">✅ ציון</TabsTrigger>
            <TabsTrigger value="revision" className="font-heading text-xs">🔄 לתיקון</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Task List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-body">אין משימות בקטגוריה זו</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((task, i) => {
            const daysLeft = getDaysLeft(task.dueDate);
            return (
              <motion.div key={task.id} variants={item}>
                <Card className="hover:shadow-sm transition-all">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${urgencyDot(task.urgency)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {statusIcon(task.status)}
                          <p className="font-heading font-bold text-sm truncate">{task.title}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{task.subject}</span>
                          <span>•</span>
                          <span>{task.weight}% מהציון</span>
                          {task.status === "pending" && daysLeft > 0 && (
                            <>
                              <span>•</span>
                              <span className={daysLeft <= 2 ? "text-destructive font-medium" : ""}>
                                {daysLeft === 1 ? "מחר!" : `עוד ${daysLeft} ימים`}
                              </span>
                            </>
                          )}
                          {task.status === "pending" && daysLeft <= 0 && (
                            <>
                              <span>•</span>
                              <span className="text-destructive font-bold">עבר הזמן!</span>
                            </>
                          )}
                        </div>
                        {task.grade !== undefined && (
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={task.grade >= 80 ? "default" : task.grade >= 60 ? "secondary" : "destructive"}>
                              ציון: {task.grade}
                            </Badge>
                            {task.feedback && <span className="text-xs text-muted-foreground truncate">{task.feedback}</span>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {task.status === "pending" && (
                          <Button size="sm" className="gap-1 font-heading">
                            <Upload className="h-3.5 w-3.5" />
                            הגש
                          </Button>
                        )}
                        {task.status === "revision" && (
                          <Button size="sm" variant="outline" className="gap-1 font-heading text-destructive border-destructive/30">
                            <RotateCcw className="h-3.5 w-3.5" />
                            תקן
                          </Button>
                        )}
                        {task.status === "graded" && (
                          <Button size="sm" variant="ghost" className="gap-1 font-heading text-xs">
                            ערער
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
};

export default TasksPage;
