import { useState, useEffect } from "react";
import {
    Bell, Check, Trash2, Star, MessageSquare, AlertCircle,
    ChevronRight, ExternalLink, Loader2
} from "lucide-react";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Notification {
    id: string;
    user_id: string;
    title: string;
    content: string;
    type: 'grade' | 'message' | 'alert' | 'system';
    is_read: boolean;
    link: string | null;
    created_at: string;
}

const NotificationCenter = ({ userId }: { userId: string }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { toast } = useToast();

    const loadNotifications = async () => {
        const { data } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50);
        setNotifications(data || []);
        setLoading(false);
    };

    useEffect(() => {
        loadNotifications();

        // האזנה להתראות חדשות בזמן אמת
        const channel = supabase
            .channel("new-notifications")
            .on("postgres_changes", {
                event: "INSERT", schema: "public", table: "notifications",
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                setNotifications(prev => [payload.new as Notification, ...prev]);
                toast({ title: payload.new.title, description: payload.new.content });
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    const markAsRead = async (id: string) => {
        await supabase.from("notifications").update({ is_read: true }).eq("id", id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const markAllAsRead = async () => {
        await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await supabase.from("notifications").delete().eq("id", id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleNotificationClick = (n: Notification) => {
        markAsRead(n.id);
        if (n.link) navigate(n.link);
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const typeIcon = (type: string) => {
        switch (type) {
            case 'grade': return <Star className="h-4 w-4 text-yellow-500" />;
            case 'message': return <MessageSquare className="h-4 w-4 text-blue-500" />;
            case 'alert': return <AlertCircle className="h-4 w-4 text-destructive" />;
            default: return <Bell className="h-4 w-4 text-primary" />;
        }
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full hover:bg-muted">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-1 -left-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] animate-pulse">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[380px] sm:w-[420px] pr-0">
                <SheetHeader className="px-6 mb-4">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-xl font-heading font-bold">התראות</SheetTitle>
                        {unreadCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3" />סמן הכל כנקרא
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-120px)] px-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                            <Bell className="h-12 w-12 opacity-10 mb-4" />
                            <p className="font-heading font-medium">אין התראות חדשות</p>
                            <p className="text-xs opacity-60">הפעילות שלך תופיע כאן</p>
                        </div>
                    ) : (
                        <div className="space-y-2 p-4">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => handleNotificationClick(n)}
                                    className={`group relative p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md
                    ${n.is_read ? "bg-card border-border/40 opacity-70" : "bg-primary/5 border-primary/20 shadow-sm"}`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`mt-1 p-2 rounded-lg ${n.is_read ? "bg-muted" : "bg-white shadow-sm"}`}>
                                            {typeIcon(n.type)}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className={`text-sm font-heading ${n.is_read ? "font-medium" : "font-bold text-primary"}`}>
                                                    {n.title}
                                                </p>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(n.created_at).toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                                {n.content}
                                            </p>
                                            {n.link && (
                                                <div className="flex items-center gap-1 pt-1 text-[10px] text-primary font-medium">
                                                    הקלק למעבר <ChevronRight className="h-3 w-3" />
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost" size="icon"
                                            className="absolute left-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => deleteNotification(n.id, e)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};

export default NotificationCenter;
