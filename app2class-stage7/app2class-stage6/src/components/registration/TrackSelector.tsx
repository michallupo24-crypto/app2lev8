import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEGAMOT_CLUSTERS, HAKBATZOT } from "@/lib/constants";

export interface TrackSelection {
  megama_a: string | null;
  megama_b: string | null;
  hakbatzot: { subject: string; level: string }[];
}

interface TrackSelectorProps {
  grade: string;
  value: TrackSelection;
  onChange: (v: TrackSelection) => void;
}

const TrackSelector = ({ grade, value, onChange }: TrackSelectorProps) => {
  const isHighSchool = ["י", "יא", "יב"].includes(grade);
  if (!isHighSchool) return null;

  const setMegama = (cluster: "a" | "b", option: string) => {
    const key = cluster === "a" ? "megama_a" : "megama_b";
    const current = value[key];
    onChange({
      ...value,
      [key]: current === option ? null : option,
    });
  };

  const setHakbatza = (subject: string, level: string) => {
    const existing = value.hakbatzot.filter(h => h.subject !== subject);
    onChange({
      ...value,
      hakbatzot: [...existing, { subject, level }],
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-info/5 border border-info/20 rounded-xl p-3">
        <p className="text-xs text-info font-heading font-medium">
          ℹ️ המידע הזה עובר אישור של המחנך/ת שלך - אנא מלא/י בדיוק
        </p>
      </div>

      {/* Megamot by cluster */}
      {MEGAMOT_CLUSTERS.map((cluster, idx) => {
        const clusterKey = idx === 0 ? "a" : "b";
        const selected = clusterKey === "a" ? value.megama_a : value.megama_b;
        return (
          <div key={cluster.name} className="space-y-2">
            <Label className="font-heading text-sm">{cluster.name} - בחר מגמה אחת</Label>
            <div className="flex flex-wrap gap-2">
              {cluster.options.map(m => (
                <Badge
                  key={m}
                  variant={selected === m ? "default" : "outline"}
                  className="cursor-pointer text-xs py-1 px-3 transition-all hover:scale-105"
                  onClick={() => setMegama(clusterKey, m)}
                >
                  {selected === m ? "✓ " : ""}{m}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}

      {/* Hakbatzot */}
      <div className="space-y-3">
        <Label className="font-heading">הקבצות (רמת לימוד)</Label>
        {HAKBATZOT.map(h => (
          <div key={h.subject} className="flex items-center gap-3">
            <span className="text-sm font-body w-20 shrink-0">{h.subject}</span>
            <Select
              value={value.hakbatzot.find(hk => hk.subject === h.subject)?.level || ""}
              onValueChange={(v) => setHakbatza(h.subject, v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="בחר רמה" />
              </SelectTrigger>
              <SelectContent>
                {h.levels.map(l => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrackSelector;
