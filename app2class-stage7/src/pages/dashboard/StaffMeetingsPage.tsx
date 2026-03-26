import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Calendar, Clock, MapPin, FileText, Brain } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  protocol: string | null;
  status: string;
  ai_suggested: boolean;
  suggestion_reason: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "מתוכנן", color: "bg-info/10 text-info border-info/30" },
  in_progress: { label: "בתהליך", color: "bg-warning/10 text-warning border-warning/30" },
  completed: { label: "הושלם", color: "bg-success/10 text-success border-success/30" },
  cancelled: { label: "בוטל", color: "bg-muted text-muted-foreground" },
};

const StaffMeetingsPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [protocolEdit, setProtocolEdit] = useState<{ id: string; text: string } | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", meeting_date: "",
    start_time: "", end_time: "", location: "",
  });

  const loadMeetings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff_meetings")
      .select("*")
      .eq("school_id", profile.schoolId!)
      .order("meeting_date", { ascending: false });
    setMeetings(data || []);
    setLoading(false);
  };

  useEffect(() => { if (profile.schoolId) loadMeetings(); }, [profile.schoolId]);

  const handleCreate = async () => {
    if (!form.title || !form.meeting_date) {
      toast({ title: "שגיאה", description: "נא למלא כותרת ותאריך", variant: "destructive" });
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles").select("grade")
      .eq("user_id", profile.id).eq("role", "grade_coordinator").maybeSingle();

    const { error } = await supabase.from("staff_meetings").insert({
      school_id: profile.schoolId!,
      grade: roleData?.grade || null,
      title: form.title,
      description: form.description || null,
      meeting_date: form.meeting_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      organized_by: profile.id,
    });

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "✅ ישיבה נקבעה" });
    setForm({ title: "", description: "", meeting_date: "", start_time: "", end_time: "", location: "" });
    setDialogOpen(false);
    loadMeetings();
  };

  const saveProtocol = async () => {
    if (!protocolEdit) return;
    const { error } = await supabase
      .from("staff_meetings")
      .update({ protocol: protocolEdit.text, status: "completed" })
      .eq("id", protocolEdit.id);

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ פרוטוקול נשמר" });
    setProtocolEdit(null);
    loadMeetings();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-accent" />
            ישיבות צוות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">זימון, ניהול פרוטוקולים וסנכרון מחנכים</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> קבע ישיבה</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">ישיבת צוות חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium">נושא</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ישיבת מחנכים שבועית..." />
              </div>
              <div>
                <label className="text-sm font-medium">תיאור</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">תאריך</label>
                  <Input type="date" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
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
              <div>
                <label className="text-sm font-medium">מיקום</label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="חדר מורים / Zoom..." />
              </div>
              <Button onClick={handleCreate} className="w-full">קבע ישיבה</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">טוען...</div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-heading font-medium">אין ישיבות מתוכננות</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const statusConf = STATUS_LABELS[m.status] || STATUS_LABELS.scheduled;
            return (
              <Card key={m.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-heading font-bold">{m.title}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusConf.color}`}>{statusConf.label}</span>
                        {m.ai_suggested && <Badge variant="outline" className="text-[10px]"><Brain className="h-2.5 w-2.5 ml-1" />הוצע ע"י AI</Badge>}
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground mb-2">{m.description}</p>}
                      {m.suggestion_reason && (
                        <p className="text-xs text-accent mb-2 bg-accent/5 px-2 py-1 rounded">💡 {m.suggestion_reason}</p>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(m.meeting_date), "dd/MM/yyyy")}</span>
                        {m.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.start_time.slice(0, 5)}{m.end_time && ` - ${m.end_time.slice(0, 5)}`}</span>}
                        {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
                      </div>
                      {m.protocol && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs font-heading font-medium mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> פרוטוקול
                          </p>
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{m.protocol}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {m.status !== "completed" && (
                        <Button size="sm" variant="outline"
                          onClick={() => setProtocolEdit({ id: m.id, text: m.protocol || "" })}>
                          <FileText className="h-3 w-3 ml-1" /> פרוטוקול
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Protocol Editor Dialog */}
      <Dialog open={!!protocolEdit} onOpenChange={() => setProtocolEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">עריכת פרוטוקול</DialogTitle>
          </DialogHeader>
          <Textarea
            value={protocolEdit?.text || ""}
            onChange={(e) => protocolEdit && setProtocolEdit({ ...protocolEdit, text: e.target.value })}
            rows={8}
            placeholder="סיכום הישיבה, החלטות, פעולות נדרשות..."
          />
          <Button onClick={saveProtocol} className="w-full">שמור פרוטוקול</Button>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default StaffMeetingsPage;
