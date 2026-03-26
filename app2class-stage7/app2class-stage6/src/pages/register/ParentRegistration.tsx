import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RegistrationLayout from "@/components/registration/RegistrationLayout";
import EmailInput from "@/components/registration/EmailInput";
import AvatarStudio, { defaultAvatarConfig, type AvatarConfig } from "@/components/avatar/AvatarStudio";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ParentRegistration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Parent fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Child linking
  const [childName, setChildName] = useState("");
  const [childId, setChildId] = useState("");
  const [childSchoolId, setChildSchoolId] = useState("");
  const [childVerified, setChildVerified] = useState<boolean | null>(null);

  // Avatar
  const [avatar, setAvatar] = useState<AvatarConfig>({
    ...defaultAvatarConfig,
    outfit: "shirt",
    outfitColor: "#1E293B",
  });

  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("schools").select("id, name").then(({ data }) => {
      if (data) setSchools(data);
    });
  }, []);

  const verifyChild = async () => {
    if (!childSchoolId || (!childId && !childName)) return;

    try {
      let query = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("school_id", childSchoolId);

      if (childId) {
        query = query.eq("id_number", childId);
      } else {
        query = query.ilike("full_name", `%${childName.trim()}%`);
      }

      const { data } = await query.limit(1);

      if (data && data.length > 0) {
        setChildVerified(true);
        toast({ title: `הילד/ה ${data[0].full_name} אומת/ה ✅` });
      } else {
        setChildVerified(false);
        toast({
          title: "הילד/ה לא נמצא/ה",
          description: "ודא שהתלמיד/ה רשום/ה במערכת ושם בית הספר נכון",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setChildVerified(false);
      toast({ title: "שגיאה באימות", description: err.message, variant: "destructive" });
    }
  };

  const step1Valid = firstName && lastName && phone && email && password.length >= 6 && childName && childSchoolId && childVerified === true;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fullName = `${firstName} ${lastName}`;

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
        id_number: null,
        school_id: childSchoolId,
      }).eq("id", userId);

      // Add parent role
      await supabase.from("user_roles").insert({
        user_id: userId,
        role: "parent" as any,
      });

      // Link parent to student
      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id_number", childId)
        .eq("school_id", childSchoolId)
        .single();

      if (studentProfile) {
        await supabase.from("parent_student").insert({
          parent_id: userId,
          student_id: studentProfile.id,
        });
      }

      // Save avatar
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

      // Approval
      await supabase.from("approvals").insert({
        user_id: userId,
        required_role: "educator" as any,
        notes: `הורה חדש/ה: ${fullName}, ילד/ה: ${childName}`,
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
            <p className="text-sm font-heading font-medium text-warning">⏳ ממתין לאישור מחנך/ת</p>
            <p className="text-xs text-muted-foreground mt-1">החשבון שלך ייפתח לאחר אישור המחנך/ת של הילד/ה</p>
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
      title="רישום הורה"
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
          <h3 className="text-xl font-heading font-bold mb-4">פרטים אישיים</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-heading">שם פרטי</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label className="font-heading">שם משפחה</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-heading">טלפון</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" dir="ltr" required />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">דואר אלקטרוני</Label>
            <EmailInput value={email} onChange={setEmail} />
          </div>

          <div className="space-y-2">
            <Label className="font-heading">סיסמה</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="לפחות 6 תווים" dir="ltr" required />
          </div>

          <div className="border-t border-border pt-5 mt-5">
            <h3 className="text-xl font-heading font-bold mb-1">קישור לילד/ה</h3>
            <div className="bg-info/10 border border-info/30 rounded-xl p-3 mb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-info" />
                הילד/ה חייב/ת להיות רשום/ה במערכת לפני רישום הורה. לאחר הרישום, נדרש גם אישור מחנך/ת.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-heading">שם הילד/ה</Label>
                <Input value={childName} onChange={(e) => setChildName(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label className="font-heading">ת"ז הילד/ה</Label>
                <Input value={childId} onChange={(e) => { setChildId(e.target.value.replace(/\D/g, "").slice(0, 9)); setChildVerified(null); }} placeholder="9 ספרות" dir="ltr" required />
              </div>

              <div className="space-y-2">
                <Label className="font-heading">בית ספר הילד/ה</Label>
                <Select value={childSchoolId} onValueChange={(v) => { setChildSchoolId(v); setChildVerified(null); }}>
                  <SelectTrigger><SelectValue placeholder="בחר בית ספר" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(childId || childName) && childSchoolId && childVerified === null && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={verifyChild}
                  className="w-full py-2 bg-info text-info-foreground rounded-lg font-heading text-sm"
                >
                  אמת שיוך לילד/ה
                </motion.button>
              )}

              {childVerified === true && (
                <p className="text-sm text-success font-heading">✅ הילד/ה אומת/ה בהצלחה</p>
              )}
              {childVerified === false && (
                <p className="text-sm text-destructive font-heading">❌ הילד/ה לא נמצא/ה - ודא שהוא רשום במערכת</p>
              )}
            </div>
          </div>
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

export default ParentRegistration;
