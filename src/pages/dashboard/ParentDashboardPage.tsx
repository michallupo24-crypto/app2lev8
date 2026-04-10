import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, ChevronLeft, Heart, MessageSquare, Calendar, User, Shield } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const ParentDashboardPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      setLoading(true);
      try {
        const { data: links } = await supabase.from("parent_student").select("student_id").eq("parent_id", profile.id);
        if (links && links.length > 0) {
          const ids = links.map(l => l.student_id);
          const { data: kids } = await supabase.from("profiles").select("*, classes(grade, class_number), schools(name)").in("id", ids);
          if (kids) {
            setChildren(kids);
            setSelectedChild(kids[0]);
          }
        }
      } catch (e) {
        console.error("Error fetching children", e);
      }
      setLoading(false);
    };
    fetchChildren();
  }, [profile.id]);

  if (loading) return <div className="h-screen flex items-center justify-center text-indigo-600 font-bold">טוען נתונים...</div>;

  return (
    <div className="min-h-screen bg-white p-6 md:p-10 text-right" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex justify-between items-center">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <LayoutDashboard className="text-indigo-600" />
            Guardian Cockpit
          </h1>
          <div className="flex gap-2">
            {children.map(c => (
              <Button 
                key={c.id} 
                variant={selectedChild?.id === c.id ? "default" : "outline"}
                onClick={() => setSelectedChild(c)}
              >
                {c.full_name}
              </Button>
            ))}
          </div>
        </header>

        {selectedChild && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-2 p-8 bg-indigo-600 text-white rounded-3xl shadow-xl">
              <h2 className="text-4xl font-black mb-4">{selectedChild.full_name}</h2>
              <p className="opacity-80">
                כיתה {selectedChild.classes?.grade}'{selectedChild.classes?.class_number} • {selectedChild.schools?.name}
              </p>
              <div className="mt-8 flex gap-10">
                <div>
                  <p className="text-5xl font-bold">100%</p>
                  <p className="text-xs opacity-60 uppercase tracking-widest">נוכחות</p>
                </div>
                <Button 
                  onClick={() => navigate(`/dashboard/grades/${selectedChild.id}`)}
                  className="bg-white text-indigo-600 hover:bg-indigo-50 font-bold mr-auto"
                >
                  <FileText className="ml-2 h-4 w-4" /> דוח ציונים מפורט
                </Button>
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6 border-none shadow-sm bg-slate-50 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600"><MessageSquare /></div>
                <div>
                  <p className="text-xs text-slate-500 font-bold">קשר ישיר</p>
                  <p className="font-bold">צוות הוראה</p>
                </div>
              </Card>
              <Card className="p-6 border-none shadow-sm bg-slate-50 flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600"><Calendar /></div>
                <div>
                  <p className="text-xs text-slate-500 font-bold">לו"ז שבועי</p>
                  <p className="font-bold">משימות ואירועים</p>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentDashboardPage;
