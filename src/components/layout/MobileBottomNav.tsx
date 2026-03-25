import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Target,
  Calendar,
  Brain,
  FileText,
  ClipboardList,
  BarChart3,
  Users,
  UserCheck,
  Bell,
  Shield,
  GraduationCap,
  Menu,
  MessageCircle,
} from "lucide-react";
import type { UserProfile } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface MobileBottomNavProps {
  profile: UserProfile;
}

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

function getNavItems(profile: UserProfile): { primary: NavItem[]; overflow: NavItem[] } {
  const roles = profile.roles;
  const isStudent = roles.includes("student");
  const isTeacher = roles.some((r) =>
    ["professional_teacher", "subject_coordinator"].includes(r)
  );
  const isEducator = roles.includes("educator");
  const isGradeCoordinator = roles.includes("grade_coordinator");
  const isAdmin = roles.includes("system_admin");
  const isManagement = roles.includes("management");

  if (isStudent) {
    return {
      primary: [
        { title: "בית", url: "/dashboard/student-home", icon: LayoutDashboard },
        { title: "מקצועות", url: "/dashboard/subjects", icon: BookOpen },
        { title: "משימות", url: "/dashboard/tasks", icon: Target },
        { title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar },
      ],
      overflow: [
        { title: "ציונים", url: "/dashboard/grades", icon: FileText },
        { title: "נוכחות", url: "/dashboard/attendance", icon: ClipboardList },
        { title: "עוזר AI", url: "/dashboard/ai-tutor", icon: Brain },
        { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
      ],
    };
  }

  if (isGradeCoordinator) {
    return {
      primary: [
        { title: "בית", url: "/dashboard/grade-coordinator-home", icon: LayoutDashboard },
        { title: "מבחנים", url: "/dashboard/master-scheduler", icon: Calendar },
        { title: "דופק", url: "/dashboard/grade-progress", icon: BarChart3 },
        { title: "הודעות", url: "/dashboard/grade-announcements", icon: Bell },
      ],
      overflow: [
        { title: "תגבורים", url: "/dashboard/tutoring", icon: Users },
        { title: "ישיבות", url: "/dashboard/staff-meetings", icon: ClipboardList },
        { title: "אישורים", url: "/dashboard/approvals", icon: UserCheck },
        { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
      ],
    };
  }

  if (isTeacher && !isManagement && !isAdmin) {
    return {
      primary: [
        { title: "בית", url: "/dashboard/teacher-home", icon: LayoutDashboard },
        { title: "נוכחות", url: "/dashboard/roll-call", icon: ClipboardList },
        { title: "משימות", url: "/dashboard/teacher-assignments", icon: FileText },
        { title: "ציונים", url: "/dashboard/teacher-grades", icon: BarChart3 },
      ],
      overflow: [
        { title: "כיתות", url: "/dashboard/my-classes", icon: Users },
        { title: "אישורים", url: "/dashboard/approvals", icon: UserCheck },
        { title: "שיחות", url: "/dashboard/chat", icon: MessageCircle },
      ],
    };
  }

  const adminPrimary: NavItem[] = [
    { title: "בית", url: "/dashboard", icon: LayoutDashboard },
    { title: "אישורים", url: "/dashboard/approvals", icon: UserCheck },
  ];
  
  if (isEducator) {
    adminPrimary.push({ title: "נוכחות", url: "/dashboard/roll-call", icon: ClipboardList });
    adminPrimary.push({ title: "לוח זמנים", url: "/dashboard/schedule", icon: Calendar });
  } else {
    adminPrimary.push({ title: "תלמידים", url: "/dashboard/students", icon: GraduationCap });
    adminPrimary.push({ title: "כיתות", url: "/dashboard/classes", icon: BookOpen });
  }

  const adminOverflow: NavItem[] = [];
  if (isEducator) {
    adminOverflow.push({ title: "תלמידים", url: "/dashboard/students", icon: GraduationCap });
    adminOverflow.push({ title: "כיתות", url: "/dashboard/classes", icon: BookOpen });
    adminOverflow.push({ title: "משימות", url: "/dashboard/teacher-assignments", icon: FileText });
  }
  adminOverflow.push({ title: "סטטיסטיקות", url: "/dashboard/stats", icon: BarChart3 });
  adminOverflow.push({ title: "ניהול", url: "/dashboard/admin", icon: Shield });
  adminOverflow.push({ title: "שיחות", url: "/dashboard/chat", icon: MessageCircle });

  return { primary: adminPrimary, overflow: adminOverflow };
}

export function MobileBottomNav({ profile }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { primary, overflow } = getNavItems(profile);

  const isActive = (url: string) => {
    if (url === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(url);
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-stretch justify-around px-1 py-1">
        {primary.map((item) => (
          <button
            key={item.url}
            onClick={() => navigate(item.url)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-colors min-h-[60px] relative",
              isActive(item.url)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground active:bg-muted"
            )}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-[10px] font-heading leading-tight">{item.title}</span>
            {item.url === "/dashboard/approvals" && profile.pendingApprovalsCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute top-1 right-1 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center"
              >
                {profile.pendingApprovalsCount}
              </Badge>
            )}
            {item.url === "/dashboard/chat" && profile.unreadChatCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute top-1 right-1 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center"
              >
                {profile.unreadChatCount}
              </Badge>
            )}
          </button>
        ))}

        {overflow.length > 0 && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 rounded-xl transition-colors min-h-[60px]",
                  "text-muted-foreground active:bg-muted"
                )}
              >
                <Menu className="h-6 w-6" />
                <span className="text-[10px] font-heading leading-tight">עוד</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-8">
              <div className="grid grid-cols-3 gap-3 pt-4">
                {overflow.map((item) => (
                  <button
                    key={item.url}
                    onClick={() => {
                      navigate(item.url);
                      setSheetOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-2xl transition-colors relative",
                      isActive(item.url)
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/50 text-foreground active:bg-muted"
                    )}
                  >
                    <item.icon className="h-7 w-7" />
                    <span className="text-xs font-heading">{item.title}</span>
                    {item.url === "/dashboard/approvals" && profile.pendingApprovalsCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute top-2 right-2 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center"
                      >
                        {profile.pendingApprovalsCount}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
