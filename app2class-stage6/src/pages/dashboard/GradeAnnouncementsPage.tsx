import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Megaphone, Plus, Send, Eye, EyeOff, Calendar } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  content: string;
  announcement_type: string;
  target_audience: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  general: "כללי",
  exam_schedule: "לוח מבחנים",
  event: "אירוע",
  urgent: "דחוף",
  logistics: "לוגיסטיקה",
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: "כולם",
  students: "תלמידים",
  parents: "הורים",
  teachers: "מורים",
  homeroom_teachers: "מחנכים",
};

const GradeAnnouncementsPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    title: "", content: "", announcement_type: "general", target_audience: "all",
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("grade_announcements")
      .select("*")
      .eq("school_id", profile.schoolId!)
      .order("created_at", { ascending: false });
    setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => { if (profile.schoolId) loadAnnouncements(); }, [profile.schoolId]);

  const handleCreate = async (publish: boolean) => {
    if (!form.title || !form.content) {
      toast({ title: "שגיאה", description: "נא למלא כותרת ותוכן", variant: "destructive" });
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles").select("grade")
      .eq("user_id", profile.id).eq("role", "grade_coordinator").maybeSingle();

    if (!roleData?.grade) {
      toast({ title: "שגיאה", description: "לא נמצאה שכבה", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("grade_announcements").insert({
      school_id: profile.schoolId!,
      grade: roleData.grade,
      title: form.title,
      content: form.content,
      announcement_type: form.announcement_type,
      target_audience: form.target_audience,
      published: publish,
      published_at: publish ? new Date().toISOString() : null,
      created_by: profile.id,
    });

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: publish ? "✅ הודעה פורסמה" : "✅ טיוטה נשמרה" });
    setForm({ title: "", content: "", announcement_type: "general", target_audience: "all" });
    setDialogOpen(false);
    loadAnnouncements();
  };

  const togglePublish = async (id: string, currentlyPublished: boolean) => {
    const { error } = await supabase
      .from("grade_announcements")
      .update({
        published: !currentlyPublished,
        published_at: !currentlyPublished ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    loadAnnouncements();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-info" />
            הודעות שכבתיות
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">עדכונים, לוחות זמנים והנחיות לשכבה</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> הודעה חדשה</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">הודעה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium">כותרת</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="עדכון לוח מבחנים..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">סוג</label>
                  <Select value={form.announcement_type} onValueChange={(v) => setForm({ ...form, announcement_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">קהל יעד</label>
                  <Select value={form.target_audience} onValueChange={(v) => setForm({ ...form, target_audience: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">תוכן</label>
                <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleCreate(true)} className="flex-1 gap-2"><Send className="h-4 w-4" /> פרסם</Button>
                <Button variant="outline" onClick={() => handleCreate(false)} className="gap-2"><EyeOff className="h-4 w-4" /> שמור כטיוטה</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">טוען...</div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-heading font-medium">אין הודעות</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id} className={!a.published ? "opacity-70 border-dashed" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-heading font-bold">{a.title}</h3>
                      <Badge variant={a.announcement_type === "urgent" ? "destructive" : "outline"} className="text-[10px]">
                        {TYPE_LABELS[a.announcement_type] || a.announcement_type}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {AUDIENCE_LABELS[a.target_audience] || a.target_audience}
                      </Badge>
                      {!a.published && <Badge variant="outline" className="text-[10px]">טיוטה</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line mt-2">{a.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => togglePublish(a.id, a.published)}>
                    {a.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default GradeAnnouncementsPage;
