import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CalendarDays, CalendarRange } from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import DailyTimetable from "@/components/schedule/DailyTimetable";
import MonthlyCalendar from "@/components/schedule/MonthlyCalendar";
import YearlyOverview from "@/components/schedule/YearlyOverview";
import TeacherAttendanceWidget from "@/components/schedule/TeacherAttendanceWidget";

const SchedulePage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const [tab, setTab] = useState("daily");

  const isTeacher = profile.roles.some(r =>
    ["educator", "professional_teacher", "subject_coordinator"].includes(r)
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Teacher attendance widget */}
      {isTeacher && <TeacherAttendanceWidget profile={profile} />}

      {/* Header with tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Calendar className="h-7 w-7 text-primary" />
            לוח זמנים
          </h1>
          <p className="text-sm text-muted-foreground font-body mt-1">
            מערכת שעות, לוח מבחנים וחופשות
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full h-auto p-1 bg-muted/50">
          <TabsTrigger
            value="daily"
            className="flex-1 gap-1.5 py-2.5 font-heading text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            יומי
          </TabsTrigger>
          <TabsTrigger
            value="monthly"
            className="flex-1 gap-1.5 py-2.5 font-heading text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <CalendarDays className="h-4 w-4" />
            חודשי
          </TabsTrigger>
          <TabsTrigger
            value="yearly"
            className="flex-1 gap-1.5 py-2.5 font-heading text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <CalendarRange className="h-4 w-4" />
            שנתי
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <DailyTimetable profile={profile} />
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <MonthlyCalendar profile={profile} />
        </TabsContent>

        <TabsContent value="yearly" className="mt-4">
          <YearlyOverview profile={profile} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default SchedulePage;
