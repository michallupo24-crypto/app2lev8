import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users, GraduationCap, BookOpen, ChevronLeft, ChevronRight,
  Search, Building2, Shield, Briefcase, ArrowRight, Trash2, KeyRound, UserCog, Mail, Clock,
  MessageSquare, BookCheck, FileText, Activity,
} from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/hooks/useAuth";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";

interface PersonNode {
  id: string;
  fullName: string;
  email: string;
  avatar: AvatarConfig | null;
  roles: string[];
  subject?: string | null;
  grade?: string | null;
  classId?: string | null;
}

interface SchoolInfo {
  id: string;
  name: string;
}

const ALL_ROLES = [
  { key: "student", label: "תלמיד/ה" },
  { key: "parent", label: "הורה" },
  { key: "educator", label: "מחנך/ת" },
  { key: "professional_teacher", label: "מורה מקצועי/ת" },
  { key: "subject_coordinator", label: "רכז/ת מקצוע" },
  { key: "grade_coordinator", label: "רכז/ת שכבה" },
  { key: "counselor", label: "יועץ/ת" },
  { key: "management", label: "הנהלה" },
  { key: "system_admin", label: "מנהל/ת מערכת" },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ALL_ROLES.map(r => [r.key, r.label]));

const SystemAdminOrgTreePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();

  // State
  const [schools, setSchools] = useState<SchoolInfo[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // School data
  const [people, setPeople] = useState<PersonNode[]>([]);
  const [classes, setClasses] = useState<{ id: string; grade: string; classNumber: number }[]>([]);
  const [teacherClassesMap, setTeacherClassesMap] = useState<Record<string, string[]>>({});
  const [parentStudentMap, setParentStudentMap] = useState<Record<string, string[]>>({});

  // User management dialog
  const [selectedUser, setSelectedUser] = useState<PersonNode | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userAuthInfo, setUserAuthInfo] = useState<{ email: string; created_at: string; last_sign_in_at: string | null; activity?: Record<string, number> } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load schools
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("schools").select("id, name").order("name");
      setSchools(data || []);
      setLoading(false);
    };
    load();
  }, []);

  // Load school org data
  const loadSchool = async (school: SchoolInfo) => {
    setSelectedSchool(school);
    setSchoolLoading(true);
    setSearchQuery("");

    const [profilesRes, rolesRes, avatarsRes, classesRes, tcRes, psRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, class_id").eq("school_id", school.id),
      supabase.from("user_roles").select("user_id, role, subject, grade, homeroom_class_id"),
      supabase.from("avatars").select("user_id, face_shape, eye_color, skin_color, hair_style, hair_color"),
      supabase.from("classes").select("id, grade, class_number").eq("school_id", school.id).order("grade").order("class_number"),
      supabase.from("teacher_classes").select("user_id, class_id"),
      supabase.from("parent_student").select("parent_id, student_id"),
    ]);

    const allProfiles = profilesRes.data || [];
    const allRoles = rolesRes.data || [];
    const allAvatars = avatarsRes.data || [];

    // Avatar map
    const avatarMap: Record<string, AvatarConfig> = {};
    for (const a of allAvatars) {
      avatarMap[a.user_id] = {
        body_type: a.face_shape || "basic",
        eye_color: a.eye_color || "brown",
        skin: a.skin_color || "#FDDBB4",
        hair_style: a.hair_style || "boy",
        hair_color: a.hair_color || "#2C1A0E",
      };
    }

    // Roles map
    const rolesMap: Record<string, { role: string; subject?: string | null; grade?: string | null }[]> = {};
    for (const r of allRoles) {
      if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
      rolesMap[r.user_id].push(r);
    }

    // Person nodes - only profiles in this school
    const profileIds = new Set(allProfiles.map(p => p.id));
    const personList: PersonNode[] = allProfiles.map(p => {
      const userRoles = rolesMap[p.id] || [];
      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        avatar: avatarMap[p.id] || null,
        roles: userRoles.map(r => r.role),
        subject: userRoles.find(r => r.subject)?.subject || null,
        grade: userRoles.find(r => r.grade)?.grade || null,
        classId: p.class_id,
      };
    });

    // Teacher classes
    const tcMap: Record<string, string[]> = {};
    for (const tc of (tcRes.data || [])) {
      if (!profileIds.has(tc.user_id)) continue;
      if (!tcMap[tc.user_id]) tcMap[tc.user_id] = [];
      tcMap[tc.user_id].push(tc.class_id);
    }

    // Parent-student
    const psMap: Record<string, string[]> = {};
    for (const ps of (psRes.data || [])) {
      if (!psMap[ps.student_id]) psMap[ps.student_id] = [];
      psMap[ps.student_id].push(ps.parent_id);
    }

    setPeople(personList);
    setClasses((classesRes.data || []).map(c => ({ id: c.id, grade: c.grade, classNumber: c.class_number })));
    setTeacherClassesMap(tcMap);
    setParentStudentMap(psMap);
    setSchoolLoading(false);
  };

  // Open user dialog
  const openUserDialog = async (person: PersonNode) => {
    setSelectedUser(person);
    setEditRoles([...person.roles]);
    setNewPassword("");
    setConfirmDelete(false);
    setUserAuthInfo(null);
    setUserDialogOpen(true);

    // Fetch auth info
    try {
      const { data } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "get_user", userId: person.id },
      });
      if (data && !data.error) setUserAuthInfo(data);
    } catch {}
  };

  // Save role changes
  const handleSaveRoles = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "update_roles", userId: selectedUser.id, roles: editRoles },
      });
      if (data?.error) throw new Error(data.error);
      toast({ title: "התפקידים עודכנו בהצלחה ✅" });
      // Update local state
      setPeople(prev => prev.map(p => p.id === selectedUser.id ? { ...p, roles: editRoles } : p));
      setSelectedUser(prev => prev ? { ...prev, roles: editRoles } : prev);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // Reset password
  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "reset_password", userId: selectedUser.id, newPassword },
      });
      if (data?.error) throw new Error(data.error);
      toast({ title: "הסיסמה אופסה בהצלחה 🔑" });
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // Delete user
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete_user", userId: selectedUser.id },
      });
      if (data?.error) throw new Error(data.error);
      toast({ title: "המשתמש נמחק בהצלחה 🗑️" });
      setPeople(prev => prev.filter(p => p.id !== selectedUser.id));
      setUserDialogOpen(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const matchesSearch = (person: PersonNode) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return person.fullName.toLowerCase().includes(q) || person.email.toLowerCase().includes(q);
  };

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  // Person row component
  const PersonRow = ({ person, indent = false }: { person: PersonNode; indent?: boolean }) => (
    <button
      onClick={() => openUserDialog(person)}
      className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-primary/5 transition-colors text-right ${indent ? "mr-6" : ""}`}
    >
      <div className="shrink-0">
        {person.avatar ? (
          <AvatarPreview config={person.avatar} size={28} />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-muted-foreground/40">
              <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" fill="currentColor" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-body truncate">{person.fullName}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {person.roles.map(r => ROLE_LABELS[r] || r).join(" • ")}
        </p>
      </div>
      <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0" />
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Schools list view
  if (!selectedSchool) {
    return (
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={item}>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            ניהול מערכת - כל בתי הספר
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">בחר בית ספר לצפייה בעץ הארגוני</p>
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schools.map(school => (
            <Card
              key={school.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
              onClick={() => loadSchool(school)}
            >
              <CardContent className="py-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold truncate">{school.name}</p>
                  <p className="text-xs text-muted-foreground">לחץ לצפייה בעץ הארגוני</p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
          {schools.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-10">אין בתי ספר רשומים במערכת</p>
          )}
        </motion.div>
      </motion.div>
    );
  }

  // School org tree view
  const management = people.filter(p => p.roles.includes("management") && matchesSearch(p));
  const subjectCoords = people.filter(p => p.roles.includes("subject_coordinator") && matchesSearch(p));
  const gradeCoords = people.filter(p => p.roles.includes("grade_coordinator") && matchesSearch(p));
  const educators = people.filter(p => p.roles.includes("educator") && matchesSearch(p));
  const profTeachers = people.filter(p => p.roles.includes("professional_teacher") && matchesSearch(p));
  const counselors = people.filter(p => p.roles.includes("counselor") && matchesSearch(p));
  const students = people.filter(p => p.roles.includes("student") && matchesSearch(p));
  const parents = people.filter(p => p.roles.includes("parent") && matchesSearch(p));

  const grades = Array.from(new Set(classes.map(c => c.grade))).sort();

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedSchool(null); setPeople([]); }}>
          <ArrowRight className="h-4 w-4 ml-1" />
          חזרה
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            {selectedSchool.name}
          </h1>
          <p className="text-sm text-muted-foreground font-body">
            {people.length} משתמשים • {classes.length} כיתות
          </p>
        </div>
      </motion.div>

      {schoolLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Search */}
          <motion.div variants={item}>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש משתמש..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "הנהלה", value: management.length, icon: Shield },
              { label: "צוות הוראה", value: subjectCoords.length + profTeachers.length + educators.length, icon: Briefcase },
              { label: "תלמידים", value: students.length, icon: GraduationCap },
              { label: "הורים", value: parents.length, icon: Users },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="py-3 text-center">
                  <s.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl font-heading font-bold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* Management */}
          {management.length > 0 && (
            <motion.div variants={item}>
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    הנהלה
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {management.map(p => <PersonRow key={p.id} person={p} />)}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Subject Branch */}
          <motion.div variants={item}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">א</span>
                  ענף מקצועי
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subjectCoords.length === 0 && profTeachers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">אין צוות מקצועי</p>
                ) : (
                  <div className="space-y-1">
                    {subjectCoords.map(coord => (
                      <Collapsible key={coord.id}>
                        <div className="flex items-center">
                          <CollapsibleTrigger className="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-right">
                            <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                            <div className="shrink-0">{coord.avatar ? <AvatarPreview config={coord.avatar} size={28} /> : null}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-heading font-medium truncate">{coord.fullName}</p>
                              <p className="text-[10px] text-muted-foreground">{coord.subject || "רכז/ת מקצוע"}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">רכז/ת</Badge>
                          </CollapsibleTrigger>
                          <button onClick={() => openUserDialog(coord)} className="p-2 hover:bg-muted/50 rounded-lg">
                            <UserCog className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>
                        <CollapsibleContent>
                          <div className="mr-8 space-y-1 pb-2">
                            {profTeachers.filter(t => t.subject === coord.subject).map(t => (
                              <PersonRow key={t.id} person={t} />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                    {/* Teachers without a matching coordinator */}
                    {profTeachers.filter(t => !subjectCoords.some(sc => sc.subject === t.subject)).map(t => (
                      <PersonRow key={t.id} person={t} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Grade Branch */}
          <motion.div variants={item}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <span className="bg-info/10 text-info px-2 py-0.5 rounded text-xs font-bold">ב</span>
                  ענף שכבתי
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {grades.map(grade => {
                    const gCoords = gradeCoords.filter(gc => gc.grade === grade);
                    const gradeClasses = classes.filter(c => c.grade === grade);
                    return (
                      <Collapsible key={grade}>
                        <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-right">
                          <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                          <p className="text-sm font-heading font-medium">שכבת {grade}'</p>
                          <span className="text-[10px] text-muted-foreground">
                            {gCoords.length > 0 && `רכז: ${gCoords.map(g => g.fullName).join(", ")} • `}
                            {gradeClasses.length} כיתות
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mr-6 space-y-1 pb-2">
                            {gCoords.map(gc => <PersonRow key={gc.id} person={gc} />)}
                            {gradeClasses.map(cls => {
                              const classEducator = educators.find(e => {
                                // educator with homeroom for this class
                                return people.find(p => p.id === e.id && p.classId === cls.id) !== undefined;
                              });
                              const classStudents = students.filter(s => s.classId === cls.id);
                              return (
                                <Collapsible key={cls.id}>
                                  <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-right">
                                    <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                                    <p className="text-sm font-body">{grade}'{cls.classNumber}</p>
                                    <span className="text-[10px] text-muted-foreground">{classStudents.length} תלמידים</span>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="mr-6 space-y-0.5 pb-1">
                                      {classStudents.map(s => {
                                        const studentParentIds = parentStudentMap[s.id] || [];
                                        const studentParents = studentParentIds.map(pid => people.find(p => p.id === pid)).filter(Boolean) as PersonNode[];
                                        return (
                                          <div key={s.id}>
                                            <PersonRow person={s} />
                                            {studentParents.map(parent => (
                                              <div key={parent.id} className="mr-6">
                                                <PersonRow person={parent} />
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Counselors & Other Staff */}
          {counselors.length > 0 && (
            <motion.div variants={item}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading flex items-center gap-2">
                    <span className="bg-warning/10 text-warning px-2 py-0.5 rounded text-xs font-bold">ג</span>
                    יועצים וצוות נוסף
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {counselors.map(p => <PersonRow key={p.id} person={p} />)}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* User Management Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              ניהול משתמש
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.fullName}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-5">
              {/* Avatar & Info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="shrink-0">
                  {selectedUser.avatar ? (
                    <AvatarPreview config={selectedUser.avatar} size={48} />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-muted-foreground/40">
                        <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" fill="currentColor" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-bold">{selectedUser.fullName}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{selectedUser.email}</span>
                  </div>
                  {userAuthInfo && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      <span>כניסה אחרונה: {userAuthInfo.last_sign_in_at ? new Date(userAuthInfo.last_sign_in_at).toLocaleDateString("he-IL") : "מעולם"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Summary */}
              {userAuthInfo?.activity && (
                <div className="space-y-2">
                  <Label className="font-heading text-sm flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    פעילות משתמש
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "הודעות", value: userAuthInfo.activity.messages, icon: MessageSquare },
                      { label: "נוכחות", value: userAuthInfo.activity.attendance_records, icon: BookCheck },
                      { label: "הגשות", value: userAuthInfo.activity.submissions, icon: FileText },
                      { label: "שיעורים (מורה)", value: userAuthInfo.activity.lessons_taught, icon: BookOpen },
                      { label: "פוסטים", value: userAuthInfo.activity.community_posts, icon: MessageSquare },
                      { label: "הערות", value: userAuthInfo.activity.lesson_notes, icon: FileText },
                    ].filter(a => a.value > 0).map((a, i) => (
                      <div key={i} className="text-center p-2 bg-muted/50 rounded-lg">
                        <a.icon className="h-3.5 w-3.5 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-sm font-bold">{a.value}</p>
                        <p className="text-[10px] text-muted-foreground">{a.label}</p>
                      </div>
                    ))}
                  </div>
                  {Object.values(userAuthInfo.activity).every(v => v === 0) && (
                    <p className="text-xs text-muted-foreground text-center">אין פעילות רשומה</p>
                  )}
                </div>
              )}

              {/* Roles */}
              <div className="space-y-2">
                <Label className="font-heading text-sm flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  תפקידים
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map(role => (
                    <label key={role.key} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                      <Checkbox
                        checked={editRoles.includes(role.key)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditRoles(prev => [...prev, role.key]);
                          } else {
                            setEditRoles(prev => prev.filter(r => r !== role.key));
                          }
                        }}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
                <Button size="sm" onClick={handleSaveRoles} disabled={saving} className="w-full">
                  {saving ? "שומר..." : "שמור תפקידים"}
                </Button>
              </div>

              {/* Reset Password */}
              <div className="space-y-2">
                <Label className="font-heading text-sm flex items-center gap-1">
                  <KeyRound className="h-4 w-4" />
                  איפוס סיסמה
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="סיסמה חדשה (מינ' 6 תווים)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetPassword}
                    disabled={saving || newPassword.length < 6}
                  >
                    אפס
                  </Button>
                </div>
              </div>

              {/* Delete */}
              <div className="border-t pt-4 space-y-2">
                {!confirmDelete ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 ml-1" />
                    מחק משתמש
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-destructive font-heading font-bold text-center">
                      בטוח? פעולה זו בלתי הפיכה!
                    </p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" className="flex-1" onClick={handleDeleteUser} disabled={saving}>
                        {saving ? "מוחק..." : "כן, מחק"}
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)}>
                        ביטול
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SystemAdminOrgTreePage;
