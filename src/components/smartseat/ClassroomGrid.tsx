import React from 'react';
import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';
import { cn } from '@/lib/utils';
import { User, Volume2, UserPlus } from 'lucide-react';
import AvatarPreview from "@/components/avatar/AvatarPreview";
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    config: ClassroomConfig;
    students: Student[];
    mode: AppMode;
    highlightedId: string | null;
    getStudentAt: (r: number, c: number) => Student | undefined;
    onCellClick: (r: number, c: number, student?: Student) => void;
    onDrop: (r: number, c: number, studentId: string) => void;
}

const statusColors: Record<AttendanceStatus, string> = {
    none: 'bg-card border-border/50 text-muted-foreground hover:border-primary/40',
    present: 'bg-success/15 border-success/40 text-success-foreground shadow-[0_0_15px_-3px_rgba(34,197,94,0.2)]',
    absent: 'bg-destructive/15 border-destructive/40 text-destructive-foreground shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]',
    late: 'bg-warning/15 border-warning/40 text-warning-foreground shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]',
    disruption: 'bg-destructive/10 border-destructive/30 text-destructive-foreground',
    positive: 'bg-success/25 border-success/50 text-success-foreground',
};

const statusLabels: Record<AttendanceStatus, string> = {
    none: '',
    present: '✓',
    absent: '✗',
    late: '⏰',
    disruption: '⚠',
    positive: '⭐',
};

export function ClassroomGrid({ config, students, mode, highlightedId, getStudentAt, onCellClick, onDrop }: Props) {
    const [dragOverCell, setDragOverCell] = React.useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent, r: number, c: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCell !== `${r}-${c}`) setDragOverCell(`${r}-${c}`);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (!relatedTarget || !relatedTarget.closest('.grid-cell')) {
            setDragOverCell(null);
        }
    };

    const handleDrop = (e: React.DragEvent, r: number, c: number) => {
        e.preventDefault();
        setDragOverCell(null);
        const id = e.dataTransfer.getData('studentId') || e.dataTransfer.getData('text/plain');
        if (id) onDrop(r, c, id);
    };

    return (
        <div className="flex flex-col items-center gap-10 p-8 bg-muted/5 min-h-full perspectives-1000">
            {/* Teacher desk with shadow and depth */}
            <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-64 h-14 rounded-2xl bg-gradient-to-b from-primary/25 to-primary/15 border-2 border-primary/40 flex items-center justify-center text-sm font-heading font-bold text-primary shadow-xl mb-4 relative"
            >
                <div className="absolute inset-0 bg-white/5 blur-sm rounded-2xl"></div>
                שולחן מורה
            </motion.div>

            {/* Student grid - Realistic perspective */}
            <div
                className="grid gap-6 w-full max-w-6xl p-4"
                style={{ 
                    gridTemplateColumns: `repeat(${config.cols}, minmax(110px, 1fr))`,
                    direction: 'rtl'
                }}
            >
                {Array.from({ length: config.rows }).map((_, r) =>
                    Array.from({ length: config.cols }).map((_, c) => {
                        const student = getStudentAt(r, c);
                        const isHighlighted = student?.id === highlightedId;
                        const isDragOver = dragOverCell === `${r}-${c}`;

                        return (
                            <motion.div
                                key={`${r}-${c}`}
                                layoutId={student?.id}
                                className={cn(
                                    'grid-cell group relative h-32 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center justify-center p-3 overflow-hidden',
                                    student ? statusColors[student.attendance] : 'bg-white/40 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-white/60 shadow-sm',
                                    isHighlighted && 'ring-4 ring-primary ring-offset-4 ring-offset-background z-30',
                                    isDragOver && 'border-primary bg-primary/10 scale-105 shadow-2xl z-20 border-solid',
                                    mode === 'edit' ? (student ? 'cursor-grab active:cursor-grabbing' : 'cursor-default') : (student ? 'cursor-pointer active:scale-95' : 'cursor-default')
                                )}
                                onClick={() => onCellClick(r, c, student)}
                                onDragOver={mode === 'edit' && !student ? (e) => handleDragOver(e, r, c) : undefined}
                                onDragLeave={handleDragLeave}
                                onDrop={mode === 'edit' && !student ? (e) => handleDrop(e, r, c) : undefined}
                                draggable={mode === 'edit' && !!student}
                                onDragStart={student ? (e) => {
                                    e.dataTransfer.setData('studentId', student.id);
                                    e.dataTransfer.setData('text/plain', student.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                } : undefined}
                            >
                                <AnimatePresence mode="wait">
                                    {student ? (
                                        <motion.div 
                                            key={student.id}
                                            initial={{ scale: 0.8, opacity: 0, y: 10 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.8, opacity: 0 }}
                                            className="flex flex-col items-center w-full"
                                        >
                                            <div className="relative shrink-0 mb-2">
                                                <div className="relative z-10">
                                                    {student.avatar ? (
                                                        <AvatarPreview config={student.avatar} size={52} />
                                                    ) : (
                                                        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shadow-inner">
                                                            <User className="h-7 w-7 text-muted-foreground/60" />
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {/* Attendance Badge - Animated floating */}
                                                <AnimatePresence>
                                                    {student.attendance !== 'none' && (
                                                        <motion.span 
                                                            initial={{ scale: 0, rotate: -45 }}
                                                            animate={{ scale: 1, rotate: 0 }}
                                                            className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-background border-2 shadow-md flex items-center justify-center text-[13px] z-20"
                                                        >
                                                            {statusLabels[student.attendance]}
                                                        </motion.span>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                            
                                            <span className="text-[12px] font-heading font-bold text-center leading-tight line-clamp-1 w-full px-1">
                                                {student.name}
                                            </span>
                                            
                                            {isHighlighted && (
                                                <motion.div 
                                                    animate={{ y: [-2, 2, -2] }}
                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                    className="absolute -top-1 left-2"
                                                >
                                                    <Volume2 className="h-4 w-4 text-primary" />
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 opacity-20 group-hover:opacity-40 transition-opacity">
                                            {isDragOver ? (
                                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }}>
                                                    <UserPlus className="h-6 w-6 text-primary" />
                                                </motion.div>
                                            ) : (
                                                <span className="text-[10px] font-mono">{r + 1}x{c + 1}</span>
                                            )}
                                        </div>
                                    )}
                                </AnimatePresence>

                                {/* Drag-Over Background Pulse */}
                                {isDragOver && (
                                    <motion.div 
                                        className="absolute inset-0 bg-primary/5"
                                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                    />
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
