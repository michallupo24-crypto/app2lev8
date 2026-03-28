import { useOutletContext, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  BookOpen, 
  ClipboardList, 
  FileText, 
  BarChart3, 
  Bell, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  BrainCircuit,
  Settings,
  MessageSquare
} from "lucide-react";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import SyllabusProgressTracker from "@/components/dashboard/SyllabusProgressTracker";
import ClassMessenger from "@/components/dashboard/ClassMessenger";
import type { UserProfile } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeacherStats {
  totalStudents: number;
  classCount: number;
  pendingSubmissions: number;
  todayLessons: number;
}

const TeacherDashboard = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<TeacherStats>({ totalStudents: 0, classCount: 0, pendingSubmissions: 0, todayLessons: 0 });
  const [myClasses, setMyClasses] = useState<{id: string, name: string}[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  useEffect(() => {
    const load = async () => {
      const [classesRes, submissionsRes] = await Promise.all([
        supabase.from("teacher_classes")
          .select("class_id, classes(grade, class_number)")
          .eq("user_id", profile.id),
        supabase.from("submissions").select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ]);

      const classesData = (classesRes.data || []).map((c: any) => ({
        id: c.class_id,
        name: `${c.classes?.grade}' ${c.classes?.class_number}`
      }));
      setMyClasses(classesData);
      if (classesData.length > 0) setSelectedClassId(classesData[0].id);

      const classIds = classesData.map(c => c.id);
      let studentCount = 0;
      if (classIds.length > 0) {
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true })
          .in("class_id", classIds);
        studentCount = count || 0;
      }

      setStats({
        totalStudents: studentCount,
        classCount: classIds.length,
        pendingSubmissions: submissionsRes.count || 0,
        todayLessons: 0,
      });
    };
    load();
  }, [profile.id]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 p-1">
      {/* ─── WELCOME & FAST ACTIONS ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div variants={item} className="flex items-center gap-5">
           <div className="relative">
              {profile.avatar && <AvatarPreview config={profile.avatar} size={88} />}
              <div className="absolute -bottom-1 -right-1 bg-primary text-white p-1.5 rounded-xl border-4 border-background shadow-lg shadow-primary/20">
                <BrainCircuit className="h-4 w-4" />
              </div>
           </div>
           <div>
              <h1 className="text-3xl font-heading font-black tracking-tighter">שלום, {profile.fullName.split(' ')[0]} 👋</h1>
              <p className="text-sm text-slate-500 font-medium flex items-center gap-2 mt-1">
                <BookOpen className="h-4 w-4 text-primary" /> {profile.schoolName || "תיכון חדש תל אביב"} • מורה פדגוגי
              </p>
           </div>
        </motion.div>

        <div className="flex items-center gap-3">
           <Button variant="outline" className="rounded-xl border-slate-200 bg-white/50 backdrop-blur-sm px-6 h-12 gap-2 hover:bg-primary/5 transition-all text-sm font-bold">
              <ClipboardList className="h-4 w-4 text-primary" /> הקראת שמות מהירה
           </Button>
           <Button onClick={() => navigate("/dashboard/chat")} className="rounded-xl h-12 shadow-lg shadow-primary/20 px-8 font-bold gap-2">
              <MessageSquare className="h-4 w-4" /> צ'אט אישי
           </Button>
        </div>
      </div>

      {/* ─── PENDING APPROVALS ALERT ─── */}
      {profile.pendingApprovalsCount > 0 && (
        <motion.div variants={item}>
          <Card className="border-none shadow-xl bg-gradient-to-r from-orange-500 to-orange-400 text-white cursor-pointer hover:scale-[1.01] transition-all group overflow-hidden relative"
            onClick={() => navigate("/dashboard/approvals")}>
            <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
               <Bell className="h-24 w-24" />
            </div>
            <CardContent className="py-6 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-5">
                 <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <AlertTriangle className="h-7 w-7" />
                 </div>
                 <div>
                    <h3 className="text-xl font-heading font-black">בקשות אישור ממתינות</h3>
                    <p className="text-sm opacity-90 font-medium">ישנם {profile.pendingApprovalsCount} הורים ותלמידים שמחכים לאישור שלך.</p>
                 </div>
              </div>
              <Button variant="secondary" className="bg-white text-orange-600 rounded-xl hover:bg-slate-100 font-bold">טפל עכשיו</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ─── LEFT: PEDAGOGICAL & MESSENGER ─── */}
        <div className="lg:col-span-8 space-y-8">
           <motion.div variants={item}>
              <SyllabusProgressTracker teacherId={profile.id} schoolId={profile.schoolId || ""} />
           </motion.div>

           <motion.div variants={item} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                 <h2 className="font-heading font-black text-xl text-slate-800 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" /> תקשורת כיתתית
                 </h2>
                 {myClasses.length > 1 && (
                    <div className="flex bg-slate-100 p-1 rounded-xl ring-1 ring-slate-200">
                       {myClasses.map(c => (
                          <Button 
                            key={c.id} 
                            size="sm" 
                            variant={selectedClassId === c.id ? "default" : "ghost"} 
                            onClick={() => setSelectedClassId(c.id)}
                            className="rounded-lg h-8 px-3 text-[11px] font-bold"
                          >
                             כיתה {c.name}
                          </Button>
                       ))}
                    </div>
                 )}
              </div>
              {selectedClassId && (
                <ClassMessenger classId={selectedClassId} userId={profile.id} isTeacher={true} />
              )}
           </motion.div>

           {/* Quick Actions */}
           <motion.div variants={item}>
              <h2 className="font-heading font-black text-xl mb-4 text-slate-800">גישה מהירה</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: ClipboardList, label: "הקראת שמות", path: "/dashboard/roll-call", color: "bg-blue-500" },
                  { icon: FileText, label: "סטודיו משימות", path: "/dashboard/task-studio", color: "bg-purple-500" },
                  { icon: BarChart3, label: "ניהול ציונים", path: "/dashboard/teacher-grades", color: "bg-green-500" },
                  { icon: Settings, label: "הכיתות שלי", path: "/dashboard/my-classes", color: "bg-slate-800" },
                ].map((action, i) => (
                  <Card key={i} className="cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1 border-none bg-white p-4 group"
                    onClick={() => navigate(action.path)}>
                    <div className={`${action.color} h-12 w-12 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg transition-transform group-hover:rotate-6`}>
                       <action.icon className="h-6 w-6" />
                    </div>
                    <p className="font-heading font-black text-sm">{action.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">נהל {action.label}</p>
                  </Card>
                ))}
              </div>
           </motion.div>
        </div>

        {/* ─── RIGHT: STATS & SUMMARY ─── */}
        <div className="lg:col-span-4 space-y-6">
           <motion.div variants={item}>
              <Card className="border-none shadow-xl bg-white/60 backdrop-blur-md overflow-hidden ring-1 ring-black/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading font-bold text-slate-600">סיכום פעילות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                   {[
                     { icon: Users, label: "תלמידים תחת אחריותי", value: stats.totalStudents, color: "text-blue-600", bg: "bg-blue-50" },
                     { icon: BookOpen, label: "כיתות לימוד", value: stats.classCount, color: "text-purple-600", bg: "bg-purple-50" },
                     { icon: FileText, label: "הגשות הדורשות בדיקה", value: stats.pendingSubmissions, color: "text-orange-600", bg: "bg-orange-50" },
                     { icon: Clock, label: "שיעורים שבוצעו היום", value: stats.todayLessons, color: "text-green-600", bg: "bg-green-50" },
                   ].map((s, i) => (
                     <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3">
                           <div className={`${s.bg} p-2 rounded-xl`}>
                              <s.icon className={`h-5 w-5 ${s.color}`} />
                           </div>
                           <span className="text-xs font-bold text-slate-500">{s.label}</span>
                        </div>
                        <span className="text-xl font-heading font-black text-slate-800">{s.value}</span>
                     </div>
                   ))}
                </CardContent>
              </Card>
           </motion.div>

           <motion.div variants={item}>
              <Card className="bg-slate-900 border-none shadow-2xl p-6 relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 opacity-10">
                    <BrainCircuit className="h-32 w-32 text-white" />
                 </div>
                 <h4 className="text-white font-heading font-black text-lg mb-2 relative z-10">טיפ AI למורה 🤖</h4>
                 <p className="text-slate-400 text-xs leading-relaxed relative z-10">
                    שלושה תלמידים בכיתה י'2 לא הגישו את המשימה האחרונה. המערכת ממליצה לשלוח להם תזכורת אוטומטית כדי למנוע פערים פדגוגיים לקראת המבחן הקרוב.
                 </p>
                 <Button variant="link" className="text-primary p-0 mt-4 h-auto font-bold text-xs relative z-10">שלח תזכורת עכשיו ←</Button>
              </Card>
           </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default TeacherDashboard;
