import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, School, Sparkles } from "lucide-react";
import { HOLIDAY_PERIODS } from "./MonthlyCalendar";
import type { UserProfile } from "@/hooks/useAuth";

const parseSchoolDate = (isoDate: string) => new Date(`${isoDate}T12:00:00`);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayDiff = (from: Date, to: Date) => Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

const dateFormatter = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" });

interface YearlyOverviewProps {
  profile: UserProfile;
}

const YearlyOverview = ({ profile }: YearlyOverviewProps) => {
  const now = startOfDay(new Date());

  const holidays = useMemo(() =>
    HOLIDAY_PERIODS.map(h => {
      const startDate = parseSchoolDate(h.start);
      const endDate = parseSchoolDate(h.end);
      const returnDateObj = h.returnDate ? parseSchoolDate(h.returnDate) : null;
      const isActive = now.getTime() >= startOfDay(startDate).getTime() && now.getTime() <= startOfDay(endDate).getTime();
      const isPast = startOfDay(endDate).getTime() < now.getTime();
      const daysUntil = dayDiff(now, startDate);
      const duration = dayDiff(startDate, endDate) + 1;
      return { ...h, startDate, endDate, returnDateObj, isActive, isPast, daysUntil, duration };
    }), [now]);

  // School year months Sep-Jun
  const months = useMemo(() => {
    const result = [];
    for (let m = 8; m <= 17; m++) { // 8=Sep(2025), 17=Jun(2026)
      const year = m <= 11 ? 2025 : 2026;
      const month = m <= 11 ? m : m - 12;
      const monthName = new Intl.DateTimeFormat("he-IL", { month: "long" }).format(new Date(year, month, 1));
      const monthHolidays = holidays.filter(h => {
        const hMonth = h.startDate.getMonth();
        const hYear = h.startDate.getFullYear();
        return hMonth === month && hYear === year;
      });
      result.push({ month, year, monthName, holidays: monthHolidays });
    }
    return result;
  }, [holidays]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            <span className="font-heading font-bold text-sm">שנת הלימודים תשפ"ו (2025-2026)</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {months.map(({ month, year, monthName, holidays: monthHolidays }) => (
          <Card key={`${year}-${month}`} className={monthHolidays.some(h => h.isActive) ? "ring-2 ring-primary" : ""}>
            <CardContent className="py-3 px-4">
              <p className="font-heading font-bold text-sm mb-2">{monthName} {year}</p>
              {monthHolidays.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין חופשות</p>
              ) : (
                <div className="space-y-2">
                  {monthHolidays.map(h => (
                    <div
                      key={h.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                        h.isActive
                          ? "bg-info/10 border-info/20 text-info"
                          : h.isPast
                            ? "bg-muted/50 border-border/30 text-muted-foreground"
                            : "bg-accent/30 border-accent/50"
                      }`}
                    >
                      {h.isActive ? (
                        <Sparkles className="h-4 w-4 shrink-0" />
                      ) : (
                        <Sun className="h-4 w-4 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-medium truncate">{h.title}</p>
                        <p className="text-[10px] opacity-70">
                          {dateFormatter.format(h.startDate)}
                          {h.duration > 1 && ` - ${dateFormatter.format(h.endDate)}`}
                          {h.duration > 1 && ` (${h.duration} ימים)`}
                        </p>
                      </div>
                      {!h.isPast && !h.isActive && (
                        <Badge variant="outline" className="text-[9px] px-1.5 h-4 shrink-0">
                          {h.daysUntil} ימים
                        </Badge>
                      )}
                      {h.isActive && (
                        <Badge className="bg-info/20 text-info border-info/30 text-[9px]" variant="outline">עכשיו</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default YearlyOverview;
