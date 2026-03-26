import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, ArrowRight, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const LoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check if user is approved
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_approved")
        .eq("id", data.user.id)
        .single();

      if (!profile?.is_approved) {
        await supabase.auth.signOut();
        toast({
          title: "החשבון ממתין לאישור",
          description: "החשבון שלך עדיין לא אושר. אנא המתן לאישור מהגורם המוסמך.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check roles and redirect
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      toast({ title: "התחברת בהצלחה! 🎉" });
      
      // For now redirect to a placeholder dashboard
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "שגיאה בהתחברות",
        description: error.message === "Invalid login credentials" 
          ? "אימייל או סיסמה שגויים" 
          : error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-muted to-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="App2Class" className="w-20 h-20 object-contain mb-4" />
          <h1 className="text-3xl font-heading font-bold">התחברות</h1>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-heading">אימייל / טלפון</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="pr-10"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-heading">סיסמה</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full gap-2 font-heading text-base" disabled={loading}>
                <LogIn className="w-5 h-5" />
                {loading ? "מתחבר..." : "התחבר"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
            חזרה לדף הראשי
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
