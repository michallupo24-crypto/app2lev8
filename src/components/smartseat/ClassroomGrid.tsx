import React from 'react';
import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';
import { cn } from '@/lib/utils';
import { User, Volume2 } from 'lucide-react';
import AvatarPreview from "@/components/avatar/AvatarPreview";

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
    none: 'bg-card border-border/50 text-muted-foreground',
    present: 'bg-success/20 border-success/40 text-success-foreground ring-2 ring-success/20',
    absent: 'bg-destructive/20 border-destructive/40 text-destructive-foreground ring-2 ring-destructive/20',
    late: 'bg-warning/20 border-warning/40 text-warning-foreground ring-2 ring-warning/20',
    disruption: 'bg-destructive/10 border-destructive/30 text-destructive-foreground ring-2 ring-destructive/10',
    positive: 'bg-success/30 border-success/50 text-success-foreground ring-2 ring-success/30',
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
        setDragOverCell(`${r}-${c}`);
    };

    const handleDragLeave = () => {
        setDragOverCell(null);
    };

    const handleDrop = (e: React.DragEvent, r: number, c: number) => {
        e.preventDefault();
        setDragOverCell(null);
        
        // Try multiple ways to get the ID for cross-browser compatibility
        const id = e.dataTransfer.getData('studentId') || e.dataTransfer.getData('text/plain');
        if (id) {
            onDrop(r, c, id);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 p-4 bg-muted/5 min-h-full" onDragLeave={handleDragLeave}>
            {/* Teacher desk */}
            <div className="w-56 h-12 rounded-xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-sm font-bold text-primary shadow-sm mb-6">
                שולחן מורה
            </div>

            {/* Student grid */}
            <div
                className="grid gap-4 w-full max-w-5xl"
                style={{ 
                    gridTemplateColumns: `repeat(${config.cols}, minmax(100px, 1fr))`,
                    direction: 'rtl'
                }}
            >
                {Array.from({ length: config.rows }).map((_, r) =>
                    Array.from({ length: config.cols }).map((_, c) => {
                        const student = getStudentAt(r, c);
                        const isHighlighted = student?.id === highlightedId;
                        const isDragOver = dragOverCell === `${r}-${c}`;

                        return (
                            <div
                                key={`${r}-${c}`}
                                className={cn(
                                    'group relative h-28 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center p-2',
                                    student ? statusColors[student.attendance] : 'bg-muted/10 border-dashed border-muted-foreground/20 hover:border-primary/30 hover:bg-primary/5',
                                    isHighlighted && 'ring-4 ring-accent ring-offset-2 animate-pulse',
                                    isDragOver && 'border-primary bg-primary/20 scale-105 z-20',
                                    mode === 'edit' && student && 'cursor-grab active:cursor-grabbing',
                                    mode === 'lesson' && student && 'cursor-pointer active:scale-95'
                                )}
                                onClick={() => onCellClick(r, c, student)}
                                onDragOver={mode === 'edit' ? (e) => handleDragOver(e, r, c) : undefined}
                                onDragLeave={handleDragLeave}
                                onDrop={mode === 'edit' ? (e) => handleDrop(e, r, c) : undefined}
                                draggable={mode === 'edit' && !!student}
                                onDragStart={student ? (e) => {
                                    e.dataTransfer.setData('studentId', student.id);
                                    e.dataTransfer.setData('text/plain', student.id);
                                } : undefined}
                            >
                                {student ? (
                                    <>
                                        <div className="relative shrink-0 mb-1">
                                            {student.avatar ? (
                                                <AvatarPreview config={student.avatar} size={48} />
                                            ) : (
                                                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shadow-inner">
                                                    <User className="h-6 w-6 text-muted-foreground/60" />
                                                </div>
                                            )}
                                            {student.attendance !== 'none' && (
                                                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-background border shadow-sm flex items-center justify-center text-xs">
                                                    {statusLabels[student.attendance]}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-bold text-center leading-tight line-clamp-2 px-1">
                                            {student.name}
                                        </span>
                                        {isHighlighted && <Volume2 className="h-4 w-4 text-accent animate-bounce absolute -top-2 left-1/2 -translate-x-1/2" />}
                                    </>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground/40 font-mono">
                                        {mode === 'edit' && !isDragOver ? `${r + 1},${c + 1}` : ''}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
