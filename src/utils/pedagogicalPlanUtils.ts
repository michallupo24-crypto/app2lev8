
import { supabase } from "@/integrations/supabase/client";

/**
 * Pedagogical Planning Utilities
 * Logic to calculate real lesson counts versus syllabus requirements.
 */

export interface LessonCountResult {
  totalPotentialLessons: number; // Lessons on schedule
  cancelledByHolidays: number;   // Lessons overlapping with holidays
  cancelledByEvents: number;     // Lessons overlapping with school events (trips, etc)
  actualLessons: number;        // Final usable count
}

/**
 * Calculates how many times a recurring lesson occurs between two dates, 
 * accounting for school holidays and events.
 */
export const calculateActualLessons = async (
  classId: string,
  subject: string,
  startDate: string,
  endDate: string
): Promise<LessonCountResult> => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // 1. Fetch timetable slots for this class/subject
  const { data: schedule } = await supabase
    .from("timetable_slots")
    .select("day_of_week")
    .eq("class_id", classId)
    .eq("subject", subject);

  if (!schedule || schedule.length === 0) {
    return { totalPotentialLessons: 0, cancelledByHolidays: 0, cancelledByEvents: 0, actualLessons: 0 };
  }

  const daysWithSubject = schedule.map(s => s.day_of_week);

  // 2. Fetch holidays/events for this school/period
  const { data: events } = await supabase
    .from("school_events")
    .select("*")
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  const res: LessonCountResult = {
    totalPotentialLessons: 0,
    cancelledByHolidays: 0,
    cancelledByEvents: 0,
    actualLessons: 0
  };

  // 3. Iterate over the dates
  const curr = new Date(start);
  while (curr <= end) {
    // day_of_week in DB (0=Sunday, 1=Monday... 6=Saturday)
    // getDay() is 0=Sunday, 1=Monday...
    const dayOfWeek = curr.getDay();
    
    // Check how many occurrences of the subject on this specific day
    const subjectOccurrences = schedule.filter(s => s.day_of_week === dayOfWeek).length;

    if (subjectOccurrences > 0) {
      res.totalPotentialLessons += subjectOccurrences;

      // Check for calendar overlaps
      const currStr = curr.toISOString().split('T')[0];
      const overlappingEvent = events?.find(e => 
        currStr >= e.start_date && currStr <= e.end_date
      );

      if (overlappingEvent) {
        if (overlappingEvent.is_holiday) {
          res.cancelledByHolidays += subjectOccurrences;
        } else {
          res.cancelledByEvents += subjectOccurrences;
        }
      } else {
        res.actualLessons += subjectOccurrences;
      }
    }
    
    curr.setDate(curr.getDate() + 1);
  }

  return res;
};

/**
 * Compares current syllabus progress against the potential lessons remaining.
 * Returns AI-driven insight about pedagogical pace.
 */
export const analyzeSyllabusPace = async (
  classId: string,
  subject: string,
  remainingTopics: { topic: string; hours: number }[],
  endDate: string
): Promise<{ status: 'on_track' | 'behind' | 'ahead', message: string }> => {
  const now = new Date().toISOString().split('T')[0];
  const lessons = await calculateActualLessons(classId, subject, now, endDate);
  
  const totalHoursNeeded = remainingTopics.reduce((acc, t) => acc + t.hours, 0);
  const ratio = lessons.actualLessons / totalHoursNeeded;

  if (ratio < 0.9) {
    return { 
      status: 'behind', 
      message: `שים לב: נותרו ${lessons.actualLessons} שיעורים בלבד לכיסוי ${totalHoursNeeded} שעות חומר. נדרש צמצום של ${Math.abs(totalHoursNeeded - lessons.actualLessons)} שעות או הוספת שיעורי תגבור.` 
    };
  } else if (ratio > 1.2) {
    return { 
      status: 'ahead', 
      message: `ישנו מרווח פדגוגי של ${lessons.actualLessons - totalHoursNeeded} שיעורים. ניתן להעמיק בחומר או להקדיש זמן לחלוקת תגבורים.` 
    };
  }
  
  return { 
    status: 'on_track', 
    message: 'קצב ההתקדמות תואם את לוח הזמנים והסילבוס.' 
  };
};
