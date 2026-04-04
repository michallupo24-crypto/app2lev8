import { useState, useCallback } from 'react';
import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';

const DEFAULT_CONFIG: ClassroomConfig = { rows: 5, cols: 6, className: 'כיתה א׳1' };

const createId = () => Math.random().toString(36).slice(2, 9);

export function useSmartSeat() {
    const [mode, setMode] = useState<AppMode>('edit');
    const [students, setStudents] = useState<Student[]>([]);
    const [config, setConfig] = useState<ClassroomConfig>(DEFAULT_CONFIG);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const addStudent = useCallback((name: string) => {
        setStudents(prev => [...prev, { id: createId(), name: name.trim(), attendance: 'none' }]);
    }, []);

    const removeStudent = useCallback((id: string) => {
        setStudents(prev => prev.filter(s => s.id !== id));
    }, []);

    const assignSeat = useCallback((studentId: string, row: number, col: number) => {
        setStudents(prev => prev.map(s => {
            if (s.id === studentId) return { ...s, seatRow: row, seatCol: col };
            if (s.seatRow === row && s.seatCol === col) return { ...s, seatRow: undefined, seatCol: undefined };
            return s;
        }));
    }, []);

    const unassignSeat = useCallback((studentId: string) => {
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, seatRow: undefined, seatCol: undefined } : s));
    }, []);

    const setAttendance = useCallback((id: string, status: AttendanceStatus) => {
        setStudents(prev => prev.map(s => s.id === id ? { ...s, attendance: status } : s));
    }, []);

    const cycleAttendance = useCallback((id: string) => {
        setStudents(prev => prev.map(s => {
            if (s.id !== id) return s;
            const cycle: AttendanceStatus[] = ['none', 'present', 'absent', 'late', 'disruption', 'positive'];
            const idx = cycle.indexOf(s.attendance);
            return { ...s, attendance: cycle[(idx + 1) % cycle.length] };
        }));
    }, []);

    const getStudentAt = useCallback((row: number, col: number) => {
        return students.find(s => s.seatRow === row && s.seatCol === col);
    }, [students]);

    const unseatedStudents = students.filter(s => s.seatRow === undefined);

    const speak = useCallback((text: string) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'he-IL';
        u.rate = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const heVoice = voices.find(v => v.lang.startsWith('he'));
        if (heVoice) u.voice = heVoice;
        u.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(u);
    }, []);

    const speakStudent = useCallback((student: Student) => {
        setHighlightedId(student.id);
        speak(student.name);
        setTimeout(() => setHighlightedId(null), 2500);
    }, [speak]);

    const autoScan = useCallback(() => {
        const seated = students.filter(s => s.seatRow !== undefined)
            .sort((a, b) => (a.seatRow! - b.seatRow!) || (a.seatCol! - b.seatCol!));
        if (!seated.length) return;

        let i = 0;
        const next = () => {
            if (i >= seated.length) { setIsSpeaking(false); return; }
            const s = seated[i];
            setHighlightedId(s.id);
            speak(s.name);
            i++;
            setTimeout(next, 2500);
        };
        next();
    }, [students, speak]);

    const stopSpeaking = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
        setHighlightedId(null);
    }, []);

    const importStudents = useCallback((text: string) => {
        const names = text.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean);
        const newStudents: Student[] = names.map(name => ({ id: createId(), name, attendance: 'none' }));
        setStudents(prev => [...prev, ...newStudents]);
    }, []);

    const resetAttendance = useCallback(() => {
        setStudents(prev => prev.map(s => ({ ...s, attendance: 'none' })));
    }, []);

    return {
        mode, setMode, students, config, setConfig,
        highlightedId, setHighlightedId, isSpeaking,
        addStudent, removeStudent, assignSeat, unassignSeat,
        setAttendance, cycleAttendance, getStudentAt, unseatedStudents,
        speakStudent, autoScan, stopSpeaking, importStudents, resetAttendance,
    };
}

