import React from 'react';
import { Student, AppMode } from '@/types/smartseat';
import { Button } from '@/components/ui/button';
import { User, Plus, X, Trash2, Import, UserMinus, Volume2 } from 'lucide-react';
import AvatarPreview from "@/components/avatar/AvatarPreview";

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

export function StudentSidebar({ students, unseated, mode, highlightedId, onAdd, onRemove, onHighlight, onSpeak, onCycleAttendance, onImport, onUnassign }: Props) {
    const [name, setName] = React.useState('');

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('studentId', id);
        e.dataTransfer.setData('text/plain', id); // Cross-browser fallback
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside className="w-80 border-r bg-card p-4 flex flex-col gap-6" dir="rtl">
            <div>
                <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
                    תלמידים ({students.length})
                </h3>
                
                {mode === 'edit' && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (onAdd(name), setName(''))}
                                placeholder="שם תלמיד/ה..."
                                className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm"
                            />
                            <Button size="icon" onClick={() => (onAdd(name), setName(''))}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {mode === 'edit' ? 'ממתינים לשיבוץ' : 'רשימת תלמידים'}
                </h4>
                
                {(mode === 'edit' ? unseated : students).map(s => (
                    <div
                        key={s.id}
                        draggable={mode === 'edit'}
                        onDragStart={(e) => handleDragStart(e, s.id)}
                        className={`
                            group flex items-center justify-between p-2 rounded-xl border transition-all
                            ${s.id === highlightedId ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-transparent hover:bg-muted'}
                            ${mode === 'edit' ? 'cursor-grab active:cursor-grabbing hover:border-primary/30' : ''}
                        `}
                    >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 flex items-center justify-center shrink-0">
                            {s.avatar ? (
                              <AvatarPreview config={s.avatar} size={32} />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium">{s.name}</span>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {mode === 'lesson' ? (
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSpeak(s)}>
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                            ) : (
                                <>
                                    {s.seatRow !== undefined && (
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onUnassign(s.id)}>
                                            <UserMinus className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onRemove(s.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
