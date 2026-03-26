import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Calendar, Clock, BookOpen, MapPin, CheckCircle2 } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface TutoringSession {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  max_students: number | null;
  status: string;
  teacher_id: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planned: { label: "מתוכנן", color: "bg-info/10 text-info border-info/30" },
  active: { label: "פעיל", color: "bg-success/10 text-success border-success/30" },
  completed: { label: "הושלם", color: "bg-muted text-muted-foreground" },
  cancelled: { label: "בוטל", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

const TutoringManagementPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    title: "", subject: "", description: "",
    session_date: "", start_time: "", end_time: "",
    room: "", max_students: "",
  });

  const loadSessions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tutoring_sessions")
      .select("*")
      .eq("school_id", profile.schoolId!)
      .order("session_date", { ascending: true });
    setSessions(data || []);
    setLoading(false);
  };

  useEffect(() => { if (profile.schoolId) loadSessions(); }, [profile.schoolId]);

  const handleCreate = async () => {
    if (!form.title || !form.subject || !form.session_date) {
      toast({ title: "שגיאה", description: "נא למלא שם, מקצוע ותאריך", variant: "destructive" });
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles").select("grade")
      .eq("user_id", profile.id).eq("role", "grade_coordinator").maybeSingle();

    if (!roleData?.grade) {
      toast({ title: "שגיאה", description: "לא נמצאה שכבה", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("tutoring_sessions").insert({
      school_id: profile.schoolId!,
      grade: roleData.grade,
      title: form.title,
      subject: form.subject,
      description: form.description || null,
      session_date: form.session_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      room: form.room || null,
      max_students: form.max_students ? parseInt(form.max_students) : null,
      created_by: profile.id,
    });

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "✅ תגבור נוצר בהצלחה" });
    setForm({ title: "", subject: "", description: "", session_date: "", start_time: "", end_time: "", room: "", max_students: "" });
    setDialogOpen(false);
    loadSessions();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-warning" />
            ניהול תגבורים
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">ארגון שעות תגבור, שיבוץ מורים וקבוצות תלמידים</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> תגבור חדש</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">יצירת תגבור חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">שם התגבור</label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="מרתון מתמטיקה..." />
                </div>
                <div>
                  <label className="text-sm font-medium">מקצוע</label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="מתמטיקה..." />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">תיאור</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">תאריך</label>
                  <Input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">שעת התחלה</label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">שעת סיום</label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">חדר</label>
                  <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="חדר 204..." />
                </div>
                <div>
                  <label className="text-sm font-medium">מקסימום תלמידים</label>
                  <Input type="number" value={form.max_students} onChange={(e) => setForm({ ...form, max_students: e.target.value })} placeholder="20" />
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full">צור תגבור</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">טוען...</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-heading font-medium">אין תגבורים מתוכננים</p>
            <p className="text-sm mt-1">צור תגבור חדש כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => {
            const statusConf = STATUS_LABELS[s.status] || STATUS_LABELS.planned;
            return (
              <Card key={s.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-heading font-bold">{s.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusConf.color}`}>{statusConf.label}</span>
                  </div>
                  <Badge variant="secondary" className="mb-2">{s.subject}</Badge>
                  {s.description && <p className="text-xs text-muted-foreground mb-2">{s.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(s.session_date), "dd/MM/yyyy")}</span>
                    {s.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.start_time.slice(0, 5)}{s.end_time && ` - ${s.end_time.slice(0, 5)}`}</span>}
                    {s.room && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.room}</span>}
                    {s.max_students && <span className="flex items-center gap-1"><Users className="h-3 w-3" />עד {s.max_students}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default TutoringManagementPage;
