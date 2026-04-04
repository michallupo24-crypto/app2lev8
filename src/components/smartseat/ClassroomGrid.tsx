import { Student, ClassroomConfig, AppMode, AttendanceStatus } from '@/types/smartseat';
import { cn } from '@/lib/utils';
import { User, Volume2 } from 'lucide-react';

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
    none: 'desk-cell-occupied',
    present: 'desk-cell-present',
    absent: 'desk-cell-absent',
    late: 'border-solid border-warning bg-warning/10',
    disruption: 'border-solid border-destructive bg-destructive/10',
    positive: 'border-solid border-success bg-success/20',
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
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    const handleDrop = (e: React.DragEvent, r: number, c: number) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('studentId');
        if (id) onDrop(r, c, id);
    };

    return (
        <div className="flex flex-col items-center gap-4 p-4">
            {/* Teacher desk */}
            <div className="w-48 h-10 rounded-lg bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-sm font-medium text-primary mb-2">
                שולחן מורה
            </div>

            {/* Student grid */}
            <div
                className="grid gap-3 w-full max-w-4xl"
                style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(80px, 1fr))` }}
            >
                {Array.from({ length: config.rows }).map((_, r) =>
                    Array.from({ length: config.cols }).map((_, c) => {
                        const student = getStudentAt(r, c);
                        const isHighlighted = student?.id === highlightedId;

                        return (
                            <div
                                key={`${r}-${c}`}
                                className={cn(
                                    'desk-cell relative',
                                    student && statusColors[student.attendance],
                                    isHighlighted && 'desk-cell-highlight',
                                    mode === 'edit' && 'hover:border-primary hover:bg-primary/5',
                                )}
                                onClick={() => onCellClick(r, c, student)}
                                onDragOver={mode === 'edit' ? handleDragOver : undefined}
                                onDrop={mode === 'edit' ? (e) => handleDrop(e, r, c) : undefined}
                            >
                                {student ? (
                                    <div className="flex flex-col items-center gap-1 p-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs font-medium text-card-foreground text-center leading-tight">
                                            {student.name}
                                        </span>
                                        {student.attendance !== 'none' && (
                                            <span className="text-xs">{statusLabels[student.attendance]}</span>
                                        )}
                                        {isHighlighted && <Volume2 className="h-3 w-3 text-accent animate-pulse absolute top-1 left-1" />}
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {mode === 'edit' ? `${r + 1},${c + 1}` : ''}
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
