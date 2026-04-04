import { useSmartSeat } from '@/hooks/useSmartSeat';
import { TopBar } from '@/components/smartseat/TopBar';
import { ClassroomGrid } from '@/components/smartseat/ClassroomGrid';
import { StudentSidebar } from '@/components/smartseat/StudentSidebar';
import { LessonControls } from '@/components/smartseat/LessonControls';
import { GridSettings } from '@/components/smartseat/GridSettings';

const SeatingMapPage = () => {
  const ss = useSmartSeat();

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
          onAutoScan={ss.autoScan}
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
          onAdd={ss.addStudent}
          onRemove={ss.removeStudent}
          onHighlight={ss.setHighlightedId}
          onSpeak={ss.speakStudent}
          onCycleAttendance={ss.cycleAttendance}
          onImport={ss.importStudents}
          onUnassign={ss.unassignSeat}
        />
      </div>
    </div>
  );
};

export default SeatingMapPage;
