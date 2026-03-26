import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FileText, Plus, Send, CheckCircle2, Clock, Users, AlertTriangle } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ASSIGNMENT_TYPES = [
  { value: "homework", label: "שיעורי בית" },
  { value: "exam", label: "מבחן" },
  { value: "quiz", label: "בוחן" },
  { value: "project", label: "פרויקט" },
  { value: "exercise", label: "תרגיל" },
];

const TeacherAssignmentsPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [tab, setTab] = useState("active");
  const [classes, setClasses] = useState<{ id: string; grade: string; number: number }[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("homework");
  const [newClassId, setNewClassId] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newWeight, setNewWeight] = useState("10");
  const [newAllowLate, setNewAllowLate] = useState(false);
  const [newAllowRevision, setNewAllowRevision] = useState(false);
  const [creating, setCreating] = useState(false);

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
        if (cls.length > 0) setNewClassId(cls[0].id);
      }
    };
    loadClasses();
  }, [profile.id]);

  useEffect(() => {
    loadAssignments();
  }, [profile.id]);

  const loadAssignments = async () => {
    setLoading(true);
    const { data } = await supabase.from("assignments")
      .select("*, classes(grade, class_number)")
      .eq("teacher_id", profile.id)
      .order("created_at", { ascending: false });
    setAssignments(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle || !newClassId || !newSubject) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("assignments").insert({
        teacher_id: profile.id,
        class_id: newClassId,
        subject: newSubject,
        title: newTitle,
        description: newDesc || null,
        type: newType as any,
        due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
        weight_percent: parseInt(newWeight) || 0,
        allow_late_submission: newAllowLate,
        allow_revision: newAllowRevision,
        school_id: profile.schoolId!,
        published: true,
      });
      if (error) throw error;
      toast({ title: "המשימה נוצרה בהצלחה! ✅" });
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewDueDate("");
      loadAssignments();
    } catch (error: any) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  const activeAssignments = assignments.filter(a => a.due_date && new Date(a.due_date) >= new Date());
  const pastAssignments = assignments.filter(a => !a.due_date || new Date(a.due_date) < new Date());

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            ניהול משימות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">יצירה, הפצה ומעקב אחר מטלות</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-heading"><Plus className="h-4 w-4" /> משימה חדשה</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">יצירת משימה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label className="font-heading text-xs">כותרת</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="כותרת המשימה" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-heading text-xs">כיתה</Label>
                  <Select value={newClassId} onValueChange={setNewClassId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.grade}'{c.number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="font-heading text-xs">סוג</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNMENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="font-heading text-xs">מקצוע</Label>
                <Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="מתמטיקה" />
              </div>
              <div className="space-y-1">
                <Label className="font-heading text-xs">תיאור</Label>
                <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="הוראות למשימה..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-heading text-xs">תאריך הגשה</Label>
                  <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label className="font-heading text-xs">משקל בציון (%)</Label>
                  <Input type="number" value={newWeight} onChange={e => setNewWeight(e.target.value)} min="0" max="100" dir="ltr" />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm font-body">
                  <Switch checked={newAllowLate} onCheckedChange={setNewAllowLate} />
                  הגשה באיחור
                </label>
                <label className="flex items-center gap-2 text-sm font-body">
                  <Switch checked={newAllowRevision} onCheckedChange={setNewAllowRevision} />
                  אפשר תיקון
                </label>
              </div>
              <Button className="w-full gap-2 font-heading" onClick={handleCreate} disabled={creating || !newTitle || !newSubject}>
                <Send className="h-4 w-4" />
                {creating ? "יוצר..." : "פרסם משימה"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="active" className="font-heading">פעילות ({activeAssignments.length})</TabsTrigger>
          <TabsTrigger value="past" className="font-heading">עברו ({pastAssignments.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          {(tab === "active" ? activeAssignments : pastAssignments).map((assignment, i) => (
            <motion.div key={assignment.id} variants={item}>
              <Card className="hover:shadow-sm transition-all">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {ASSIGNMENT_TYPES.find(t => t.value === assignment.type)?.label}
                        </Badge>
                        <p className="font-heading font-bold text-sm truncate">{assignment.title}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{assignment.subject}</span>
                        <span>•</span>
                        <span>{assignment.classes?.grade}'{assignment.classes?.class_number}</span>
                        {assignment.due_date && (
                          <>
                            <span>•</span>
                            <span>הגשה: {new Date(assignment.due_date).toLocaleDateString("he-IL")}</span>
                          </>
                        )}
                        {assignment.weight_percent > 0 && (
                          <>
                            <span>•</span>
                            <span>{assignment.weight_percent}% מהציון</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="font-heading text-xs">
                      צפה בהגשות
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {(tab === "active" ? activeAssignments : pastAssignments).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-body">אין משימות {tab === "active" ? "פעילות" : ""}</p>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default TeacherAssignmentsPage;
