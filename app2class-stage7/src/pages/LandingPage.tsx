import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Users, Briefcase, Building2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const roles = [
  {
    id: "student",
    label: "תלמיד/ה",
    icon: GraduationCap,
    color: "bg-student",
    description: "כניסה לסביבת הלמידה האישית",
    path: "/register/student",
  },
  {
    id: "parent",
    label: "הורה",
    icon: Users,
    color: "bg-parent",
    description: "מעקב ותקשורת עם בית הספר",
    path: "/register/parent",
  },
  {
    id: "staff",
    label: "צוות",
    icon: Briefcase,
    color: "bg-staff",
    description: "מחנך, מורה, רכז, יועץ",
    path: "/register/staff",
  },
  {
    id: "management",
    label: "הנהלה",
    icon: Building2,
    color: "bg-management",
    description: "ניהול וסקירת בית הספר",
    path: "/register/staff",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 200, damping: 20 } },
};

const DEV_ROLES = [
  { id: "student", label: "תלמיד" },
  { id: "parent", label: "הורה" },
  { id: "staff", label: "צוות" },
  { id: "management", label: "הנהלה" },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [devOpen, setDevOpen] = useState(false);
  const [devLoading, setDevLoading] = useState<string | null>(null);

  const handleDevSkip = async (role: string) => {
    setDevLoading(role);
    try {
      const { data, error } = await supabase.functions.invoke("dev-skip-registration", {
        body: { role },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Sign in with the created credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) throw signInError;

      toast({ title: `נכנסת כ${data.fullName} (${role}) 🚀` });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setDevLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-background via-muted to-background">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: -30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6"
      >
        <img src="/logo.png" alt="App2Class" className="w-28 h-28 object-contain drop-shadow-lg" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-2"
      >
        App2Class
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="text-muted-foreground text-lg mb-10"
      >
        מערכת ניהול בית ספרית חכמה
      </motion.p>

      {/* Role Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 w-full max-w-3xl mb-10"
      >
        {roles.map((role) => (
          <motion.button
            key={role.id}
            variants={item}
            whileHover={{ scale: 1.06, y: -4 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(role.path)}
            className="group relative flex flex-col items-center gap-3 p-6 rounded-2xl bg-card border border-border shadow-md hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className={`w-16 h-16 rounded-2xl ${role.color} flex items-center justify-center shadow-lg group-hover:animate-pulse-glow transition-all`}>
              <role.icon className="w-8 h-8 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-lg text-foreground">{role.label}</span>
            <span className="text-xs text-muted-foreground text-center leading-tight">{role.description}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Login link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate("/login")}
          className="gap-2 font-heading text-base"
        >
          <LogIn className="w-5 h-5" />
          כבר רשום? התחבר
        </Button>
      </motion.div>

      {/* Hidden dev skip button - triple click the version text to reveal */}
      <p
        className="mt-16 text-[10px] text-muted-foreground/20 cursor-default select-none"
        onClick={() => setDevOpen((prev) => !prev)}
      >
        v0.1.0-dev
      </p>

      {devOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex gap-2 flex-wrap justify-center"
        >
          {DEV_ROLES.map((r) => (
            <Button
              key={r.id}
              variant="ghost"
              size="sm"
              disabled={devLoading !== null}
              onClick={() => handleDevSkip(r.id)}
              className="text-xs text-muted-foreground/50 hover:text-foreground"
            >
              {devLoading === r.id ? "..." : `דלג → ${r.label}`}
            </Button>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default LandingPage;
