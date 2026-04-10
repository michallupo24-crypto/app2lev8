import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { Outlet } from "react-router-dom";
import { Bell, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const DashboardLayout = () => {
  const { profile, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <img
              src="/logo.png"
              alt="App2Class"
              className="absolute inset-0 m-auto h-8 w-8 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-3 w-20 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background" dir="rtl">
        <div className="flex-1 flex flex-col min-w-0">

          {/* Top Bar */}
          <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="App2Class"
                className="h-8 w-8 object-contain cursor-pointer"
                onClick={() => navigate("/dashboard")}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="font-heading font-bold text-lg hidden sm:block cursor-pointer" onClick={() => navigate("/dashboard")}>
                App2Class
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Unread chat */}
              {profile.unreadChatCount > 0 && (
                <Button variant="ghost" size="icon" className="relative h-9 w-9"
                  onClick={() => navigate("/dashboard/chat")}>
                  <MessageCircle className="h-4 w-4" />
                  <Badge variant="destructive"
                    className="absolute -top-0.5 -left-0.5 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center">
                    {profile.unreadChatCount > 9 ? "9+" : profile.unreadChatCount}
                  </Badge>
                </Button>
              )}

              {/* Pending approvals */}
              {profile.pendingApprovalsCount > 0 && (
                <Button variant="ghost" size="icon" className="relative h-9 w-9"
                  onClick={() => navigate("/dashboard/approvals")}>
                  <Bell className="h-4 w-4" />
                  <Badge variant="destructive"
                    className="absolute -top-0.5 -left-0.5 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center">
                    {profile.pendingApprovalsCount > 9 ? "9+" : profile.pendingApprovalsCount}
                  </Badge>
                </Button>
              )}

              {/* Dark mode toggle */}
              <ThemeToggle />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8 overflow-auto">
            <ErrorBoundary>
              <Outlet context={{ profile, refresh }} />
            </ErrorBoundary>
          </main>
        </div>

        {/* Sidebar */}
        <div className="hidden md:flex flex-col border-r border-border/50">
          <div className="h-14 flex items-center justify-center border-b border-border/50 bg-background/95 backdrop-blur-sm">
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
