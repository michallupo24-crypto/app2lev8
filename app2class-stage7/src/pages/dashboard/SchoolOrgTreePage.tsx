import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users, GraduationCap, BookOpen, ChevronLeft,
  Search, Building2, Shield, Briefcase
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

interface ClassNode {
  id: string;
  grade: string;
  classNumber: number;
  students: PersonNode[];
  parents: PersonNode[];
  educator: PersonNode | null;
}

interface OrgStats {
  totalStaff: number;
  totalStudents: number;
  totalParents: number;
  totalClasses: number;
  subjectCoordinators: number;
  gradeCoordinators: number;
  educators: number;
  teachers: number;
}

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד/ה",
  parent: "הורה",
  educator: "מחנך/ת",
  professional_teacher: "מורה מקצועי/ת",
  subject_coordinator: "רכז/ת מקצוע",
  grade_coordinator: "רכז/ת שכבה",
  counselor: "יועץ/ת",
  management: "הנהלה",
  system_admin: "מנהל/ת מערכת",
};

const SchoolOrgTreePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Data
  const [subjectCoordinators, setSubjectCoordinators] = useState<PersonNode[]>([]);
  const [gradeCoordinators, setGradeCoordinators] = useState<PersonNode[]>([]);
  const [teachers, setTeachers] = useState<PersonNode[]>([]);
  const [classes, setClasses] = useState<ClassNode[]>([]);
  const [otherStaff, setOtherStaff] = useState<PersonNode[]>([]);
  const [stats, setStats] = useState<OrgStats>({
    totalStaff: 0, totalStudents: 0, totalParents: 0, totalClasses: 0,
    subjectCoordinators: 0, gradeCoordinators: 0, educators: 0, teachers: 0,
  });

  // Teacher -> classes mapping
  const [teacherClasses, setTeacherClasses] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const load = async () => {
      if (!profile.schoolId) return;

      // Fetch all profiles, roles, avatars, classes for this school
      const [profilesRes, rolesRes, avatarsRes, classesRes, teacherClassesRes, parentStudentRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, class_id").eq("school_id", profile.schoolId),
        supabase.from("user_roles").select("user_id, role, subject, grade, homeroom_class_id"),
        supabase.from("avatars").select("user_id, face_shape, eye_color, skin_color, hair_style, hair_color"),
        supabase.from("classes").select("id, grade, class_number").eq("school_id", profile.schoolId).order("grade").order("class_number"),
        supabase.from("teacher_classes").select("user_id, class_id"),
        supabase.from("parent_student").select("parent_id, student_id"),
      ]);

      const allProfiles = profilesRes.data || [];
      const allRoles = rolesRes.data || [];
      const allAvatars = avatarsRes.data || [];
      const allClasses = classesRes.data || [];
      const allTeacherClasses = teacherClassesRes.data || [];
      const allParentStudent = parentStudentRes.data || [];

      // Build avatar map
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

      // Build roles map
      const rolesMap: Record<string, { role: string; subject?: string | null; grade?: string | null; homeroom_class_id?: string | null }[]> = {};
      for (const r of allRoles) {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r);
      }

      // Build person nodes
      const personMap: Record<string, PersonNode> = {};
      for (const p of allProfiles) {
        const userRoles = rolesMap[p.id] || [];
        personMap[p.id] = {
          id: p.id,
          fullName: p.full_name,
          email: p.email,
          avatar: avatarMap[p.id] || null,
          roles: userRoles.map(r => r.role),
          subject: userRoles.find(r => r.subject)?.subject || null,
          grade: userRoles.find(r => r.grade)?.grade || null,
          classId: p.class_id,
        };
      }

      // Categorize
      const subCoords: PersonNode[] = [];
      const grCoords: PersonNode[] = [];
      const teacherList: PersonNode[] = [];
      const other: PersonNode[] = [];

      for (const [id, person] of Object.entries(personMap)) {
        if (person.roles.includes("student") || person.roles.includes("parent")) continue;
        if (person.roles.includes("subject_coordinator")) subCoords.push(person);
        else if (person.roles.includes("grade_coordinator")) grCoords.push(person);
        else if (person.roles.includes("professional_teacher") || person.roles.includes("educator")) teacherList.push(person);
        else if (person.roles.includes("counselor") || (person.roles.includes("management") && person.id !== profile.id) || person.roles.includes("system_admin")) other.push(person);
      }

      // Teacher-classes mapping
      const tcMap: Record<string, string[]> = {};
      for (const tc of allTeacherClasses) {
        if (!tcMap[tc.user_id]) tcMap[tc.user_id] = [];
        tcMap[tc.user_id].push(tc.class_id);
      }

      // Build class nodes
      const classNodes: ClassNode[] = allClasses.map(cls => {
        // Find educator for this class
        const educatorRole = allRoles.find(r => r.role === "educator" && r.homeroom_class_id === cls.id);
        const educator = educatorRole ? personMap[educatorRole.user_id] || null : null;

        // Find students in this class
        const students = Object.values(personMap).filter(p => p.roles.includes("student") && p.classId === cls.id);

        // Find parents of students in this class
        const studentIds = new Set(students.map(s => s.id));
        const parentIds = allParentStudent.filter(ps => studentIds.has(ps.student_id)).map(ps => ps.parent_id);
        const parents = [...new Set(parentIds)].map(pid => personMap[pid]).filter(Boolean);

        return {
          id: cls.id,
          grade: cls.grade,
          classNumber: cls.class_number,
          students,
          parents,
          educator,
        };
      });

      // Count stats
      const allStudents = Object.values(personMap).filter(p => p.roles.includes("student"));
      const allParents = Object.values(personMap).filter(p => p.roles.includes("parent"));
      const allStaff = Object.values(personMap).filter(p =>
        p.roles.some(r => ["educator", "professional_teacher", "subject_coordinator", "grade_coordinator", "counselor", "management", "system_admin"].includes(r))
      );

      setSubjectCoordinators(subCoords);
      setGradeCoordinators(grCoords);
      setTeachers(teacherList);
      setClasses(classNodes);
      setOtherStaff(other);
      setTeacherClasses(tcMap);
      setStats({
        totalStaff: allStaff.length,
        totalStudents: allStudents.length,
        totalParents: allParents.length,
        totalClasses: allClasses.length,
        subjectCoordinators: subCoords.length,
        gradeCoordinators: grCoords.length,
        educators: teacherList.filter(t => t.roles.includes("educator")).length,
        teachers: teacherList.length,
      });
      setLoading(false);
    };
    load();
  }, [profile.schoolId, profile.id]);

  // Search filtering
  const matchesSearch = (person: PersonNode) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return person.fullName.toLowerCase().includes(q) || person.email.toLowerCase().includes(q);
  };

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Building2 className="h-7 w-7 text-primary" />
          עץ ארגוני - {profile.schoolName || "בית הספר"}
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">מבנה ארגוני מלא של בית הספר</p>
      </motion.div>

      {/* Stats overview */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "צוות", value: stats.totalStaff, icon: Briefcase, color: "text-primary" },
          { label: "תלמידים", value: stats.totalStudents, icon: GraduationCap, color: "text-info" },
          { label: "הורים", value: stats.totalParents, icon: Users, color: "text-success" },
          { label: "כיתות", value: stats.totalClasses, icon: BookOpen, color: "text-warning" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="py-4 text-center">
              <s.icon className={`h-7 w-7 mx-auto mb-1 ${s.color}`} />
              <p className="text-2xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground font-body">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Search */}
      <motion.div variants={item}>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי שם ילד או שם הורה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
      </motion.div>

      {/* Principal (current user) */}
      <motion.div variants={item}>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary shrink-0" />
            {profile.avatar && <AvatarPreview config={profile.avatar} size={40} />}
            <div>
              <p className="font-heading font-bold">{profile.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {profile.roles.map(r => ROLE_LABELS[r] || r).join(" • ")}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Part א: Subject Coordinators → Teachers */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm font-bold">א</span>
              רכזי מקצוע ומורים מקצועיים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subjectCoordinators.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">אין רכזי מקצוע רשומים</p>
            ) : (
              <div className="space-y-1">
                {subjectCoordinators.filter(matchesSearch).map((coord) => (
                  <Collapsible key={coord.id}>
                    <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-right">
                      <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                      {coord.avatar && <AvatarPreview config={coord.avatar} size={32} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-medium text-sm truncate">{coord.fullName}</p>
                        <p className="text-[10px] text-muted-foreground">{coord.subject || "רכז/ת מקצוע"}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">רכז/ת</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mr-10 space-y-1 pb-2">
                        {/* Teachers teaching this subject */}
                        {teachers.filter(t => t.subject === coord.subject && matchesSearch(t)).map(teacher => (
                          <Collapsible key={teacher.id}>
                            <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-right">
                              <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                              {teacher.avatar && <AvatarPreview config={teacher.avatar} size={24} />}
                              <p className="text-sm font-body truncate">{teacher.fullName}</p>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mr-8 space-y-1 pb-1">
                                {(teacherClasses[teacher.id] || []).map(classId => {
                                  const cls = classes.find(c => c.id === classId);
                                  if (!cls) return null;
                                  return (
                                    <div key={classId} className="text-xs text-muted-foreground p-1.5 rounded bg-muted/30">
                                      {cls.grade}'{cls.classNumber}
                                    </div>
                                  );
                                })}
                                {(!teacherClasses[teacher.id] || teacherClasses[teacher.id].length === 0) && (
                                  <p className="text-xs text-muted-foreground p-1.5">אין כיתות משויכות</p>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                        {teachers.filter(t => t.subject === coord.subject).length === 0 && (
                          <p className="text-xs text-muted-foreground p-2">אין מורים רשומים במקצוע זה</p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Part ב: Grade Coordinators → Educators → Students/Parents */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <span className="bg-info/10 text-info px-2 py-0.5 rounded text-sm font-bold">ב</span>
              רכזי שכבה, מחנכים ותלמידים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gradeCoordinators.length === 0 && classes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">אין רכזי שכבה רשומים</p>
            ) : (
              <div className="space-y-1">
                {/* Group by grade */}
                {Array.from(new Set([
                  ...gradeCoordinators.map(gc => gc.grade),
                  ...classes.map(c => c.grade),
                ].filter(Boolean))).sort().map(grade => {
                  const gradeCoords = gradeCoordinators.filter(gc => gc.grade === grade);
                  const gradeClasses = classes.filter(c => c.grade === grade);
                  return (
                    <Collapsible key={grade}>
                      <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-right">
                        <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                        <div className="flex-1 min-w-0">
                          <p className="font-heading font-medium text-sm">שכבת {grade}'</p>
                          <p className="text-[10px] text-muted-foreground">
                            {gradeCoords.length > 0 && `רכז/ת: ${gradeCoords.map(g => g.fullName).join(", ")} • `}
                            {gradeClasses.length} כיתות •{" "}
                            {gradeClasses.reduce((s, c) => s + c.students.length, 0)} תלמידים
                          </p>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mr-8 space-y-1 pb-2">
                          {gradeClasses.map(cls => (
                            <Collapsible key={cls.id}>
                              <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-right">
                                <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-[-90deg]" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-body">
                                    {cls.grade}'{cls.classNumber}
                                    {cls.educator && <span className="text-muted-foreground"> • מחנך/ת: {cls.educator.fullName}</span>}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {cls.students.length} תלמידים • {cls.parents.length} הורים
                                  </p>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mr-6 space-y-1 pb-2">
                                  {/* Students */}
                                  <Collapsible>
                                    <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted/20 text-right">
                                      <GraduationCap className="h-3.5 w-3.5 text-info shrink-0" />
                                      <span className="text-xs font-heading font-medium">רשימת תלמידים ({cls.students.length})</span>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <ScrollArea className="max-h-[200px]">
                                        <div className="mr-6 space-y-0.5 pb-1">
                                          {cls.students.filter(matchesSearch).map(s => (
                                            <div key={s.id} className="flex items-center gap-2 py-1 px-2 rounded text-xs hover:bg-muted/20">
                                              {s.avatar && <AvatarPreview config={s.avatar} size={20} />}
                                              <span className="font-body">{s.fullName}</span>
                                            </div>
                                          ))}
                                          {cls.students.filter(matchesSearch).length === 0 && (
                                            <p className="text-xs text-muted-foreground p-1">
                                              {searchQuery ? "לא נמצאו תוצאות" : "אין תלמידים"}
                                            </p>
                                          )}
                                        </div>
                                      </ScrollArea>
                                    </CollapsibleContent>
                                  </Collapsible>

                                  {/* Parents */}
                                  <Collapsible>
                                    <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted/20 text-right">
                                      <Users className="h-3.5 w-3.5 text-success shrink-0" />
                                      <span className="text-xs font-heading font-medium">רשימת הורים ({cls.parents.length})</span>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <ScrollArea className="max-h-[200px]">
                                        <div className="mr-6 space-y-0.5 pb-1">
                                          {cls.parents.filter(matchesSearch).map(p => (
                                            <div key={p.id} className="flex items-center gap-2 py-1 px-2 rounded text-xs hover:bg-muted/20">
                                              {p.avatar && <AvatarPreview config={p.avatar} size={20} />}
                                              <span className="font-body">{p.fullName}</span>
                                            </div>
                                          ))}
                                          {cls.parents.filter(matchesSearch).length === 0 && (
                                            <p className="text-xs text-muted-foreground p-1">
                                              {searchQuery ? "לא נמצאו תוצאות" : "אין הורים רשומים"}
                                            </p>
                                          )}
                                        </div>
                                      </ScrollArea>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Part ג: Other Staff */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <span className="bg-warning/10 text-warning px-2 py-0.5 rounded text-sm font-bold">ג</span>
              שאר אנשי צוות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {otherStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">אין אנשי צוות נוספים</p>
            ) : (
              <div className="space-y-1">
                {otherStaff.filter(matchesSearch).map(person => (
                  <div key={person.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                    {person.avatar && <AvatarPreview config={person.avatar} size={28} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-body truncate">{person.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {person.roles.map(r => ROLE_LABELS[r] || r).join(", ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default SchoolOrgTreePage;
