import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GRADES, SUBJECTS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TeacherWithClasses {
  id: string;
  full_name: string;
  subject: string | null;
  classes: { id: string; class_id: string; grade: string; class_number: number }[];
}

const TeacherAssignmentPage = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<TeacherWithClasses[]>([]);
  const [allClasses, setAllClasses] = useState<{ id: string; grade: string; class_number: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedClass, setSelectedClass] = useState("");

  const loadData = async () => {
    if (!profile?.schoolId) return;
    setLoading(true);

    // Get professional teachers in this school
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("user_id, subject")
      .eq("role", "professional_teacher");

    if (!roleData?.length) {
      setLoading(false);
      return;
    }

    const teacherIds = roleData.map((r) => r.user_id);

    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("school_id", profile.schoolId)
      .in("id", teacherIds);

    // Get existing teacher_classes
    const { data: tcData } = await supabase
      .from("teacher_classes")
      .select("id, user_id, class_id")
      .in("user_id", teacherIds);

    // Get all classes for the school
    const { data: classesData } = await supabase
      .from("classes")
      .select("id, grade, class_number")
      .eq("school_id", profile.schoolId)
      .order("grade")
      .order("class_number");

    if (classesData) setAllClasses(classesData);

    const teacherList: TeacherWithClasses[] = (profiles || []).map((p) => {
      const role = roleData.find((r) => r.user_id === p.id);
      const tcs = (tcData || []).filter((tc) => tc.user_id === p.id);
      const classes = tcs.map((tc) => {
        const cls = (classesData || []).find((c) => c.id === tc.class_id);
        return {
          id: tc.id,
          class_id: tc.class_id,
          grade: cls?.grade || "?",
          class_number: cls?.class_number || 0,
        };
      });
      return {
        id: p.id,
        full_name: p.full_name,
        subject: role?.subject || null,
        classes,
      };
    });

    setTeachers(teacherList.sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [profile?.schoolId]);

  const handleAddClass = async (teacherId: string) => {
    if (!selectedGrade || !selectedClass) return;
    const cls = allClasses.find(
      (c) => c.grade === selectedGrade && c.class_number === parseInt(selectedClass)
    );
    if (!cls) {
      toast({ title: "כיתה לא נמצאה", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("teacher_classes").insert({
      user_id: teacherId,
      class_id: cls.id,
    });

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "כיתה שובצה בהצלחה ✅" });
    setAddingFor(null);
    setSelectedGrade("");
    setSelectedClass("");
    loadData();
  };

  const handleRemoveClass = async (tcId: string) => {
    const { error } = await supabase.from("teacher_classes").delete().eq("id", tcId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "שיבוץ הוסר" });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          שיבוץ מורים לכיתות
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          שיבוץ מורים מקצועיים לכיתות הוראה
        </p>
      </div>

      {teachers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>אין מורים מקצועיים רשומים כרגע</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teachers.map((teacher) => (
            <Card key={teacher.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-heading">{teacher.full_name}</CardTitle>
                    {teacher.subject && (
                      <Badge variant="secondary" className="mt-1">{teacher.subject}</Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setAddingFor(addingFor === teacher.id ? null : teacher.id)}
                  >
                    <Plus className="h-3 w-3" />
                    הוסף כיתה
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Existing classes */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {teacher.classes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">לא שובץ לכיתות עדיין</p>
                  ) : (
                    teacher.classes.map((cls) => (
                      <Badge key={cls.id} variant="outline" className="gap-1 py-1 px-2">
                        {cls.grade}'{cls.class_number}
                        <button
                          onClick={() => handleRemoveClass(cls.id)}
                          className="mr-1 text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>

                {/* Add class form */}
                {addingFor === teacher.id && (
                  <div className="flex gap-2 items-end border-t border-border pt-3 mt-3">
                    <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="שכבה" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADES.map((g) => (
                          <SelectItem key={g} value={g}>{g}'</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="כיתה" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => handleAddClass(teacher.id)}>
                      שבץ
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherAssignmentPage;
