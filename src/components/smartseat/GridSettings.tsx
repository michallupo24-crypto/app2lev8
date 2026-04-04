import { ClassroomConfig } from '@/types/smartseat';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';

interface Props {
    config: ClassroomConfig;
    onChange: (c: ClassroomConfig) => void;
}

export function GridSettings({ config, onChange }: Props) {
    return (
        <div className="flex items-center gap-4 px-6 py-3 bg-card border-b">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">שם כיתה:</Label>
                <Input
                    className="w-32 h-7 text-xs"
                    value={config.className}
                    onChange={e => onChange({ ...config, className: e.target.value })}
                />
            </div>
            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">שורות:</Label>
                <Input
                    type="number" min={1} max={10}
                    className="w-16 h-7 text-xs"
                    value={config.rows}
                    onChange={e => onChange({ ...config, rows: Math.max(1, +e.target.value) })}
                />
            </div>
            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">עמודות:</Label>
                <Input
                    type="number" min={1} max={10}
                    className="w-16 h-7 text-xs"
                    value={config.cols}
                    onChange={e => onChange({ ...config, cols: Math.max(1, +e.target.value) })}
                />
            </div>
        </div>
    );
}
