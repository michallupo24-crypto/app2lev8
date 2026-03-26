import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame, Shield, Award, Star } from "lucide-react";
import { useGamification, getReliabilityLevel } from "@/hooks/useGamification";

interface GamificationWidgetProps {
  userId: string;
  compact?: boolean;
}

const GamificationWidget = ({ userId, compact = false }: GamificationWidgetProps) => {
  const { badges, streak, reliability, loading } = useGamification(userId);

  if (loading) return null;

  const reliabilityInfo = reliability ? getReliabilityLevel(reliability.score) : null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {streak && streak.current_streak > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] bg-warning/10 text-warning border-warning/30">
            <Flame className="h-3 w-3" />
            {streak.current_streak} ימים 🔥
          </Badge>
        )}
        {reliabilityInfo && reliability && (
          <Badge variant="outline" className={`gap-1 text-[10px] ${reliabilityInfo.color}`}>
            <Shield className="h-3 w-3" />
            {reliability.score}
          </Badge>
        )}
        {badges.slice(0, 3).map(b => (
          <span key={b.badge_key} className="text-sm" title={b.badge_label}>{b.badge_icon}</span>
        ))}
        {badges.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{badges.length - 3}</span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Star className="h-5 w-5 text-secondary" />
          הפרופיל שלי
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streak */}
        {streak && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
            <Flame className="h-8 w-8 text-warning" />
            <div>
              <p className="font-heading font-bold text-lg">{streak.current_streak} ימים רצופים 🔥</p>
              <p className="text-xs text-muted-foreground">שיא: {streak.longest_streak} ימים · סה"כ {streak.total_active_days} ימים פעילים</p>
            </div>
          </div>
        )}

        {/* Reliability */}
        {reliability && reliabilityInfo && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-heading flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" />
                מדד אמינות
              </span>
              <span className={`text-sm font-bold ${reliabilityInfo.color}`}>
                {reliabilityInfo.emoji} {reliabilityInfo.label} ({reliability.score}/100)
              </span>
            </div>
            <Progress value={reliability.score} className="h-2" />
            {reliability.is_faction_guardian && (
              <Badge className="bg-accent/10 text-accent border-accent/30 gap-1">
                🛡️ נאמן פלג
              </Badge>
            )}
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div>
            <p className="text-sm font-heading font-medium mb-2 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-secondary" />
              תגים ({badges.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {badges.map(b => (
                <Badge
                  key={b.badge_key}
                  variant="outline"
                  className="gap-1 text-xs py-1 px-2"
                  title={`הושג: ${new Date(b.earned_at).toLocaleDateString("he-IL")}`}
                >
                  {b.badge_icon} {b.badge_label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GamificationWidget;
