import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';

export function useSmartSeat(classId?: string) {
    const [mode, setMode] = useState<AppMode>('edit');
    const [students, setStudents] = useState<Student[]>([]);
    const [config, setConfig] = useState<ClassroomConfig>({ rows: 6, cols: 6, className: "" });
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        if (!classId) return;
        setLoading(true);

        try {
            // 1. Fetch class config
            const { data: cfg } = await supabase
                .from('class_configs')
                .select('*')
                .eq('class_id', classId)
                .maybeSingle();
            
            if (cfg) {
                setConfig({ rows: cfg.rows, cols: cfg.cols, className: "" });
            }

            // 2. Fetch students (profiles with avatars)
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar')
                .eq('class_id', classId)
                .eq('is_approved', true);

            // 3. Fetch seats
            const { data: seats } = await supabase
                .from('student_seats')
                .select('*')
                .eq('class_id', classId);

            const seatMap = new Map((seats || []).map(s => [s.student_id, s]));

            setStudents((profiles || []).map(p => ({
                id: p.id,
                name: p.full_name,
                avatar: p.avatar,
                attendance: 'none' as AttendanceStatus,
                seatRow: seatMap.get(p.id)?.row_index,
                seatCol: seatMap.get(p.id)?.col_index,
            })));
        } catch (error) {
            console.error("Error loading smart seat data:", error);
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const assignSeat = async (studentId: string, row: number, col: number) => {
        if (!classId) return;
        
        try {
            const { error } = await supabase
                .from('student_seats')
                .upsert({
                    class_id: classId,
                    student_id: studentId,
                    row_index: row,
                    col_index: col,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'class_id, student_id' });

            if (error) throw error;
            
            setStudents(prev => prev.map(s => {
                if (s.id === studentId) return { ...s, seatRow: row, seatCol: col };
                if (s.seatRow === row && s.seatCol === col) return { ...s, seatRow: undefined, seatCol: undefined };
                return s;
            }));
        } catch (error) {
            console.error("Error assigning seat:", error);
        }
    };

    const unassignSeat = async (studentId: string) => {
        if (!classId) return;
        
        try {
            await supabase
                .from('student_seats')
                .delete()
                .eq('class_id', classId)
                .eq('student_id', studentId);
                
            setStudents(prev => prev.map(s => s.id === studentId ? { ...s, seatRow: undefined, seatCol: undefined } : s));
        } catch (error) {
            console.error("Error unassigning seat:", error);
        }
    };

    const getStudentAt = useCallback((row: number, col: number) => {
        return students.find(s => s.seatRow === row && s.seatCol === col);
    }, [students]);

    const stopSpeaking = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
        setHighlightedId(null);
    }, []);

    const resetAttendance = useCallback(() => {
        setStudents(prev => prev.map(s => ({ ...s, attendance: 'none' as AttendanceStatus })));
    }, []);

    const cycleAttendance = useCallback((id: string) => {
        setStudents(prev => prev.map(s => {
            if (s.id !== id) return s;
            const cycle: AttendanceStatus[] = ['none', 'present', 'absent', 'late', 'disruption', 'positive'];
            const idx = cycle.indexOf(s.attendance);
            return { ...s, attendance: cycle[(idx + 1) % cycle.length] };
        }));
    }, []);

    return {
        mode, setMode, students, config, setConfig,
        loading, highlightedId, getStudentAt,
        assignSeat, unassignSeat, cycleAttendance,
        unseatedStudents: students.filter(s => s.seatRow === undefined),
        resetAttendance, stopSpeaking, refresh: loadData
    };
}
