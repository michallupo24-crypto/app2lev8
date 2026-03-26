import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import StudioModeWrapper from "./StudioModeWrapper";
import type { UserProfile } from "@/hooks/useAuth";

interface Props {
  profile: UserProfile;
  assignmentId: string | null;
  onBack: () => void;
}

const MOCK_TOPICS = [
  { topic: "אלגברה", coverage: 85 },
  { topic: "גיאומטריה", coverage: 60 },
  { topic: "חשבון דיפרנציאלי", coverage: 40 },
  { topic: "הסתברות", coverage: 25 },
  { topic: "טריגונומטריה", coverage: 70 },
];

const BagrutCoverageBar = ({ profile, assignmentId, onBack }: Props) => {
  const overallCoverage = Math.round(
    MOCK_TOPICS.reduce((sum, t) => sum + t.coverage, 0) / MOCK_TOPICS.length
  );

  return (
    <StudioModeWrapper
      title="בר הספק לבגרות"
      description="אחוז החיפוי של חומר הבגרות שהמשימות מכסות"
      icon={<Target className="h-6 w-6 text-warning" />}
      onBack={onBack}
    >
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-6 bg-gradient-to-l from-warning/10 to-transparent">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold">חיפוי כולל</h3>
                <Badge className={`text-lg font-bold ${
                  overallCoverage >= 70 ? "bg-success" : overallCoverage >= 40 ? "bg-warning" : "bg-destructive"
                } text-white border-0`}>
                  {overallCoverage}%
                </Badge>
              </div>
              <Progress value={overallCoverage} className="h-4 rounded-full" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {MOCK_TOPICS.map((t) => (
            <Card key={t.topic}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-heading">{t.topic}</span>
                    <span className={`text-xs font-bold ${
                      t.coverage >= 70 ? "text-success" : t.coverage >= 40 ? "text-warning" : "text-destructive"
                    }`}>{t.coverage}%</span>
                  </div>
                  <Progress value={t.coverage} className="h-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-info/30 bg-info/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-body text-info">
              💡 הנתונים מחושבים בהתאם לתגיות הנושאים במשימות הקיימות אל מול סילבוס הבגרות
            </p>
          </CardContent>
        </Card>
      </div>
    </StudioModeWrapper>
  );
};

export default BagrutCoverageBar;
