import { useSmartSeat } from '@/hooks/useSmartSeat';
import { ClassroomGrid } from '@/components/smartseat/ClassroomGrid';
import { useOutletContext } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserProfile } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import { MapPin, Users, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const StudentSeatingPage = () => {
    const { profile } = useOutletContext<{ profile: UserProfile }>();
    const [classId, setClassId] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClassId = async () => {
            if (!profile?.id) return;
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('class_id')
                    .eq('id', profile.id)
                    .single();
                if (data?.class_id) setClassId(data.class_id);
            } catch (err) {
                console.error("Error fetching class:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchClassId();
    }, [profile?.id]);

    const ss = useSmartSeat(classId);

    if (loading || (classId && ss.loading)) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground font-heading italic">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full shadow-lg" />
                <span>טוען את מפת הכיתה...</span>
            </div>
        );
    }

    if (!classId) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <Info className="h-12 w-12 text-muted-foreground opacity-20" />
                <h2 className="text-xl font-heading font-bold">לא זוהתה כיתה מחוברת</h2>
                <p className="text-muted-foreground">עליך להיות משויך לכיתה כדי לראות את סידור הישיבה.</p>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
                        <MapPin className="h-8 w-8 text-primary" />
                        סידור הישיבה שלי
                    </h1>
                    <p className="text-muted-foreground font-body mt-1">כאן תוכל לראות איפה המקום שלך בכיתה ומי יושב מסביבך</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-2xl text-primary font-bold">
                    <Users className="h-5 w-5" />
                    <span>{ss.students.length} תלמידים בכיתה</span>
                </div>
            </div>

            <Card className="border-none shadow-2xl bg-white/60 backdrop-blur-md overflow-hidden ring-1 ring-black/[0.03]">
                <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-heading font-black uppercase tracking-widest text-muted-foreground">תצוגת כיתה חכמה</CardTitle>
                    <div className="flex items-center gap-4 text-[10px] font-bold">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-primary/20 border border-primary"></div> המקום שלי</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-white border border-dashed"></div> פנוי</div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-auto">
                    <div className="min-w-[800px] py-10">
                        <ClassroomGrid
                            config={ss.config}
                            students={ss.students}
                            mode="lesson" // readonly for students
                            highlightedId={profile.id} // Highlight the current student!
                            getStudentAt={ss.getStudentAt}
                            onCellClick={() => {}}
                            onDrop={() => {}}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-primary/5 border-primary/10">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-2xl"><Users className="h-6 w-6 text-primary" /></div>
                        <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase">החברים שלך</p>
                            <p className="text-sm font-body">שים לב למי שיושב לידך, שיתוף פעולה עוזר ללמידה!</p>
                        </div>
                    </CardContent>
                </Card>
                {/* Additional tips or info can go here */}
            </div>
        </motion.div>
    );
};

export default StudentSeatingPage;
