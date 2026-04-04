import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';

/**
 * useSmartSeat Hook - Real-time Classroom Seating and Attendance
 * v3.0 - Integrated with attendance and lesson_notes tables
 */
export function useSmartSeat(classId?: string, lessonId?: string) {
    const [students, setStudents] = useState<Student[]>([]);
    const [config, setConfig] = useState<ClassroomConfig>({
        rows: 6,
        cols: 6,
        className: 'layout-grid'
    });
    const [mode, setMode] = useState<AppMode>('edit');
    const [loading, setLoading] = useState(true);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!classId) {
            setLoading(false);
            return;
        }
        
        try {
            // 1. Fetch Students
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('class_id', classId);

            if (!profiles) return;

            // 2. Fetch Avatars
            const { data: avatars } = await supabase
                .from('avatars')
                .select('*')
                .in('user_id', profiles.map(p => p.id));

            const avatarMap = new Map((avatars || []).map(a => [a.user_id, {
                body_type: 'basic', // Default since UI expects AvatarConfig
                eye_color: a.eye_color,
                skin: a.skin_color,
                hair_style: a.hair_style,
                hair_color: a.hair_color
            }]));

            // 3. Fetch Seats
            const { data: seats } = await supabase
                .from('student_seats')
                .select('*')
                .eq('class_id', classId);

            const seatMap = new Map((seats as any[] || []).map(s => [s.student_id, s]));

            // 4. Fetch Current Attendance for this lesson (if in lesson mode)
            let attendanceMap = new Map();
            if (lessonId) {
                const { data: attendance } = await supabase
                    .from('attendance')
                    .select('student_id, status')
                    .eq('lesson_id', lessonId);
                
                attendanceMap = new Map((attendance || []).map(a => [a.student_id, a.status]));
            }

            setStudents(profiles.map(p => ({
                id: p.id,
                name: p.full_name,
                avatar: avatarMap.get(p.id) || null,
                attendance: (attendanceMap.get(p.id) || 'none') as AttendanceStatus,
                seatRow: seatMap.get(p.id)?.row_index,
                seatCol: seatMap.get(p.id)?.col_index,
            })));

        } catch (err) {
            console.error('Error loading smartseat data:', err);
        } finally {
            setLoading(false);
        }
    }, [classId, lessonId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const assignSeat = async (studentId: string, row: number, col: number) => {
        if (!classId) return;
        
        // Optimistic UI
        setStudents(prev => prev.map(s => {
            if (s.id === studentId) return { ...s, seatRow: row, seatCol: col };
            if (s.seatRow === row && s.seatCol === col) return { ...s, seatRow: undefined, seatCol: undefined };
            return s;
        }));

        try {
            await supabase
                .from('student_seats')
                .upsert({
                    class_id: classId,
                    student_id: studentId,
                    row_index: row,
                    col_index: col
                }, { onConflict: 'class_id,student_id' });
        } catch (error) {
            console.error('Failed to assign seat:', error);
        }
    };

    const cycleAttendance = async (studentId: string) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        const statusMap: Record<AttendanceStatus, AttendanceStatus> = {
            'none': 'present',
            'present': 'absent',
            'absent': 'late',
            'late': 'none',
            'disruption': 'none',
            'positive': 'none'
        };
        
        const nextStatus = statusMap[student.attendance] || 'present';

        // Update UI
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, attendance: nextStatus } : s));

        // Save to DB if in a lesson context
        if (lessonId) {
            try {
                await supabase
                    .from('attendance')
                    .upsert({
                        student_id: studentId,
                        lesson_id: lessonId,
                        status: nextStatus,
                        noted_at: new Date().toISOString()
                    }, { onConflict: 'student_id,lesson_id' });
            } catch (err) {
                console.error("Error saving attendance from map:", err);
            }
        }
    };

    const resetAttendance = async () => {
        if (!lessonId) return;
        setStudents(prev => prev.map(s => ({ ...s, attendance: 'none' })));
        await supabase.from('attendance').delete().eq('lesson_id', lessonId);
    };

    const [isSpeaking, setIsSpeaking] = useState(false);

    const speakStudent = (student: Student) => {
        if (!student.name) return;
        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(student.name);
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    };

    return {
        students,
        unseatedStudents: students.filter(s => s.seatRow === undefined),
        config,
        setConfig,
        mode,
        setMode,
        loading,
        highlightedId,
        setHighlightedId,
        isSpeaking,
        stopSpeaking: () => window.speechSynthesis.cancel(),
        speakStudent,
        assignSeat,
        unassignSeat: (id: string) => assignSeat(id, -1, -1),
        cycleAttendance,
        resetAttendance,
        getStudentAt: (r: number, c: number) => students.find(s => s.seatRow === r && s.seatCol === c),
    };
}
