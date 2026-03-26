import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { Outlet } from "react-router-dom";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const DashboardLayout = () => {
  const { profile, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-body">טוען...</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-background via-muted/30 to-background" dir="rtl">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="App2Class" className="h-8 w-8 object-contain" />
              <span className="font-heading font-bold text-lg hidden sm:block">App2Class</span>
            </div>
            <div className="flex items-center gap-2">
              {profile.pendingApprovalsCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => navigate("/dashboard/approvals")}
                >
                  <Bell className="h-5 w-5" />
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -left-1 text-[10px] px-1.5 py-0 h-5 min-w-5 flex items-center justify-center"
                  >
                    {profile.pendingApprovalsCount}
                  </Badge>
                </Button>
              )}
            </div>
          </header>

          {/* Main Content - extra bottom padding on mobile for bottom nav */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
            <Outlet context={{ profile, refresh }} />
          </main>
        </div>

        {/* Sidebar - right side, hidden on mobile */}
        <div className="hidden md:flex flex-col border-r border-border/50">
          <div className="h-14 flex items-center justify-center border-b border-border/50 bg-background/80 backdrop-blur-sm">
            <SidebarTrigger />
          </div>
          <AppSidebar profile={profile} onLogout={logout} />
        </div>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav profile={profile} />
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
