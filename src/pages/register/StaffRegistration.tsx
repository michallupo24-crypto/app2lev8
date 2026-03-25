import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import RegistrationLayout from "@/components/registration/RegistrationLayout";
import EmailInput from "@/components/registration/EmailInput";
import AvatarStudio, { defaultAvatarConfig, type AvatarConfig } from "@/components/avatar/AvatarStudio";
import { GRADES, STAFF_ROLES, SUBJECTS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TeachingClass {
  grade: string;
  classNumber: string;
}

interface SelectedRole {
  value: string;
  subject?: string;
  grade?: string;
  grades?: string[];
  homeroomGrade?: string;
  homeroomClass?: string;
}

const StaffRegistration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Fields
  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState("");

  // Roles
  const [selectedRoles, setSelectedRoles] = useState<SelectedRole[]>([]);

  // Teaching classes
  const [teachingClasses, setTeachingClasses] = useState<TeachingClass[]>([{ grade: "", classNumber: "" }]);

  // Avatar
  const [avatar, setAvatar] = useState<AvatarConfig>({
    ...defaultAvatarConfig,
    outfit: "blazer",
    outfitColor: "#1E293B",
  });

  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("schools").select("id, name").then(({ data }) => {
      if (data) setSchools(data);
    });
  }, []);

  const toggleRole = (roleValue: string) => {
    setSelectedRoles((prev) => {
      const exists = prev.find((r) => r.value === roleValue);
      if (exists) return prev.filter((r) => r.value !== roleValue);
      return [...prev, { value: roleValue }];
    });
  };

  const updateRole = (roleValue: string, key: string, value: string) => {
    setSelectedRoles((prev) =>
      prev.map((r) => (r.value === roleValue ? { ...r, [key]: value } : r))
    );
  };

  const addCounselorGrade = (roleValue: string) => {
    setSelectedRoles((prev) =>
      prev.map((r) => {
        if (r.value === roleValue) {
          return { ...r, grades: [...(r.grades || []), ""] };
        }
        return r;
      })
    );
  };

  const updateCounselorGrade = (roleValue: string, idx: number, value: string) => {
    setSelectedRoles((prev) =>
      prev.map((r) => {
        if (r.value === roleValue) {
          const newGrades = [...(r.grades || [])];
          newGrades[idx] = value;
          return { ...r, grades: newGrades };
        }
        return r;
      })
    );
  };

  // Professional teachers get assigned by subject coordinators, not self-selected
  const needsTeachingClasses = selectedRoles.some(
    (r) => !["counselor", "management", "professional_teacher", "subject_coordinator"].includes(r.value)
  );

  const addTeachingClass = () => setTeachingClasses([...teachingClasses, { grade: "", classNumber: "" }]);
  const removeTeachingClass = (idx: number) => setTeachingClasses(teachingClasses.filter((_, i) => i !== idx));
  const updateTeachingClass = (idx: number, key: keyof TeachingClass, value: string) => {
    setTeachingClasses(teachingClasses.map((tc, i) => (i === idx ? { ...tc, [key]: value } : tc)));
  };

  const step1Valid = fullName && idNumber && phone && email && password.length >= 6 && schoolId && selectedRoles.length > 0 &&
    (!needsTeachingClasses || teachingClasses.some((tc) => tc.grade && tc.classNumber));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Registration failed");

      const userId = authData.user.id;

      // Update profile
      await supabase.from("profiles").update({
        full_name: fullName,
        phone,
        id_number: idNumber,
        school_id: schoolId,
      }).eq("id", userId);

      // Add roles
      for (const role of selectedRoles) {
        let homeroomClassId = null;
        if (role.value === "educator" && role.homeroomGrade && role.homeroomClass) {
          const { data: classData } = await supabase
            .from("classes")
            .select("id")
            .eq("school_id", schoolId)
            .eq("grade", role.homeroomGrade as any)
            .eq("class_number", parseInt(role.homeroomClass))
            .single();
          homeroomClassId = classData?.id;
        }

        await supabase.from("user_roles").insert({
          user_id: userId,
          role: role.value as any,
          subject: role.subject || null,
          grade: (role.grade || null) as any,
          homeroom_class_id: homeroomClassId,
        });
      }

      // Add teaching classes
      if (needsTeachingClasses) {
        for (const tc of teachingClasses) {
          if (tc.grade && tc.classNumber) {
            const { data: classData } = await supabase
              .from("classes")
              .select("id")
              .eq("school_id", schoolId)
              .eq("grade", tc.grade as any)
              .eq("class_number", parseInt(tc.classNumber))
              .single();

            if (classData) {
              await supabase.from("teacher_classes").insert({
                user_id: userId,
                class_id: classData.id,
              });
            }
          }
        }
      }

      // Avatar
      await supabase.from("avatars").insert({
        user_id: userId,
        face_shape: avatar.faceShape,
        skin_color: avatar.skinColor,
        eye_shape: avatar.eyeShape,
        eye_color: avatar.eyeColor,
        hair_style: avatar.hairStyle,
        hair_color: avatar.hairColor,
        facial_hair: avatar.facialHair,
        outfit: avatar.outfit,
        outfit_color: avatar.outfitColor,
        accessory: avatar.accessory,
        expression: avatar.expression,
        background: avatar.background,
      });

      // Determine approval role based on STAFF_ROLES config
      const roleConfig = STAFF_ROLES.find((sr) => 
        selectedRoles.some((r) => r.value === sr.value)
      );
      const highestRole = selectedRoles.find((r) => r.value === "management")
        ? "system_admin"
        : selectedRoles.find((r) => r.value === "educator")
        ? "grade_coordinator"
        : selectedRoles.find((r) => r.value === "professional_teacher")
        ? "subject_coordinator"
        : "management";

      await supabase.from("approvals").insert({
        user_id: userId,
        required_role: highestRole as any,
        notes: `צוות חדש: ${fullName}, תפקידים: ${selectedRoles.map((r) => STAFF_ROLES.find((sr) => sr.value === r.value)?.label).join(", ")}`,
      });

      await supabase.auth.signOut();
      setStep(3);
    } catch (error: any) {
      toast({ title: "שגיאה ברישום", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-muted to-background">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
            <CheckCircle2 className="w-24 h-24 text-success mx-auto mb-6" />
          </motion.div>
          <h2 className="text-3xl font-heading font-bold mb-3">הרישום הושלם! 🎉</h2>
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6">
            <p className="text-sm font-heading font-medium text-warning">⏳ ממתין לאישור</p>
            <p className="text-xs text-muted-foreground mt-1">החשבון שלך ייפתח לאחר אישור הגורם המוסמך</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/")}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-heading font-bold shadow-lg"
          >
            חזרה לדף הראשי
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <RegistrationLayout
      title="רישום צוות"
      step={step}
      totalSteps={3}
      onNext={step === 1 ? () => setStep(2) : handleSubmit}
      onBack={() => setStep(step - 1)}
      nextDisabled={step === 1 ? !step1Valid : false}
      nextLabel={step === 2 ? "סיום רישום" : "המשך"}
      loading={loading}
    >
      {step === 1 && (
        <div className="space-y-5">
          <h3 className="text-xl font-heading font-bold mb-4">פרטים אישיים ותפקידים</h3>

          <div className="space-y-2">
            <Label className="font-heading">שם מלא</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">תעודת זהות</Label>
            <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="9 ספרות" dir="ltr" required />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">טלפון</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">דואר אלקטרוני</Label>
            <EmailInput value={email} onChange={setEmail} />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">סיסמה</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="לפחות 6 תווים" dir="ltr" required />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">בית ספר</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger><SelectValue placeholder="בחר בית ספר" /></SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role Selection */}
          <div className="border-t border-border pt-5">
            <Label className="font-heading text-lg mb-3 block">בחירת תפקיד/ים</Label>
            <div className="space-y-3">
              {STAFF_ROLES.map((role) => {
                const selected = selectedRoles.find((r) => r.value === role.value);
                return (
                  <div key={role.value} className={`p-4 rounded-xl border transition-all ${selected ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={() => toggleRole(role.value)}
                      />
                      <span className="font-heading font-medium">{role.label}</span>
                    </div>

                    {selected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 space-y-3 pr-8"
                      >
                        {role.value === "educator" && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">שכבת חינוך</Label>
                              <Select value={selected.homeroomGrade || ""} onValueChange={(v) => updateRole(role.value, "homeroomGrade", v)}>
                                <SelectTrigger><SelectValue placeholder="שכבה" /></SelectTrigger>
                                <SelectContent>
                                  {GRADES.map((g) => <SelectItem key={g} value={g}>{g}'</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">כיתת חינוך</Label>
                              <Select value={selected.homeroomClass || ""} onValueChange={(v) => updateRole(role.value, "homeroomClass", v)}>
                                <SelectTrigger><SelectValue placeholder="כיתה" /></SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {role.requiresSubject && (
                          <div className="space-y-1">
                            <Label className="text-xs">מקצוע</Label>
                            <Select value={selected.subject || ""} onValueChange={(v) => updateRole(role.value, "subject", v)}>
                              <SelectTrigger><SelectValue placeholder="בחר מקצוע" /></SelectTrigger>
                              <SelectContent>
                                {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {role.requiresGrade && role.value !== "counselor" && (
                          <div className="space-y-1">
                            <Label className="text-xs">שכבה</Label>
                            <Select value={selected.grade || ""} onValueChange={(v) => updateRole(role.value, "grade", v)}>
                              <SelectTrigger><SelectValue placeholder="בחר שכבה" /></SelectTrigger>
                              <SelectContent>
                                {GRADES.map((g) => <SelectItem key={g} value={g}>{g}'</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {role.value === "counselor" && (
                          <div className="space-y-2">
                            <Label className="text-xs">שכבות ייעוץ</Label>
                            {(selected.grades || [""]).map((g, idx) => (
                              <div key={idx} className="flex gap-2">
                                <Select value={g} onValueChange={(v) => updateCounselorGrade(role.value, idx, v)}>
                                  <SelectTrigger className="flex-1"><SelectValue placeholder="בחר שכבה" /></SelectTrigger>
                                  <SelectContent>
                                    {GRADES.map((gr) => <SelectItem key={gr} value={gr}>{gr}'</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => addCounselorGrade(role.value)} className="gap-1">
                              <Plus className="w-3 h-3" /> הוסף שכבה
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teaching classes */}
          {needsTeachingClasses && (
            <div className="border-t border-border pt-5">
              <Label className="font-heading text-lg mb-3 block">כיתות שאתה מלמד/ת</Label>
              {teachingClasses.map((tc, idx) => (
                <div key={idx} className="flex gap-3 mb-3">
                  <Select value={tc.grade} onValueChange={(v) => updateTeachingClass(idx, "grade", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="שכבה" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => <SelectItem key={g} value={g}>{g}'</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={tc.classNumber} onValueChange={(v) => updateTeachingClass(idx, "classNumber", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="כיתה" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {teachingClasses.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTeachingClass(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addTeachingClass} className="gap-1">
                <Plus className="w-3 h-3" /> הוסף כיתה
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 className="text-xl font-heading font-bold mb-4">עיצוב הדמות שלך 🎨</h3>
          <AvatarStudio config={avatar} onChange={setAvatar} variant="adult" />
        </div>
      )}
    </RegistrationLayout>
  );
};

export default StaffRegistration;
