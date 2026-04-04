import { AppMode } from '@/types/smartseat';
import { Button } from '@/components/ui/button';
import { Edit3, BookOpen, GraduationCap } from 'lucide-react';

interface TopBarProps {
    mode: AppMode;
    setMode: (m: AppMode) => void;
    className: string;
}

export function TopBar({ mode, setMode, className }: TopBarProps) {
    return (
        <header className="flex items-center justify-between px-6 py-3 bg-card border-b shadow-sm">
            <div className="flex items-center gap-3">
                <GraduationCap className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-xl font-bold text-foreground">SmartSeat</h1>
                    <p className="text-xs text-muted-foreground">{className}</p>
                </div>
            </div>
            <div className="flex gap-2 bg-muted rounded-lg p-1">
                <Button
                    variant={mode === 'edit' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setMode('edit')}
                    className="gap-2"
                >
                    <Edit3 className="h-4 w-4" />
                    מצב עריכה
                </Button>
                <Button
                    variant={mode === 'lesson' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setMode('lesson')}
                    className="gap-2"
                >
                    <BookOpen className="h-4 w-4" />
                    מצב שיעור
                </Button>
            </div>
        </header>
    );
}
