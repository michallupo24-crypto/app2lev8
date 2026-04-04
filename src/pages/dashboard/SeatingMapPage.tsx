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

const SeatingMapPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [classId, setClassId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchClassId = async () => {
      if (!profile?.id) return;
      // Get the first class assigned to this teacher
      const { data } = await supabase
        .from('teacher_classes')
        .select('class_id')
        .eq('user_id', profile.id)
        .limit(1)
        .maybeSingle();
      
      if (data?.class_id) {
        setClassId(data.class_id);
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

  return (
    <div className="flex flex-col h-full bg-background rounded-3xl overflow-hidden border">
      <TopBar mode={ss.mode} setMode={ss.setMode} className={ss.config.className} />

      {ss.mode === 'edit' && (
        <GridSettings config={ss.config} onChange={ss.setConfig} />
      )}

      {ss.mode === 'lesson' && (
        <LessonControls
          isSpeaking={ss.isSpeaking}
          onAutoScan={()=>{}}
          onStop={ss.stopSpeaking}
          onResetAttendance={ss.resetAttendance}
          studentCount={ss.students.length}
          presentCount={presentCount}
          absentCount={absentCount}
        />
      )}

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
    </div>
  );
};

export default SeatingMapPage;
