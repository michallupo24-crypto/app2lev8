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

const SeatingMapPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const fetchClassId = async () => {
      if (!profile?.id) return;
      
      try {
        const { data: teacherClass } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('user_id', profile.id)
          .limit(1)
          .maybeSingle();
        
        if (teacherClass?.class_id) {
          setClassId(teacherClass.class_id);
        } else {
          // Fallback to profile's class_id
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

  const handleCellClick = (r: number, c: number, student?: any) => {
    if (ss.mode === 'lesson' && student) {
      ss.cycleAttendance(student.id);
    }
  };

  const presentCount = ss.students.filter(s => s.attendance === 'present').length;
  const absentCount = ss.students.filter(s => s.attendance === 'absent').length;

  if (initialLoading || (classId && ss.loading)) {
    return (
      <div className="flex items-center justify-center h-full gap-3 font-heading">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        טוען כיתה...
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-background rounded-3xl overflow-hidden border shadow-inner"
    >
      <TopBar mode={ss.mode} setMode={ss.setMode} className={ss.config.className} />

      <AnimatePresence mode="wait">
        {ss.mode === 'edit' ? (
          <motion.div key="edit-settings" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <GridSettings config={ss.config} onChange={ss.setConfig} />
          </motion.div>
        ) : (
          <motion.div key="lesson-controls" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
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
        <main className="flex-1 overflow-auto bg-muted/10 p-6">
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
