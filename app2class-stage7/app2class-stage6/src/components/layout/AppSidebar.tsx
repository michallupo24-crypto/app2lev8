import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  GraduationCap,
  UserCheck,
  BookOpen,
  BarChart3,
  LogOut,
  Shield,
  Target,
  Calendar,
  Brain,
  ClipboardList,
  Flame,
  FileText,
  MessageCircle,
  Building2,
  Radio,
  Wand2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד/ה",
  parent: "הורה",
  educator: "מחנך/ת",
  professional_teacher: "מורה מקצועי/ת",
  subject_coordinator: "רכז/ת מקצוע",
  grade_coordinator: "רכז/ת שכבה",
  counselor: "יועץ/ת",
  management: "הנהלה",
  system_admin: "מנהל/ת מערכת",
};

interface AppSidebarProps {
  profile: UserProfile;
  onLogout: () => void;
}

export function AppSidebar({ profile, onLogout }: AppSidebarProps) {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";
  const roles = profile.roles;

  const isStudent = roles.includes("student");
  const isTeacher = roles.some((r) =>
    ["professional_teacher", "subject_coordinator"].includes(r)
  );
  const isGradeCoordinator = roles.includes("grade_coordinator");
  const isStaff = roles.some((r) =>
    ["educator", "professional_teacher", "subject_coordinator", "grade_coordinator", "counselor", "management", "system_admin"].includes(r)
  );
  const isAdmin = roles.includes("system_admin");
  const isManagement = roles.includes("management");
  const isEducator = roles.includes("educator");
  const hasApprovalPower = isAdmin || isManagement || isEducator || roles.includes("grade_coordinator");

  // Student navigation
  const studentItems = [
    { title: "דאשבורד", url: "/dashboard/student-home", icon: LayoutDashboard },
    { title: "המקצועות שלי", url: "/dashboard/subjects", icon: BookOpen },
    { title: "משימות", url: "/dashboard/tasks", icon: Target },
    { title: "ציונים", url: "/dashboard/grades", icon: FileText },
    { title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar },
    { title: "נוכחות", url: "/dashboard/attendance", icon: ClipboardList },
    { title: "עוזר AI", url: "/dashboard/ai-tutor", icon: Brain },
    { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
    { title: "קהילה", url: "/dashboard/community", icon: Users },
  ];

  // Teacher navigation (professional teacher / subject coordinator)
  const teacherItems: { title: string; url: string; icon: any }[] = [
    { title: "דאשבורד", url: "/dashboard/teacher-home", icon: LayoutDashboard },
    { title: "שיעור חי", url: "/dashboard/live-lesson", icon: Radio },
    { title: "הקראת שמות", url: "/dashboard/roll-call", icon: ClipboardList },
    { title: "משימות", url: "/dashboard/teacher-assignments", icon: FileText },
    { title: "סטודיו משימות", url: "/dashboard/task-studio", icon: Wand2 },
    { title: "ציונים", url: "/dashboard/teacher-grades", icon: BarChart3 },
    { title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar },
    { title: "הכיתות שלי", url: "/dashboard/my-classes", icon: Users },
    { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
  ];

  if (roles.includes("subject_coordinator")) {
    teacherItems.push({ title: "שיבוץ מורים", url: "/dashboard/assign-teachers", icon: GraduationCap });
  }
  if (hasApprovalPower) {
    teacherItems.push({ title: "אישורים", url: "/dashboard/approvals", icon: UserCheck });
  }

  // Grade coordinator navigation
  const gradeCoordinatorItems: { title: string; url: string; icon: any }[] = [
    { title: "דאשבורד", url: "/dashboard/grade-coordinator-home", icon: LayoutDashboard },
    { title: "לוח מבחנים", url: "/dashboard/master-scheduler", icon: Calendar },
    { title: "דופק שכבתי", url: "/dashboard/grade-progress", icon: BarChart3 },
    { title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar },
    { title: "תגבורים", url: "/dashboard/tutoring", icon: Users },
    { title: "ישיבות צוות", url: "/dashboard/staff-meetings", icon: ClipboardList },
    { title: "הודעות", url: "/dashboard/grade-announcements", icon: Bell },
    { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
    { title: "אישורים", url: "/dashboard/approvals", icon: UserCheck },
  ];

  // Management/admin navigation
  const adminItems: { title: string; url: string; icon: any }[] = [
    { title: "דאשבורד", url: "/dashboard", icon: LayoutDashboard },
  ];

  if (hasApprovalPower) {
    adminItems.push({ title: "אישורים", url: "/dashboard/approvals", icon: UserCheck });
  }
  if (isStaff) {
    adminItems.push({ title: "תלמידים", url: "/dashboard/students", icon: GraduationCap });
    adminItems.push({ title: "כיתות", url: "/dashboard/classes", icon: BookOpen });
  }
  if (isEducator) {
    adminItems.push({ title: "הקראת שמות", url: "/dashboard/roll-call", icon: ClipboardList });
    adminItems.push({ title: "משימות", url: "/dashboard/teacher-assignments", icon: FileText });
  }
  if (roles.includes("parent")) {
    adminItems.push({ title: "הילד שלי", url: "/dashboard/my-child", icon: Users });
  }
  if (isManagement && !isAdmin) {
    adminItems.push({ title: "סטטיסטיקות", url: "/dashboard/stats", icon: BarChart3 });
    adminItems.push({ title: "עץ ארגוני", url: "/dashboard/org-tree", icon: Building2 });
  }
  if (isAdmin) {
    adminItems.push({ title: "סטטיסטיקות", url: "/dashboard/stats", icon: BarChart3 });
    adminItems.push({ title: "עץ ארגוני מערכת", url: "/dashboard/system-org-tree", icon: Building2 });
  }
  if (isAdmin) {
    adminItems.push({ title: "ניהול מערכת", url: "/dashboard/admin", icon: Shield });
  }
  adminItems.push({ title: "שיחות", url: "/dashboard/chat", icon: MessageCircle });
  adminItems.push({ title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar });

  const mainItems = isStudent ? studentItems : isGradeCoordinator ? gradeCoordinatorItems : (isTeacher && !isManagement && !isAdmin) ? teacherItems : adminItems;

  return (
    <Sidebar side="right" collapsible="icon" className="border-r-0 border-l border-border/50">
      <SidebarContent>
        {/* User Profile Section */}
        <SidebarGroup>
          <div
            className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors ${collapsed ? "justify-center" : ""}`}
            onClick={() => navigate("/dashboard/avatar-edit")}
            title="ערוך אווטאר"
          >
            <div className="shrink-0">
              {profile.avatar ? (
                <AvatarPreview config={profile.avatar} size={collapsed ? 32 : 48} />
              ) : (
                <div
                  className="bg-muted border border-border rounded-lg flex items-center justify-center"
                  style={{ width: collapsed ? 32 : 48, height: collapsed ? 32 : 48 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-3/4 h-3/4 text-muted-foreground/40">
                    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" fill="currentColor"/>
                  </svg>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-heading font-bold text-sm truncate">{profile.fullName}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {roles.slice(0, 2).map((r) => (
                    <span key={r} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-heading">
                      {ROLE_LABELS[r] || r}
                    </span>
                  ))}
                  {roles.length > 2 && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      +{roles.length - 2}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </SidebarGroup>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-heading">תפריט ראשי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard" || item.url === "/dashboard/student-home" || item.url === "/dashboard/teacher-home" || item.url === "/dashboard/grade-coordinator-home"}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="font-body text-sm">{item.title}</span>
                      )}
                      {!collapsed && item.url === "/dashboard/approvals" && profile.pendingApprovalsCount > 0 && (
                        <Badge variant="destructive" className="mr-auto text-[10px] px-1.5 py-0 h-5">
                          {profile.pendingApprovalsCount}
                        </Badge>
                      )}
                      {!collapsed && item.url === "/dashboard/chat" && profile.unreadChatCount > 0 && (
                        <Badge variant="destructive" className="mr-auto text-[10px] px-1.5 py-0 h-5">
                          {profile.unreadChatCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout} className="text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="font-body text-sm">התנתק</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
