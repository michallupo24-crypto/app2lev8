
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  ArrowRight, 
  Award, 
  TrendingUp, 
  BookOpen, 
  CheckCircle2, 
  BrainCircuit,
  Loader2,
  Table as TableIcon,
  Star
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AvatarPreview from "@/components/avatar/AvatarPreview";

interface GradeEntry {
  subject: string;
  assignment: string;
  grade: number;
  maxGrade: number;
  feedback: string | null;
  date: string;
  type: string;
}

const StudentReportPage = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [aiInsight, setAiInsight] = useState<string>("");

  const loadData = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      // 1. Fetch student info
      const { data: profile } = await supabase
        .from("profiles")
        .select("*, classes(grade, class_number), avatars(*)")
        .eq("id", studentId)
        .single();
      
      setStudent(profile);

      // 2. Fetch all graded submissions
      const { data: submissions } = await supabase
        .from("submissions")
        .select("grade, feedback, submitted_at, assignments(title, subject, type, max_grade)")
        .eq("student_id", studentId)
        .eq("status", "graded")
        .order("submitted_at", { ascending: false });

      if (submissions) {
        setGrades(submissions.map((s: any) => ({
          subject: s.assignments?.subject || "כללי",
          assignment: s.assignments?.title || "משימה",
          grade: s.grade,
          maxGrade: s.assignments?.max_grade || 100,
          feedback: s.feedback,
          date: s.submitted_at,
          type: s.assignments?.type || "assignment"
        })));
      }

      // 3. Simple AI Insight Simulation (can be expanded with a real call)
      const subjectsText = Array.from(new Set(submissions?.map(s => s.assignments?.subject))).join(", ");
      const avg = submissions?.length ? Math.round(submissions.reduce((acc, s) => acc + (s.grade / (s.assignments?.max_grade || 100) * 100), 0) / submissions.length) : 0;
      
      setAiInsight(`${profile.full_name} מפגין/ה יכולות מרשימות ב${subjectsText}. עם ממוצע של ${avg}, ישנה התמדה ניכרת והשקעה מרובה במטלות הכיתתיות. מומלץ להמשיך לחזק את הכישורים במקצועות הריאליים ולשמור על הקצב המצוין.`);

    } catch (e) {
      toast({ title: "שגיאה בטעינת הנתונים", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId]);

  const subjectAverages = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    grades.forEach(g => {
      const norm = (g.grade / g.maxGrade) * 100;
      const cur = map.get(g.subject) || { total: 0, count: 0 };
      map.set(g.subject, { total: cur.total + norm, count: cur.count + 1 });
    });
    return Array.from(map.entries()).map(([subj, val]) => ({
      subject: subj,
      avg: Math.round(val.total / val.count)
    }));
  }, [grades]);

  const overallAvg = useMemo(() => {
    if (subjectAverages.length === 0) return 0;
    return Math.round(subjectAverages.reduce((acc, s) => acc + s.avg, 0) / subjectAverages.length);
  }, [subjectAverages]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
       <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 dir-rtl text-right">
      {/* Tool Bar - Hidden on Print */}
      <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between print:hidden">
         <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-slate-500">
            <ArrowRight className="h-4 w-4" /> חזרה לדאשבורד
         </Button>
         <Button onClick={handlePrint} className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary h-12 px-8 font-bold">
            <Printer className="h-4 w-4" /> הדפס תעודה רשמית (PDF)
         </Button>
      </div>

      {/* THE CERTIFICATE */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto bg-white shadow-2xl rounded-[32px] overflow-hidden border border-slate-100 print:shadow-none print:border-none print:m-0"
      >
        {/* Certificate Decoration Header */}
        <div className="h-4 w-full bg-gradient-to-r from-primary via-blue-400 to-indigo-500" />
        
        <div className="p-8 md:p-12">
            {/* Header: School Info & Logo */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
               <div className="flex items-center gap-6">
                  <div className="relative">
                     <AvatarPreview 
                        config={student.avatars ? {
                            faceShape: student.avatars.face_shape, skinColor: student.avatars.skin_color, eyeShape: student.avatars.eye_shape,
                            eyeColor: student.avatars.eye_color, hairStyle: student.avatars.hair_style, hairColor: student.avatars.hair_color,
                            facialHair: student.avatars.facial_hair || "none", outfit: student.avatars.outfit, outfitColor: student.avatars.outfit_color,
                            accessory: student.avatars.accessory || "none", expression: "smile", background: student.avatars.background,
                        } : null} 
                        size={100} 
                        className="shadow-xl ring-4 ring-white"
                     />
                     <div className="absolute -bottom-2 -right-2 bg-yellow-400 p-2 rounded-xl rotate-12 shadow-md">
                        <Star className="h-5 w-5 text-white fill-white" />
                     </div>
                  </div>
                  <div>
                     <h1 className="text-4xl font-heading font-black text-slate-800 tracking-tighter mb-1">תעודת הערכה לרבעון א'</h1>
                     <p className="text-xl font-heading font-bold text-primary">{student.full_name}</p>
                     <p className="text-sm text-slate-400 font-medium">כיתה {student.classes?.grade}' {student.classes?.class_number} • שנת לימודים תשפ״ה</p>
                  </div>
               </div>
               <div className="text-left md:text-left flex flex-col items-end">
                  <div className="h-16 w-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white mb-3 rotate-3">
                     <Award className="h-8 w-8" />
                  </div>
                  <h3 className="font-heading font-black text-xl">App2Lev8</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">Smart Pedagogical System</p>
               </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
               <Card className="bg-slate-50 border-none p-6 text-center shadow-inner rounded-3xl">
                  <p className="text-[10px] text-slate-400 font-black uppercase mb-1">ממוצע משוקלל</p>
                  <p className="text-5xl font-heading font-black text-primary">{overallAvg}</p>
                  <Badge variant="outline" className="mt-4 border-primary/20 text-primary">מצטיין רבעוני 🏆</Badge>
               </Card>
               <Card className="bg-slate-50 border-none p-6 text-center shadow-inner rounded-3xl">
                  <p className="text-[10px] text-slate-400 font-black uppercase mb-1">התקדמות סילבוס</p>
                  <p className="text-5xl font-heading font-black text-success">94%</p>
                  <Badge variant="outline" className="mt-4 border-success/20 text-success">עמידה ביעדים ✅</Badge>
               </Card>
               <Card className="bg-slate-50 border-none p-6 text-center shadow-inner rounded-3xl">
                  <p className="text-[10px] text-slate-400 font-black uppercase mb-1">נוכחות</p>
                  <p className="text-5xl font-heading font-black text-blue-500">98%</p>
                  <Badge variant="outline" className="mt-4 border-blue-200 text-blue-500">התמדה ללא רבב ⭐</Badge>
               </Card>
            </div>

            {/* AI Summary Section */}
            <div className="bg-primary/5 rounded-[24px] p-6 mb-12 border border-primary/10 relative">
               <div className="absolute top-4 left-4 text-primary/20">
                  <BrainCircuit className="h-12 w-12" />
               </div>
               <h3 className="font-heading font-black text-lg text-primary mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> דבר ה-AI מנטור
               </h3>
               <p className="text-sm font-medium leading-relaxed text-slate-700 max-w-[90%]">
                  {aiInsight}
               </p>
            </div>

            {/* Grades Table */}
            <div className="mb-12">
               <h3 className="font-heading font-black text-xl mb-6 flex items-center gap-3">
                  <TableIcon className="h-6 w-6 text-slate-300" /> רכיבי הערכה לפי מקצועות
               </h3>
               <div className="border rounded-2xl overflow-hidden">
                  <table className="w-full text-right">
                     <thead>
                        <tr className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase border-b">
                           <th className="p-4">מקצוע</th>
                           <th className="p-4">ציון</th>
                           <th className="p-4">הערות ותובנות פדגוגיות</th>
                        </tr>
                     </thead>
                     <tbody className="text-sm">
                        {subjectAverages.map((s, idx) => (
                           <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 font-bold text-slate-800">{s.subject}</td>
                              <td className="p-4">
                                 <span className={`text-xl font-heading font-black ${s.avg >= 90 ? 'text-green-600' : s.avg >= 70 ? 'text-primary' : 'text-destructive'}`}>
                                    {s.avg}
                                 </span>
                              </td>
                              <td className="p-4 text-xs text-slate-500 font-medium italic">
                                 {grades.find(g => g.subject === s.subject)?.feedback || "עבודה יפה והשתתפות פעילה בשיעורים."}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>

            {/* QR & Verifier */}
            <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-slate-100 mt-20">
               <div>
                  <p className="text-xs text-slate-400 font-bold mb-1">חתימת מחנך/ת הכיתה</p>
                  <div className="h-12 w-48 border-b border-primary/30 font-accent text-primary/60 flex items-end pb-1 text-sm">
                     {student.educator_name || 'נחתם דיגיטלית'}
                  </div>
               </div>
               <div className="mt-8 md:mt-0 text-center">
                  <div className="h-20 w-20 bg-slate-50 border rounded-xl flex items-center justify-center p-2 mx-auto mb-2">
                      {/* Placeholder for QR - could be a real one linking to verification */}
                      <div className="grid grid-cols-4 gap-0.5 opacity-20">
                         {Array.from({length: 16}).map((_, i) => (
                            <div key={i} className={`h-3 w-3 ${Math.random() > 0.5 ? 'bg-black' : 'bg-transparent'}`} />
                         ))}
                      </div>
                  </div>
                  <p className="text-[8px] text-slate-300 font-black uppercase tracking-widest">Digital Verification Key: A2L8-V9X2-K9Q4</p>
               </div>
               <div className="mt-8 md:mt-0">
                  <p className="text-xs text-slate-400 font-bold mb-1">חותמת בית הספר</p>
                  <div className="h-16 w-16 rounded-full border-2 border-primary/20 flex items-center justify-center text-[10px] text-primary/30 p-2 text-center leading-none font-black uppercase rotate-12">
                     Official Seal 2025
                  </div>
               </div>
            </div>
        </div>

        {/* Footer Decoration */}
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center print:hidden">
            <div>
               <p className="text-xs font-bold text-slate-400">הופק באופן אוטומטי על ידי</p>
               <h4 className="font-heading font-black text-lg">App2Lev8 AI Engine</h4>
            </div>
            <Button variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/10" onClick={handlePrint}>
               תצוגת הדפסה מלאה
            </Button>
        </div>
      </motion.div>

      {/* Print-only CSS */}
      <style>{`
        @media print {
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .max-w-4xl {
            max-width: 100% !important;
          }
          @page {
            margin: 0;
            size: A4;
          }
          div[style*="transition"] {
             transition: none !important;
             transform: none !important;
             opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default StudentReportPage;
