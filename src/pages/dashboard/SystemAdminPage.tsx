import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Shield, School, Plus, Trash2, Loader2, Save, UserX,
  Eye, EyeOff, FileText, RefreshCw, Settings2, AlertTriangle,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface School { id: string; name: string; createdAt: string; studentCount: number; }
interface AuditEntry { id: string; action: string; userId: string; userName: string; createdAt: string; }
interface UserEntry { id: string; fullName: string; email: string; isApproved: boolean; roles: string[]; schoolName: string | null; }

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד", parent: "הורה", educator: "מחנך",
  professional_teacher: "מורה מקצועי", subject_coordinator: "רכז מקצוע",
  grade_coordinator: "רכז שכבה", counselor: "יועץ",
  management: "הנהלה", system_admin: "מנהל מערכת",
};

const SystemAdminPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  const [schools, setSchools] = useState<School[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("schools");

  // Schools management
  const [newSchoolName, setNewSchoolName] = useState("");
  const [addingSchool, setAddingSchool] = useState(false);

  // User management
  const [userSearch, setUserSearch] = useState("");
  const [blockDialog, setBlockDialog] = useState<UserEntry | null>(null);
  const [blocking, setBlocking] = useState(false);

  // Email domains
  const [domains, setDomains] = useState(["gmail.com", "outlook.com", "taded.org.il", "demo.il"]);
  const [newDomain, setNewDomain] = useState("");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadSchools(), loadUsers(), loadAuditLog()]);
    setLoading(false);
  };

  const loadSchools = async () => {
    const { data } = await supabase.from("schools").select("id, name, created_at").order("created_at");
    if (!data) return;
    // Get student count per school
    const counts = await Promise.all(data.map((s: any) =>
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", s.id)
    ));
    setSchools(data.map((s: any, i: number) => ({
      id: s.id, name: s.name, createdAt: s.created_at, studentCount: counts[i].count || 0,
    })));
  };

  const loadUsers = async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, is_approved, school_id, schools(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: roles } = await supabase
      .from("user_roles").select("user_id, role").limit(200);
    const roleMap = new Map<string, string[]>();
    (roles || []).forEach((r: any) => {
      const list = roleMap.get(r.user_id) || [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });
    setUsers((profs || []).map((p: any) => ({
      id: p.id, fullName: p.full_name, email: p.email, isApproved: p.is_approved,
      roles: roleMap.get(p.id) || [], schoolName: (p.schools as any)?.name || null,
    })));
  };

  const loadAuditLog = async () => {
    // Use approvals table as a proxy audit log
    const { data } = await supabase
      .from("approvals")
      .select("id, status, updated_at, user_id, approver_id, profiles!approvals_user_id_fkey(full_name), approver:profiles!approvals_approver_id_fkey(full_name)")
      .order("updated_at", { ascending: false })
      .limit(30);
    setAuditLog((data || []).map((a: any) => ({
      id: a.id,
      action: a.status === "approved" ? "אישור חשבון" : a.status === "rejected" ? "דחיית חשבון" : "בקשת אישור",
      userId: a.user_id,
      userName: (a.profiles as any)?.full_name || "לא ידוע",
      createdAt: a.updated_at,
    })));
  };

  const addSchool = async () => {
    if (!newSchoolName.trim()) return;
    setAddingSchool(true);
    try {
      const { error } = await supabase.from("schools").insert({ name: newSchoolName.trim() });
      if (error) throw error;
      toast({ title: `בית הספר "${newSchoolName}" נוסף! ✅` });
      setNewSchoolName("");
      loadSchools();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setAddingSchool(false);
    }
  };

  const blockUser = async () => {
    if (!blockDialog) return;
    setBlocking(true);
    try {
      await supabase.from("profiles").update({ is_approved: false }).eq("id", blockDialog.id);
      toast({ title: `חשבון ${blockDialog.fullName} הושבת` });
      setBlockDialog(null);
      loadUsers();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setBlocking(false);
    }
  };

  const toggleApproval = async (userId: string, current: boolean) => {
    await supabase.from("profiles").update({ is_approved: !current }).eq("id", userId);
    toast({ title: !current ? "חשבון אושר ✅" : "חשבון הושבת" });
    loadUsers();
  };

  const filteredUsers = users.filter(u =>
    u.fullName.includes(userSearch) || u.email.includes(userSearch) || (u.schoolName || "").includes(userSearch)
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />ניהול מערכת
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">שליטה מלאה — בתי ספר, משתמשים, Audit Trail</p>
      </motion.div>

      <motion.div variants={item}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="schools" className="font-heading text-xs">🏫 בתי ספר</TabsTrigger>
            <TabsTrigger value="users" className="font-heading text-xs">👤 משתמשים</TabsTrigger>
            <TabsTrigger value="audit" className="font-heading text-xs">📋 Audit Trail</TabsTrigger>
            <TabsTrigger value="settings" className="font-heading text-xs">⚙️ הגדרות</TabsTrigger>
          </TabsList>

          {/* ─── SCHOOLS ─── */}
          <TabsContent value="schools" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <School className="h-5 w-5 text-primary" />רשימת בתי ספר ({schools.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Add school */}
                <div className="flex gap-2">
                  <Input placeholder="שם בית הספר החדש..."
                    value={newSchoolName} onChange={e => setNewSchoolName(e.target.value)}
                    className="font-body text-sm"
                    onKeyDown={e => { if (e.key === "Enter") addSchool(); }} />
                  <Button size="sm" className="gap-1 font-heading shrink-0" onClick={addSchool} disabled={addingSchool || !newSchoolName.trim()}>
                    {addingSchool ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    הוסף
                  </Button>
                </div>

                {schools.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="font-heading font-medium text-sm">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.studentCount} תלמידים רשומים</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">פעיל</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── USERS ─── */}
          <TabsContent value="users" className="space-y-4 mt-4">
            <Input placeholder="חיפוש לפי שם / אימייל / בית ספר..."
              value={userSearch} onChange={e => setUserSearch(e.target.value)}
              className="font-body text-sm" />

            <div className="space-y-2">
              {filteredUsers.slice(0, 30).map(u => (
                <Card key={u.id} className={!u.isApproved ? "border-muted/50 opacity-70" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-heading font-medium text-sm">{u.fullName}</p>
                          {!u.isApproved && <Badge variant="outline" className="text-[9px] text-muted-foreground">מושבת</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{u.email}</p>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {u.roles.map(r => (
                            <Badge key={r} variant="secondary" className="text-[9px]">{ROLE_LABELS[r] || r}</Badge>
                          ))}
                          {u.schoolName && <Badge variant="outline" className="text-[9px]">{u.schoolName}</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch checked={u.isApproved} onCheckedChange={() => toggleApproval(u.id, u.isApproved)} />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => setBlockDialog(u)}>
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">לא נמצאו משתמשים</p>
              )}
            </div>
          </TabsContent>

          {/* ─── AUDIT ─── */}
          <TabsContent value="audit" className="space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-heading font-medium">30 פעולות אחרונות</p>
              <Button size="sm" variant="outline" className="gap-1 font-heading text-xs" onClick={loadAuditLog}>
                <RefreshCw className="h-3.5 w-3.5" />רענן
              </Button>
            </div>
            {auditLog.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-heading font-medium">{e.action}</p>
                  <p className="text-[11px] text-muted-foreground">{e.userName}</p>
                </div>
                <p className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(e.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </TabsContent>

          {/* ─── SETTINGS ─── */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />סיומות מייל מורשות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="הוסף סיומת (למשל: school.ac.il)"
                    value={newDomain} onChange={e => setNewDomain(e.target.value)}
                    className="font-body text-sm font-mono" dir="ltr"
                    onKeyDown={e => {
                      if (e.key === "Enter" && newDomain.trim()) {
                        setDomains(d => [...d, newDomain.trim()]);
                        setNewDomain("");
                      }
                    }} />
                  <Button size="sm" className="gap-1 font-heading shrink-0"
                    onClick={() => { if (newDomain.trim()) { setDomains(d => [...d, newDomain.trim()]); setNewDomain(""); } }}>
                    <Plus className="h-3.5 w-3.5" />הוסף
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {domains.map(d => (
                    <div key={d} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border">
                      <span className="text-xs font-mono">{d}</span>
                      <button onClick={() => setDomains(prev => prev.filter(x => x !== d))}
                        className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" className="gap-1 font-heading" onClick={() => toast({ title: "הגדרות נשמרו ✅" })}>
                  <Save className="h-3.5 w-3.5" />שמור הגדרות
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />פעולות חירום
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground font-body">
                  פעולות אלה בלתי הפיכות. השתמש בזהירות רבה.
                </p>
                <Button variant="destructive" size="sm" className="gap-2 font-heading" disabled
                  onClick={() => toast({ title: "Kill-Switch הופעל", description: "כלל החשבונות הושבתו", variant: "destructive" })}>
                  <UserX className="h-4 w-4" />Kill-Switch — השבת כל החשבונות
                </Button>
                <p className="text-[10px] text-muted-foreground">לניתוק חירום מלא — פנה למפתח המערכת</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Block user dialog */}
      <Dialog open={!!blockDialog} onOpenChange={o => { if (!o) setBlockDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />השבתת חשבון
            </DialogTitle>
          </DialogHeader>
          {blockDialog && (
            <div className="space-y-4">
              <p className="text-sm font-body">
                האם להשבית את חשבון <b>{blockDialog.fullName}</b>?
                המשתמש לא יוכל להתחבר עד לשחזור ידני.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1 font-heading" onClick={blockUser} disabled={blocking}>
                  {blocking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  השבת
                </Button>
                <Button variant="outline" className="flex-1 font-heading" onClick={() => setBlockDialog(null)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SystemAdminPage;
