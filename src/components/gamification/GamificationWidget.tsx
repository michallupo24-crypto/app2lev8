import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Shield, Trophy, Zap, ChevronLeft } from "lucide-react";
import { useGamification, getReliabilityLevel } from "@/hooks/useGamification";
import { motion } from "framer-motion";

interface GamificationWidgetProps {
  userId: string;
  compact?: boolean;
}

const GamificationWidget = ({ userId, compact = false }: GamificationWidgetProps) => {
  const navigate = useNavigate();
  const { badges, streak, reliability, loading } = useGamification(userId);

  if (loading) return (
    <div className="h-48 w-full animate-pulse bg-muted rounded-xl" />
  );

  const reliabilityInfo = reliability ? getReliabilityLevel(reliability.score) : null;
  
  // XP & Level calculation
  const totalBadges = badges.length;
  const activeDays = streak?.total_active_days || 0;
  const xp = (activeDays * 10) + (totalBadges * 100);
  const currentLevel = Math.floor(xp / 500) + 1;
  const progressToNext = ((xp % 500) / 500) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap" dir="rtl">
        {streak && streak.current_streak > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] bg-orange-500/10 text-orange-600 border-orange-200">
            <Flame className="h-3 w-3 fill-orange-500" />
            {streak.current_streak} ימי רצף
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 text-[10px] bg-primary/10 text-primary border-primary/20">
          <Zap className="h-3 w-3 fill-primary" />
          רמה {currentLevel}
        </Badge>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-background via-background to-primary/5 hover:shadow-xl transition-all duration-300">
      <div className="h-1.5 w-full bg-primary/10">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progressToNext}%` }}
          className="h-full bg-primary"
        />
      </div>
      <CardHeader className="pb-2 space-y-0">
        <CardTitle className="text-base font-heading flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span className="font-black">ההישגים שלי</span>
          </div>
          <div className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
            LVL {currentLevel}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-2" dir="rtl">
          <div className="p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/10 flex flex-col items-center justify-center">
            <Flame className="h-5 w-5 text-orange-500 mb-1 fill-orange-500/20" />
            <span className="text-lg font-black leading-none">{streak?.current_streak || 0}</span>
            <span className="text-[9px] text-muted-foreground font-bold">ימי רצף</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/10 flex flex-col items-center justify-center">
            <Shield className="h-5 w-5 text-blue-500 mb-1 fill-blue-500/20" />
            <span className="text-lg font-black leading-none">{reliability?.score || 0}</span>
            <span className="text-[9px] text-muted-foreground font-bold">אמינות</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-tight text-muted-foreground px-1">
             <span>מדליות אחרונות</span>
             <span className="text-primary">{badges.length} סה"כ</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {badges.length > 0 ? (
              badges.slice(0, 4).map(b => (
                <div 
                  key={b.badge_key} 
                  className="h-10 w-10 shrink-0 rounded-lg bg-background border border-muted flex items-center justify-center text-xl shadow-sm hover:scale-110 transition-transform cursor-help"
                  title={b.badge_label}
                >
                  {b.badge_icon}
                </div>
              ))
            ) : (
              <div className="w-full py-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                עדיין אין מדליות. צא לדרך! 🚀
              </div>
            )}
          </div>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-xs font-bold text-primary hover:bg-primary/5 hover:text-primary group gap-1"
          onClick={() => navigate("/dashboard/badges")}
        >
          לכל ההישגים והמדליות
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default GamificationWidget;
