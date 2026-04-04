import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw } from 'lucide-react';

interface Props {
    isSpeaking: boolean;
    onAutoScan: () => void;
    onStop: () => void;
    onResetAttendance: () => void;
    studentCount: number;
    presentCount: number;
    absentCount: number;
}

export function LessonControls({ isSpeaking, onAutoScan, onStop, onResetAttendance, studentCount, presentCount, absentCount }: Props) {
    return (
        <div className="flex items-center gap-4 px-6 py-3 bg-card border-b">
            <div className="flex gap-2">
                {!isSpeaking ? (
                    <Button size="sm" onClick={onAutoScan} className="gap-2">
                        <Play className="h-4 w-4" />
                        הקראה רציפה
                    </Button>
                ) : (
                    <Button size="sm" variant="destructive" onClick={onStop} className="gap-2">
                        <Square className="h-4 w-4" />
                        עצור
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={onResetAttendance} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    איפוס נוכחות
                </Button>
            </div>

            <div className="flex gap-4 mr-auto text-sm">
                <span className="text-muted-foreground">סה״כ: <strong className="text-foreground">{studentCount}</strong></span>
                <span className="text-success">נוכחים: <strong>{presentCount}</strong></span>
                <span className="text-destructive">חסרים: <strong>{absentCount}</strong></span>
            </div>
        </div>
    );
}
