import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  UserCheck, 
  Users, 
  Search, 
  Filter, 
  ChevronDown, 
  MoreVertical,
  ThumbsUp,
  AlertCircle,
  Loader2,
  Trash2,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/hooks/useAuth";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

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

interface ApprovalItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  notes: string | null;
  requiredRole: string;
  status: string;
  createdAt: string;
  avatar: AvatarConfig | null;
  userRoles: string[];
}

const ApprovalsPage = () => {
  const { profile, refresh } = useOutletContext<{ profile: UserProfile; refresh: () => void }>();
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    loadApprovals();
  }, [filter]);

  const loadApprovals = async () => {
    setLoading(true);
    let query = supabase
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    if (!data) {
      setApprovals([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data.map((a: any) => a.user_id))];
    if (userIds.length === 0) {
      setApprovals([]);
      setLoading(false);
      return;
    }

    const [profilesRes, avatarsRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", userIds),
      supabase.from("avatars").select("*").in("user_id", userIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);

    const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
    const avatarsMap = new Map((avatarsRes.data || []).map((a: any) => [a.user_id, a]));
    const rolesMap = new Map<string, string[]>();
    (rolesRes.data || []).forEach((r: any) => {
      const existing = rolesMap.get(r.user_id) || [];
      existing.push(r.role);
      rolesMap.set(r.user_id, existing);
    });

    const items: ApprovalItem[] = data.map((a: any) => {
      const p = profilesMap.get(a.user_id);
      const av = avatarsMap.get(a.user_id);
      return {
        id: a.id,
        userId: a.user_id,
        userName: p?.full_name || "לא ידוע",
        userEmail: p?.email || "",
        notes: a.notes,
        requiredRole: a.required_role,
        status: a.status,
        createdAt: a.created_at,
        avatar: av ? {
          faceShape: av.face_shape, skinColor: av.skin_color, eyeShape: av.eye_shape,
          eyeColor: av.eye_color, hairStyle: av.hair_style, hairColor: av.hair_color,
          facialHair: av.facial_hair || "none", outfit: av.outfit, outfitColor: av.outfit_color,
          accessory: av.accessory || "none", expression: av.expression, background: av.background,
        } : null,
        userRoles: rolesMap.get(a.user_id) || [],
      };
    });

    setApprovals(items);
    setLoading(false);
  };

  const handleApproval = async (approval: ApprovalItem, approved: boolean) => {
    setProcessingId(approval.id);
    try {
      const { error: updateError } = await supabase.from("approvals").update({
        status: approved ? "approved" : "rejected",
        approver_id: profile.id,
      }).eq("id", approval.id);

      if (updateError) throw updateError;

      if (approved) {
        const { error: profileError } = await supabase.from("profiles").update({ is_approved: true }).eq("id", approval.userId);
        if (profileError) throw profileError;
      }

      toast({
        title: approved ? "אושר בהצלחה!" : "הבקשה נדחתה",
        description: `${approval.userName} עודכן במערכת.`,
      });

      setApprovals(current => current.filter(a => a.id !== approval.id || filter === "all"));
      refresh();
    } catch (e: any) {
      toast({ title: "שגיאה בביצוע הפעולה", description: e.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const approveAllVisible = async () => {
    const pendingVisible = filteredApprovals.filter(a => a.status === "pending");
    if (pendingVisible.length === 0) return;

    setLoading(true);
    try {
      const ids = pendingVisible.map(a => a.id);
      const userIds = pendingVisible.map(a => a.userId);

      const { error: updateError } = await supabase.from("approvals").update({
        status: "approved",
        approver_id: profile.id,
      }).in("id", ids);

      if (updateError) throw updateError;

      const { error: profileError } = await supabase.from("profiles").update({ is_approved: true }).in("id", userIds);
      if (profileError) throw profileError;

      toast({ title: `אושרו ${ids.length} בקשות בבת אחת! ⚡` });
      loadApprovals();
      refresh();
    } catch (e: any) {
      toast({ title: "שגיאה באישור גורף", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredApprovals = approvals.filter(a => {
    const matchesSearch = a.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          a.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (a.notes || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || a.userRoles.includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="p-4 md:p-8 space-y-8 dir-rtl text-right">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div variants={item}>
          <h1 className="text-4xl font-heading font-black text-primary flex items-center gap-4 tracking-tighter">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center rotate-3 shadow-inner">
               <UserCheck className="h-7 w-7 text-primary" />
            </div>
            ניהול אישורי הצטרפות
          </h1>
          <p className="text-slate-500 font-medium mt-2 flex items-center gap-2">
            <Users className="h-4 w-4" /> ניהול בקשות רישום של מורים, הורים ותלמידים
          </p>
        </motion.div>

        {filter === "pending" && filteredApprovals.length > 1 && (
          <motion.div variants={item}>
            <Button 
              onClick={approveAllVisible} 
              className="rounded-xl h-12 px-8 shadow-lg shadow-success/20 bg-success hover:bg-success/90 gap-2 font-bold"
            >
              <ThumbsUp className="h-4 w-4" /> אשר את כל המופיעים ({filteredApprovals.length})
            </Button>
          </motion.div>
        )}
      </div>

      {/* Control Bar */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-4 relative group">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="חפש לפי שם, אימייל או הערות..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 rounded-xl pr-10 bg-white/60 backdrop-blur-sm border-slate-200 focus:ring-primary/20 transition-all shadow-sm"
          />
        </div>

        <div className="md:col-span-8 flex flex-wrap items-center gap-3">
           <div className="flex bg-slate-100/80 p-1 rounded-xl ring-1 ring-slate-200 backdrop-blur-sm space-x-reverse space-x-1">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className={`rounded-lg h-9 px-4 font-heading transition-all ${filter === f ? "shadow-md" : "text-slate-600 hover:bg-white/50"}`}
                >
                  {f === "pending" && "⏳ ממתינים"}
                  {f === "approved" && "✅ אושרו"}
                  {f === "rejected" && "❌ נדחו"}
                  {f === "all" && "📋 הכל"}
                </Button>
              ))}
           </div>

           <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mr-2">סינון לפי תפקיד:</span>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40 h-10 rounded-xl bg-white/60 backdrop-blur-sm border-slate-200">
                  <SelectValue placeholder="כל התפקידים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל התפקידים</SelectItem>
                  {Object.entries(ROLE_LABELS).map(([key, value]) => (
                    <SelectItem key={key} value={key}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
           </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
             <Loader2 className="h-12 w-12 text-primary/40 animate-spin mb-4" />
             <p className="text-slate-400 font-medium">מעדכן נתונים...</p>
          </div>
        ) : filteredApprovals.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="border-none shadow-xl bg-slate-50/50 p-20 text-center">
               <div className="h-20 w-20 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto mb-6 opacity-40">
                  <Search className="h-10 w-10 text-slate-400" />
               </div>
               <h3 className="text-xl font-heading font-black text-slate-500">לא נמצאו בקשות שתואמות את החיפוש</h3>
               <p className="text-sm text-slate-400 mt-2">נסה לשנות את הסינון או את מילות החיפוש</p>
               <Button variant="link" onClick={() => { setSearchQuery(""); setFilter("pending"); setRoleFilter("all"); }} className="mt-4 text-primary font-bold">
                  נקה את כל המסננים
               </Button>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-4">
             <AnimatePresence mode="popLayout">
                {filteredApprovals.map((approval) => (
                  <motion.div 
                    key={approval.id} 
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    <Card className={`group border-none shadow-md hover:shadow-xl transition-all duration-300 relative overflow-hidden ring-1 ${
                      approval.status === 'pending' ? 'ring-primary/10 bg-white/70' : 
                      approval.status === 'approved' ? 'ring-success/10 bg-success/5' : 'ring-destructive/10 bg-destructive/5'
                    }`}>
                      <CardContent className="p-0">
                         <div className="flex flex-col md:flex-row items-stretch">
                            {/* Visual Indicator Line */}
                            <div className={`w-1 md:w-1.5 shrink-0 ${
                              approval.status === 'pending' ? 'bg-primary' : 
                              approval.status === 'approved' ? 'bg-success' : 'bg-destructive'
                            }`} />

                            <div className="flex-1 flex flex-col md:flex-row items-center gap-6 p-5 py-4">
                               {/* Avatar Section */}
                               <div className="shrink-0 relative">
                                  {approval.avatar ? (
                                    <AvatarPreview config={approval.avatar} size={64} />
                                  ) : (
                                    <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl shadow-inner">
                                      👤
                                    </div>
                                  )}
                                  <div className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-lg border-2 border-white flex items-center justify-center shadow-sm ${
                                    approval.status === 'pending' ? 'bg-orange-500' : 
                                    approval.status === 'approved' ? 'bg-success' : 'bg-destructive'
                                  }`}>
                                     {approval.status === 'pending' ? <Clock className="h-2.5 w-2.5 text-white" /> : <ThumbsUp className="h-2.5 w-2.5 text-white" />}
                                  </div>
                               </div>

                               {/* User Details */}
                               <div className="flex-1 min-w-0 text-center md:text-right space-y-1">
                                  <div className="flex items-center justify-center md:justify-start gap-2">
                                     <h3 className="text-lg font-heading font-black tracking-tight text-slate-800">{approval.userName}</h3>
                                     <Badge variant="outline" className="text-[9px] font-black rounded-lg h-5 border-slate-200 text-slate-400">
                                        {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true, locale: he })}
                                     </Badge>
                                  </div>
                                  <p className="text-xs text-slate-500 font-medium flex items-center justify-center md:justify-start gap-2">
                                    <span className="opacity-60">{approval.userEmail}</span>
                                    {approval.userRoles.map((r) => (
                                      <span key={r} className="bg-primary/5 text-primary text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                        {ROLE_LABELS[r] || r}
                                      </span>
                                    ))}
                                  </p>
                                  {approval.notes && (
                                    <div className="mt-2 text-xs text-slate-400 bg-slate-50 p-2 rounded-xl inline-block text-right">
                                       <span className="font-bold text-[9px] text-primary block mb-0.5 opacity-60">הערה מהרישום:</span>
                                       {approval.notes}
                                    </div>
                                  )}
                               </div>

                               {/* Action Buttons */}
                               <div className="shrink-0 flex items-center gap-3">
                                  {approval.status === "pending" ? (
                                    <>
                                       <Button 
                                          size="sm" 
                                          onClick={() => handleApproval(approval, true)}
                                          disabled={processingId === approval.id}
                                          className="rounded-xl h-11 px-6 shadow-lg shadow-success/20 bg-success hover:bg-success/90 font-bold gap-2 group/btn"
                                       >
                                          {processingId === approval.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 transition-transform group-hover/btn:scale-110" />}
                                          אשר משתמש
                                       </Button>
                                       <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          onClick={() => handleApproval(approval, false)}
                                          disabled={processingId === approval.id}
                                          className="rounded-xl h-11 px-4 text-destructive hover:bg-destructive/10 font-bold gap-2"
                                       >
                                          <XCircle className="h-4 w-4" />
                                          דחה
                                       </Button>
                                    </>
                                  ) : (
                                    <div className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-sm ${
                                      approval.status === 'approved' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                                    }`}>
                                       {approval.status === 'approved' ? (
                                          <><CheckCircle2 className="h-5 w-5" /> אושר במערכת</>
                                       ) : (
                                          <><XCircle className="h-5 w-5" /> נדחה</>
                                       )}
                                    </div>
                                  )}
                               </div>
                            </div>
                         </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
             </AnimatePresence>
          </div>
        )}
      </div>

      <Card className="bg-primary/5 border-primary/20 overflow-hidden relative">
         <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Info className="h-24 w-24" />
         </div>
         <CardContent className="p-4 flex items-start gap-4">
            <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
               <Info className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="font-heading font-bold text-primary">טיפ לעבודה מהירה ⚡</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                באפשרותך לאשר קבוצות משתמשים בבת אחת על ידי שימוש בסינונים (למשל: בחר בתפקיד "הורה") ולאחר מכן לחיצה על "אשר את כל המופיעים". פעולה זו מומלצת במיוחד בתחילת שנת לימודים כאשר יש עומס רישום.
              </p>
            </div>
         </CardContent>
      </Card>
    </motion.div>
  );
};

export default ApprovalsPage;
