import { supabase } from "@/integrations/supabase/client";

/**
 * Calculates the attendance deduction according to MoE rules.
 * 
 * לתלמיד שלא נעדר כלל או שנעדר עד 15% משעות ההוראה - לא יופחתו נקודות
 * לתלמיד שנעדר מעל 15% ועד 20% - יופחתו 5 נקודות
 * לתלמיד שנעדר מעל 20% ועד 25% - יופחתו 7 נקודות
 * לתלמיד שנעדר מעל 25% ועד 30% - יופחתו 9 נקודות
 * לתלמיד שנעדר מ-30% ומעלה - יופחתו 15 נקודות
 *
 * @param percentAbsent percentage of unexcused absences
 * @returns number of points to deduct from final grade (positive integer)
 */
export const calculateMoEAtdDeduction = (percentAbsent: number): number => {
  if (percentAbsent <= 15) return 0;
  if (percentAbsent > 15 && percentAbsent <= 20) return 5;
  if (percentAbsent > 20 && percentAbsent <= 25) return 7;
  if (percentAbsent > 25 && percentAbsent <= 30) return 9;
  return 15; // > 30%
};

export interface SubjectGradeReport {
  subject: string;
  examsGrade: number; // The weighted sum of all exams so far
  totalWeightSoFar: number; // Sum of weights of exams that have been graded
  totalLessons: number;
  totalUnexcusedAbsences: number;
  absencePercentage: number;
  deduction: number;
  finalGrade: number;
}

export const getStudentGrades = async (studentId: string, schoolId: string, semester: number = 1): Promise<SubjectGradeReport[]> => {
  // 1. Fetch student's class
  const { data: profile } = await supabase
    .from("profiles")
    .select("class_id")
    .eq("id", studentId)
    .single();

  if (!profile || !profile.class_id) return [];

  const { data: cls } = await supabase
    .from("classes")
    .select("grade")
    .eq("id", profile.class_id)
    .single();

  if (!cls || !cls.grade) return [];

  // 2. Fetch all exams and their weights for the student's grade & school & semester
  const { data: gradeEvents } = await supabase
    .from("grade_events")
    .select("id, subject, weight, title")
    .eq("school_id", schoolId)
    .eq("grade", cls.grade as string)
    .eq("semester", semester)
    .eq("event_type", "exam")
    .not("weight", "is", null);

  // 3. Fetch all grades (submissions) the student received
  const { data: assignments } = await supabase
    .from("assignments")
    .select(`
      id, 
      subject, 
      submissions(grade)
    `)
    .eq("school_id", schoolId);

  // We map assignments closely to grade_events based on subject or title. 
  // Normally there is a one-to-one mapping if assignments are linked to grade_events, but our current DB schema
  // groups assignments independently. Let's merge exams and assignments by subject.
  // Actually, since grade_events stores the *weight*, assignments must refer to grade_events OR we approximate by subject.
  // Assuming assignments belong to subjects and we aggregate by subject for exams.

  const { data: subjectAssignments } = await supabase
    .from("assignments")
    .select("id, class_id, subject")
    .eq("class_id", profile.class_id);

  const assignmentIds = subjectAssignments?.map(a => a.id) || [];
  
  let submissions = [];
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from("submissions")
      .select("assignment_id, student_id, grade")
      .eq("student_id", studentId)
      .in("assignment_id", assignmentIds);
    submissions = subs || [];
  }

  // Group by Subject
  const subjectsMap = new Map<string, SubjectGradeReport>();

  // Initialize from events
  gradeEvents?.forEach(ev => {
    if (!ev.subject) return;
    if (!subjectsMap.has(ev.subject)) {
      subjectsMap.set(ev.subject, {
        subject: ev.subject,
        examsGrade: 0,
        totalWeightSoFar: 0,
        totalLessons: 0,
        totalUnexcusedAbsences: 0,
        absencePercentage: 0,
        deduction: 0,
        finalGrade: 0,
      });
    }
  });

  // Since we don't have a strict tie between assignments and grade_events, we calculate average assignment grade
  // per subject and apply the total weight...
  // In a robust schema, assignment.exam_event_id would link to grade_events.id. 
  // Let's assume for now we average the student's submissions per subject.
  subjectAssignments?.forEach(a => {
    if (!a.subject) return;
    if (!subjectsMap.has(a.subject)) {
      subjectsMap.set(a.subject, {
        subject: a.subject,
        examsGrade: 0,
        totalWeightSoFar: 0,
        totalLessons: 0,
        totalUnexcusedAbsences: 0,
        absencePercentage: 0,
        deduction: 0,
        finalGrade: 0,
      });
    }
  });

  // Populate average grades...
  subjectsMap.forEach((report, subject) => {
    const sAssigns = subjectAssignments?.filter(a => a.subject === subject).map(a => a.id) || [];
    const sSubs = submissions.filter(s => sAssigns.includes(s.assignment_id) && s.grade !== null);
    
    // Calculate unweighted average for now if no specific weight mapping is provided
    if (sSubs.length > 0) {
      const avg = sSubs.reduce((acc, curr) => acc + (curr.grade || 0), 0) / sSubs.length;
      report.examsGrade = avg;
    }
  });

  // 4. Fetch Attendance for all subjects
  // Lessons
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, subject")
    .eq("class_id", profile.class_id);

  const lessonIdsBySubject = new Map<string, string[]>();
  lessons?.forEach(l => {
    if (!lessonIdsBySubject.has(l.subject)) lessonIdsBySubject.set(l.subject, []);
    lessonIdsBySubject.get(l.subject)?.push(l.id);
  });

  // Attendances
  const { data: allAtts } = await supabase
    .from("attendance")
    .select("lesson_id, status")
    .eq("student_id", studentId);

  // Compile calculations
  subjectsMap.forEach((report, subject) => {
    const lIds = lessonIdsBySubject.get(subject) || [];
    report.totalLessons = lIds.length;

    const myAtts = allAtts?.filter(a => lIds.includes(a.lesson_id)) || [];
    const unexcused = myAtts.filter(a => a.status === "absent").length; // "late" is typically partial or a 1/3 absence in some schools, let's keep it unexcused "absent" only per MoE

    report.totalUnexcusedAbsences = unexcused;
    report.absencePercentage = report.totalLessons > 0 ? Math.round((unexcused / report.totalLessons) * 100) : 0;
    
    // MoE Deduction
    report.deduction = calculateMoEAtdDeduction(report.absencePercentage);

    report.finalGrade = Math.max(0, report.examsGrade - report.deduction);
  });

  return Array.from(subjectsMap.values());
};
