import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Plus, CheckCircle2, Clock, XCircle, AlertTriangle, CalendarDays } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface GradeEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  subject: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  requires_parent_approval: boolean;
  notes: string | null;
  created_at: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  exam: "מבחן",
  trip: "טיול",
  ceremony: "טקס",
  activity: "פעילות",
  tutoring: "תגבור",
  meeting: "ישיבה",
  other: "אחר",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  proposed: { label: "ממתין לאישור", color: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  approved: { label: "מאושר", color: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  rejected: { label: "נדחה", color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  cancelled: { label: "בוטל", color: "bg-muted text-muted-foreground", icon: XCircle },
};

const MasterSchedulerPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [events, setEvents] = useState<GradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: "", description: "", event_type: "exam", subject: "",
    event_date: "", start_time: "", end_time: "",
    requires_parent_approval: false, notes: "",
  });

  const loadEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("grade_events")
      .select("*")
      .eq("school_id", profile.schoolId!)
      .order("event_date", { ascending: true });
    setEvents(data || []);
    setLoading(false);
  };

  useEffect(() => { if (profile.schoolId) loadEvents(); }, [profile.schoolId]);

  // Check conflicts when date changes
  useEffect(() => {
    if (!form.event_date || form.event_type !== "exam") {
      setConflictWarning(null);
      return;
    }
    const checkConflicts = async () => {
      const weekStart = new Date(form.event_date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const { data } = await supabase
        .from("grade_events")
        .select("id, title, event_date")
        .eq("school_id", profile.schoolId!)
        .eq("event_type", "exam")
        .in("status", ["proposed", "approved"])
        .gte("event_date", weekStart.toISOString().split("T")[0])
        .lte("event_date", weekEnd.toISOString().split("T")[0]);

      if (data && data.length >= 3) {
        setConflictWarning(`⚠️ כבר ${data.length} מבחנים בשבוע הזה! מומלץ להזיז ליום אחר.`);
      } else if (data && data.some((e: any) => e.event_date === form.event_date)) {
        setConflictWarning("⚠️ כבר קיים מבחן בתאריך הזה. שקול/י תאריך חלופי.");
      } else {
        setConflictWarning(null);
      }
    };
    checkConflicts();
  }, [form.event_date, form.event_type, profile.schoolId]);

  const handleSubmit = async () => {
    if (!form.title || !form.event_date) {
      toast({ title: "שגיאה", description: "נא למלא כותרת ותאריך", variant: "destructive" });
      return;
    }

    // Get coordinator's grade
    const { data: roleData } = await supabase
      .from("user_roles").select("grade")
      .eq("user_id", profile.id).eq("role", "grade_coordinator").maybeSingle();

    if (!roleData?.grade) {
      toast({ title: "שגיאה", description: "לא נמצאה שכבה משויכת", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("grade_events").insert({
      school_id: profile.schoolId!,
      grade: roleData.grade,
      title: form.title,
      description: form.description || null,
      event_type: form.event_type,
      subject: form.subject || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      requires_parent_approval: form.requires_parent_approval,
      notes: form.notes || null,
      proposed_by: profile.id,
    });

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "✅ האירוע נשלח לאישור הנהלה" });
    setForm({ title: "", description: "", event_type: "exam", subject: "", event_date: "", start_time: "", end_time: "", requires_parent_approval: false, notes: "" });
    setDialogOpen(false);
    loadEvents();
  };

  const filteredEvents = filter === "all" ? events : events.filter((e) => e.status === filter);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary" />
            לוח מבחנים ואירועים
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">ניהול לו"ז שכבתי, הצעת מועדים ובדיקת התנגשויות</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> הצע אירוע</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">הצעת אירוע חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">סוג אירוע</label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.event_type === "exam" && (
                  <div>
                    <label className="text-sm font-medium">מקצוע</label>
                    <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="מתמטיקה..." />
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">כותרת</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="מבחן חציוני בהיסטוריה..." />
              </div>
              <div>
                <label className="text-sm font-medium">תיאור</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">תאריך</label>
                  <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
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

              {conflictWarning && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-sm text-warning font-medium">{conflictWarning}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requires_parent_approval}
                  onChange={(e) => setForm({ ...form, requires_parent_approval: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm">דורש אישור הורים (טיולים, אירועים)</label>
              </div>

              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="הערות נוספות..." rows={2} />

              <Button onClick={handleSubmit} className="w-full">שלח הצעה לאישור הנהלה</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "הכל" },
          { key: "proposed", label: "ממתינים" },
          { key: "approved", label: "מאושרים" },
          { key: "rejected", label: "נדחו" },
        ].map((f) => (
          <Button key={f.key} variant={filter === f.key ? "default" : "outline"} size="sm"
            onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-heading font-medium">אין אירועים להצגה</p>
            <p className="text-sm mt-1">הצע אירוע חדש כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => {
            const statusConf = STATUS_CONFIG[event.status] || STATUS_CONFIG.proposed;
            const StatusIcon = statusConf.icon;
            return (
              <Card key={event.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-full text-xs font-heading border ${statusConf.color}`}>
                        <StatusIcon className="h-3 w-3 inline ml-1" />
                        {statusConf.label}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading font-bold text-sm">{event.title}</h3>
                          <Badge variant="outline" className="text-[10px]">
                            {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                          </Badge>
                          {event.subject && (
                            <Badge variant="secondary" className="text-[10px]">{event.subject}</Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{event.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(event.event_date), "dd/MM/yyyy")}
                          </span>
                          {event.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {event.start_time.slice(0, 5)}
                              {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                            </span>
                          )}
                          {event.requires_parent_approval && (
                            <Badge variant="outline" className="text-[10px]">דורש אישור הורים</Badge>
                          )}
                        </div>
                      </div>
                    </div>
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

export default MasterSchedulerPage;
