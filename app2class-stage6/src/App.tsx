import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import StudentRegistration from "./pages/register/StudentRegistration";
import ParentRegistration from "./pages/register/ParentRegistration";
import StaffRegistration from "./pages/register/StaffRegistration";
import DashboardLayout from "./components/layout/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import ApprovalsPage from "./pages/dashboard/ApprovalsPage";
import PlaceholderPage from "./pages/dashboard/PlaceholderPage";
import SubjectDetailPage from "./pages/dashboard/SubjectDetailPage";
import StudentDashboard from "./pages/dashboard/StudentDashboard";
import SubjectHubsPage from "./pages/dashboard/SubjectHubsPage";
import TasksPage from "./pages/dashboard/TasksPage";
import TeacherDashboard from "./pages/dashboard/TeacherDashboard";
import RollCallPage from "./pages/dashboard/RollCallPage";
import TeacherAssignmentsPage from "./pages/dashboard/TeacherAssignmentsPage";
import GradeCoordinatorDashboard from "./pages/dashboard/GradeCoordinatorDashboard";
import MasterSchedulerPage from "./pages/dashboard/MasterSchedulerPage";
import GradeProgressPage from "./pages/dashboard/GradeProgressPage";
import TutoringManagementPage from "./pages/dashboard/TutoringManagementPage";
import StaffMeetingsPage from "./pages/dashboard/StaffMeetingsPage";
import GradeAnnouncementsPage from "./pages/dashboard/GradeAnnouncementsPage";
import AITutorPage from "./pages/dashboard/AITutorPage";
import AvatarEditPage from "./pages/dashboard/AvatarEditPage";
import ChatPage from "./pages/dashboard/ChatPage";
import SchoolOrgTreePage from "./pages/dashboard/SchoolOrgTreePage";
import SchedulePage from "./pages/dashboard/SchedulePage";
import CommunityPage from "./pages/dashboard/CommunityPage";
import TeacherLiveLessonPage from "./pages/dashboard/TeacherLiveLessonPage";
import TeacherAssignmentPage from "./pages/dashboard/TeacherAssignmentPage";
import SystemAdminOrgTreePage from "./pages/dashboard/SystemAdminOrgTreePage";
import StudentGradesPage from "./pages/dashboard/StudentGradesPage";
import TeacherGradesPage from "./pages/dashboard/TeacherGradesPage";
import TaskStudioPage from "./pages/dashboard/TaskStudioPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/student" element={<StudentRegistration />} />
          <Route path="/register/parent" element={<ParentRegistration />} />
          <Route path="/register/staff" element={<StaffRegistration />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="students" element={<PlaceholderPage title="תלמידים" description="ניהול תלמידים ומעקב אחר התקדמות" icon="🎓" />} />
            <Route path="classes" element={<PlaceholderPage title="כיתות" description="ניהול כיתות, מערכת שעות ושיוכים" icon="📚" />} />
            <Route path="my-child" element={<PlaceholderPage title="הילד שלי" description="צפייה במידע ובהתקדמות הילד" icon="👨‍👧" />} />
            <Route path="stats" element={<PlaceholderPage title="סטטיסטיקות" description="נתונים, גרפים ודוחות" icon="📊" />} />
            <Route path="admin" element={<PlaceholderPage title="ניהול מערכת" description="הגדרות מערכת ובתי ספר" icon="🛡️" />} />
            <Route path="org-tree" element={<SchoolOrgTreePage />} />
            <Route path="system-org-tree" element={<SystemAdminOrgTreePage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="timetable" element={<SchedulePage />} />
            <Route path="calendar" element={<SchedulePage />} />
            <Route path="community" element={<CommunityPage />} />
            {/* Student routes */}
            <Route path="student-home" element={<StudentDashboard />} />
            <Route path="subjects" element={<SubjectHubsPage />} />
            <Route path="subjects/:subjectName" element={<SubjectDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="ai-tutor" element={<AITutorPage />} />
            <Route path="grades" element={<StudentGradesPage />} />
            <Route path="attendance" element={<PlaceholderPage title="נוכחות" description="דוח נוכחות והצדקת חיסורים" icon="📋" />} />
            {/* Teacher routes */}
            <Route path="teacher-home" element={<TeacherDashboard />} />
            <Route path="roll-call" element={<RollCallPage />} />
            <Route path="live-lesson" element={<TeacherLiveLessonPage />} />
            <Route path="teacher-assignments" element={<TeacherAssignmentsPage />} />
            <Route path="task-studio" element={<TaskStudioPage />} />
            <Route path="teacher-grades" element={<TeacherGradesPage />} />
            <Route path="my-classes" element={<PlaceholderPage title="הכיתות שלי" description="ניהול כיתות, תלמידים ומפת ישיבה" icon="🏫" />} />
            <Route path="assign-teachers" element={<TeacherAssignmentPage />} />
            {/* Grade Coordinator routes */}
            <Route path="grade-coordinator-home" element={<GradeCoordinatorDashboard />} />
            <Route path="master-scheduler" element={<MasterSchedulerPage />} />
            <Route path="grade-progress" element={<GradeProgressPage />} />
            <Route path="tutoring" element={<TutoringManagementPage />} />
            <Route path="staff-meetings" element={<StaffMeetingsPage />} />
            <Route path="grade-announcements" element={<GradeAnnouncementsPage />} />
            <Route path="avatar-edit" element={<AvatarEditPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="event-approvals" element={<PlaceholderPage title="אישורי הורים" description="מעקב חתימות הורים לאירועים וטיולים" icon="✍️" />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
