import { useSmartSeat } from '@/hooks/useSmartSeat';
import { TopBar } from '@/components/smartseat/TopBar';
import { ClassroomGrid } from '@/components/smartseat/ClassroomGrid';
import { StudentSidebar } from '@/components/smartseat/StudentSidebar';
import { LessonControls } from '@/components/smartseat/LessonControls';
import { GridSettings } from '@/components/smartseat/GridSettings';
import { useOutletContext } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserProfile } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * SmartSeat Seating Map Page
 * v2.5 - Added Manual Save and Robust Error Handling
 */
const SeatingMapPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchClassId = async () => {
      if (!profile?.id) return;
      
      try {
        // Primary source: teacher_classes association
        const { data: teacherClass } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('user_id', profile.id)
          .limit(1)
          .maybeSingle();
        
        if (teacherClass?.class_id) {
          setClassId(teacherClass.class_id);
        } else {
          // Fallback source: profile class assignment
          const { data: pr } = await supabase.from('profiles').select('class_id').eq('id', profile.id).maybeSingle();
          if (pr?.class_id) setClassId(pr.class_id);
        }
      } catch (err) {
        console.error("Error fetching class ID:", err);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchClassId();
  }, [profile?.id]);

  const ss = useSmartSeat(classId);

  const handleManualSave = async () => {
    if (!classId) {
        toast.error("לא ניתן לשמור: לא זוהתה כיתה מחוברת");
        return;
    }
    
    setIsSaving(true);
    try {
        const seatsToSave = ss.students
            .filter(s => s.seatRow !== undefined && s.seatCol !== undefined)
            .map(s => ({
                class_id: classId,
                student_id: s.id,
                row_index: s.seatRow,
                col_index: s.seatCol,
                updated_at: new Date().toISOString()
            }));

        if (seatsToSave.length === 0) {
            toast.info("אין שינויים לשמירה");
            return;
        }

        const { error } = await supabase
            .from('student_seats')
            .upsert(seatsToSave, { onConflict: 'class_id,student_id' });

        if (error) throw error;
        toast.success("סידור הישיבה נשמר בהצלחה!");
    } catch (err: any) {
        console.error("Save error:", err);
        toast.error(`שגיאת שמירה: ${err.message || "נסה שנית"}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleCellClick = (r: number, c: number, student?: any) => {
    if (ss.mode === 'lesson' && student) {
      ss.cycleAttendance(student.id);
    }
  };

  const presentCount = ss.students.filter(s => s.attendance === 'present').length;
  const absentCount = ss.students.filter(s => s.attendance === 'absent').length;

  if (initialLoading || (classId && ss.loading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground font-heading italic">
        <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }} 
            className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full shadow-lg" 
        />
        <span>טוען כיתה ומפה...</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-background rounded-3xl overflow-hidden border shadow-xl relative"
    >
      <div className="flex items-center justify-between px-6 py-2 bg-muted/30 border-b">
        <TopBar mode={ss.mode} setMode={ss.setMode} className={"flex-1 bg-transparent border-none"} />
        
        {ss.mode === 'edit' && (
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
                <Button 
                    onClick={handleManualSave} 
                    disabled={isSaving}
                    variant={isSaving ? "outline" : "default"}
                    className="gap-2 shadow-lg bg-primary hover:bg-primary-hover transition-all active:scale-95"
                >
                    {isSaving ? (
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    שמור סידור
                </Button>
            </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {ss.mode === 'edit' ? (
          <motion.div 
            key="edit-settings" 
            initial={{ height: 0, opacity: 0, scaleY: 0 }} 
            animate={{ height: 'auto', opacity: 1, scaleY: 1 }} 
            exit={{ height: 0, opacity: 0, scaleY: 0 }}
            className="origin-top"
          >
            <GridSettings config={ss.config} onChange={ss.setConfig} />
          </motion.div>
        ) : (
          <motion.div 
            key="lesson-controls" 
            initial={{ height: 0, opacity: 0, scaleY: 0 }} 
            animate={{ height: 'auto', opacity: 1, scaleY: 1 }} 
            exit={{ height: 0, opacity: 0, scaleY: 0 }}
            className="origin-top"
          >
            <LessonControls
              isSpeaking={ss.isSpeaking}
              onAutoScan={()=>{}}
              onStop={ss.stopSpeaking}
              onResetAttendance={ss.resetAttendance}
              studentCount={ss.students.length}
              presentCount={presentCount}
              absentCount={absentCount}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto bg-muted/5 p-8">
          <ClassroomGrid
            config={ss.config}
            students={ss.students}
            mode={ss.mode}
            highlightedId={ss.highlightedId}
            getStudentAt={ss.getStudentAt}
            onCellClick={handleCellClick}
            onDrop={(r, c, id) => ss.assignSeat(id, r, c)}
          />
        </main>
        
        <StudentSidebar
            students={ss.students}
            unseated={ss.unseatedStudents}
            mode={ss.mode}
            highlightedId={ss.highlightedId}
            onAdd={()=>{}}
            onRemove={()=>{}}
            onHighlight={ss.setHighlightedId}
            onSpeak={()=>{}}
            onCycleAttendance={ss.cycleAttendance}
            onImport={()=>{}}
            onUnassign={ss.unassignSeat}
        />
      </div>
    </motion.div>
  );
};

export default SeatingMapPage;
