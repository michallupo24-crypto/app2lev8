import { useState } from 'react';
import { Student, AppMode, AttendanceStatus } from '@/types/smartseat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Volume2, UserPlus, Upload, X } from 'lucide-react';

interface Props {
    students: Student[];
    unseated: Student[];
    mode: AppMode;
    highlightedId: string | null;
    onAdd: (name: string) => void;
    onRemove: (id: string) => void;
    onHighlight: (id: string | null) => void;
    onSpeak: (s: Student) => void;
    onCycleAttendance: (id: string) => void;
    onImport: (text: string) => void;
    onUnassign: (id: string) => void;
}

const statusBadge: Record<AttendanceStatus, { label: string; cls: string }> = {
    none: { label: '—', cls: 'bg-muted text-muted-foreground' },
    present: { label: 'נוכח', cls: 'bg-success/20 text-success' },
    absent: { label: 'חסר', cls: 'bg-destructive/20 text-destructive' },
    late: { label: 'איחור', cls: 'bg-warning/20 text-warning' },
    disruption: { label: 'הפרעה', cls: 'bg-destructive/20 text-destructive' },
    positive: { label: 'חיובי', cls: 'bg-success/20 text-success' },
};

export function StudentSidebar({ students, unseated, mode, highlightedId, onAdd, onRemove, onHighlight, onSpeak, onCycleAttendance, onImport, onUnassign }: Props) {
    const [newName, setNewName] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');

    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'he'));

    const handleAdd = () => {
        if (!newName.trim()) return;
        onAdd(newName);
        setNewName('');
    };

    const handleImport = () => {
        onImport(importText);
        setImportText('');
        setShowImport(false);
    };

    return (
        <aside className="w-72 bg-card border-s flex flex-col h-full">
            <div className="p-4 border-b">
                <h2 className="font-semibold text-foreground mb-3">
                    תלמידים ({students.length})
                </h2>

                {mode === 'edit' && (
                    <>
                        <div className="flex gap-2 mb-2">
                            <Input
                                placeholder="שם תלמיד/ה..."
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                className="text-sm"
                            />
                            <Button size="icon" variant="default" onClick={handleAdd}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button size="sm" variant="outline" className="w-full gap-2 text-xs" onClick={() => setShowImport(!showImport)}>
                            <Upload className="h-3 w-3" />
                            ייבוא רשימה
                        </Button>
                        {showImport && (
                            <div className="mt-2 space-y-2">
                                <textarea
                                    className="w-full h-24 text-xs p-2 rounded-md border bg-background resize-none"
                                    placeholder="הדביקו שמות (שם בכל שורה, או מופרדים בפסיקים)"
                                    value={importText}
                                    onChange={e => setImportText(e.target.value)}
                                />
                                <Button size="sm" className="w-full" onClick={handleImport}>ייבוא</Button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sorted.map(s => {
                    const badge = statusBadge[s.attendance];
                    return (
                        <div
                            key={s.id}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                                highlightedId === s.id ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-muted',
                            )}
                            onClick={() => onHighlight(highlightedId === s.id ? null : s.id)}
                            draggable={mode === 'edit'}
                            onDragStart={e => { e.dataTransfer.setData('studentId', s.id); }}
                        >
                            <div className="flex-1 font-medium text-card-foreground">{s.name}</div>

                            {mode === 'lesson' && (
                                <>
                                    <button
                                        onClick={e => { e.stopPropagation(); onCycleAttendance(s.id); }}
                                        className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', badge.cls)}
                                    >
                                        {badge.label}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); onSpeak(s); }}>
                                        <Volume2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                    </button>
                                </>
                            )}

                            {mode === 'edit' && (
                                <div className="flex gap-1">
                                    {s.seatRow !== undefined && (
                                        <button onClick={e => { e.stopPropagation(); onUnassign(s.id); }} title="הסר ממקום">
                                            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-warning" />
                                        </button>
                                    )}
                                    <button onClick={e => { e.stopPropagation(); onRemove(s.id); }}>
                                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {mode === 'edit' && unseated.length > 0 && (
                <div className="p-3 border-t bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                        <UserPlus className="h-3 w-3 inline ml-1" />
                        ללא מקום ({unseated.length}) — גררו למפה
                    </p>
                </div>
            )}
        </aside>
    );
}
