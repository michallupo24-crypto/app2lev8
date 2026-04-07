import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import {
  MessageCircle, Send, Search, Users, ArrowRight, Moon,
  AlertTriangle, BookOpen, UserPlus, Lock, Check, X, Plus,
  School, HeartHandshake, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";

/* ─── Types ───────────────────────────────────────────── */
type ConversationType = 
  | "direct" | "class" | "grade" | "subject" | "announcement" | "parent_teacher" | "counseling" | "parent_class" | "parent_grade"
  | "private" | "group" | "class_subject" | "class_homeroom" | "class_parent_group" | "grade_parent_group";

interface Conversation {
  id: string;
  title: string | null;
  type: ConversationType;
  class_id?: string | null;
  school_id?: string | null;
  subject?: string | null;
  grade?: string | null;
  classId?: string | null; // Support both naming styles found in DB vs Code
  schoolId?: string | null;
  is_accepted: boolean;
  created_by: string;
  updated_at: string;
  lastMessage?: { content: string; created_at: string; is_flagged: boolean };
  unreadCount: number;
  otherName: string;
  otherAvatar: AvatarConfig | null;
  otherRoleLabel: string;
  otherUserId: string | null;
  participantCount: number;
  participantPreview: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: AvatarConfig | null;
  content: string;
  created_at: string;
  is_flagged: boolean;
  flag_reason: string | null;
}

interface SearchUser {
  user_id: string;
  full_name: string;
  avatar: AvatarConfig | null;
  roleLabel: string;
}

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד/ה", parent: "הורה", educator: "מחנך/ת",
  professional_teacher: "מורה", subject_coordinator: "רכז/ת מקצוע",
  grade_coordinator: "רכז/ת שכבה", counselor: "יועץ/ת",
  management: "הנהלה", system_admin: "מנהל/ת מערכת",
};

/** Staff who can publish availability to students/parents */
const STAFF_PRESENCE_ROLES = new Set([
  "educator", "professional_teacher", "subject_coordinator",
  "grade_coordinator", "counselor", "management",
]);

const PRESENCE_LABELS: Record<string, string> = {
  available: "פנוי/ה לשיחה",
  in_lesson: "בשיעור",
  resting: "במנוחה",
};

const CHANNEL_SECTIONS: { types: ConversationType[]; title: string }[] = [
  { types: ["class_parent_group", "grade_parent_group"], title: "קהילת הורים" },
  { types: ["counseling"], title: "מרחב ייעוץ" },
  { types: ["parent_teacher"], title: "הורה–מורה" },
  { types: ["class_subject"], title: "מקצועות" },
  { types: ["class_homeroom"], title: "חדר הכיתה" },
  { types: ["group"], title: "קבוצות" },
  { types: ["private"], title: "אישי" },
];

const FACE_TO_BODY: Record<string, string> = {
  round: "basic", oval: "basic", square: "wider", long: "taller",
  basic: "basic", wider: "wider", taller: "taller",
};

function avatarFromRow(av: any): AvatarConfig | null {
  if (!av) return null;
  return {
    body_type: FACE_TO_BODY[av.face_shape] || "basic",
    eye_color: av.eye_color || "brown",
    skin: av.skin_color || "#FDDBB4",
    hair_style: av.hair_style || "boy",
    hair_color: av.hair_color || "#2C1A0E",
  };
}

/** Supabase may return avatars as one row or an array */
function firstAvatarFromProfile(avatars: unknown): any {
  if (!avatars) return null;
  if (Array.isArray(avatars)) return avatars[0] ?? null;
  return avatars;
}

/** avatars.user_id → auth.users; אין FK ל-profiles — לא משתמשים ב-embed של PostgREST */
async function fetchAvatarsByUserIds(userIds: string[]) {
  const map = new Map<string, Record<string, unknown>>();
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (!uniq.length) return map;
  const { data, error } = await supabase
    .from("avatars")
    .select("user_id, face_shape, eye_color, skin_color, hair_style, hair_color")
    .in("user_id", uniq);
  if (error) {
    console.error("avatars (batch):", error);
    return map;
  }
  for (const row of data || []) map.set(row.user_id as string, row as Record<string, unknown>);
  return map;
}

/* ─── Component ───────────────────────────────────────── */
const ChatPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const location = useLocation();
  const navState = location.state as { targetUserId?: string; initialType?: ConversationType } | null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [quietHours, setQuietHours] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchUsers, setSearchUsers] = useState<SearchUser[]>([]);
  const [listFilter, setListFilter] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [myPresence, setMyPresence] = useState<string>("available");
  const [peerPresence, setPeerPresence] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<any>(null);

  const canSetPresence = profile.roles.some((r) => STAFF_PRESENCE_ROLES.has(r));

  /* ── Quiet hours ─────────────────────────────────────── */
  useEffect(() => {
    if (!profile.schoolId) return;
    const check = async () => {
      const { data } = await supabase
        .from("chat_settings").select("*")
        .eq("school_id", profile.schoolId!).single();
      if (!data?.quiet_hours_enabled) return;
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const s = data.quiet_hours_start || "22:00";
      const e = data.quiet_hours_end || "07:00";
      setQuietHours(s > e ? (t >= s || t < e) : (t >= s && t < e));
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [profile.schoolId]);

  /* ── Staff: own chat presence ───────────────────────── */
  useEffect(() => {
    if (!canSetPresence) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("chat_presence").eq("id", profile.id).maybeSingle();
      if (data?.chat_presence) setMyPresence(data.chat_presence);
    })();
  }, [canSetPresence, profile.id]);

  const updateMyPresence = async (value: string) => {
    setMyPresence(value);
    const { error } = await supabase.from("profiles").update({ chat_presence: value }).eq("id", profile.id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "עודכן", description: "מצב הנראות שלך בשיחות עודכן" });
  };

  /* ── Load conversations (batched, no N+1) ───────────── */
  const loadConversations = useCallback(async () => {
    setLoadingConvos(true);

    // 1. Get all conversation IDs I'm in
    const { data: myParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", profile.id);

    if (!myParts?.length) { setConversations([]); setLoadingConvos(false); return; }

    const convoIds = myParts.map((p: any) => p.conversation_id);
    const lastReadMap = new Map<string, string>(
      myParts.map((p: any) => [p.conversation_id, p.last_read_at])
    );

    // 2. Fetch conversations + messages + participant rows (ללא embed — אין FK מ-user_id ל-profiles ב-PostgREST)
    const [convosRes, lastMsgsRes, participantsRawRes, unreadRes] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convoIds).order("updated_at", { ascending: false }),
      supabase.from("messages").select("conversation_id, content, created_at, is_flagged")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
        .limit(convoIds.length * 3),
      supabase.from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", convoIds),
      supabase.from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", convoIds),
    ]);

    const convos = convosRes.data || [];
    const allMsgs = lastMsgsRes.data || [];
    const allMsgTimes = unreadRes.data || [];

    if (participantsRawRes.error) {
      console.error("conversation_participants:", participantsRawRes.error);
      toast({
        title: "שגיאה בטעינת השיחות",
        description: participantsRawRes.error.message,
        variant: "destructive",
      });
      setConversations([]);
      setLoadingConvos(false);
      return;
    }

    const participantsRaw = participantsRawRes.data || [];
    const participantUserIds = [...new Set(participantsRaw.map((p: { user_id: string }) => p.user_id))];

    const profileMap = new Map<string, { full_name: string | null; avatars: unknown }>();
    const rolesByUser = new Map<string, { role: string }[]>();

    if (participantUserIds.length > 0) {
      const [profRes, rolesRes, avatarMap] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", participantUserIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", participantUserIds),
        fetchAvatarsByUserIds(participantUserIds),
      ]);
      if (profRes.error) console.error("profiles (chat participants):", profRes.error);
      if (rolesRes.error) console.error("user_roles (chat participants):", rolesRes.error);
      for (const p of profRes.data || []) {
        profileMap.set(p.id, {
          full_name: p.full_name,
          avatars: avatarMap.get(p.id) ?? null,
        });
      }
      for (const r of rolesRes.data || []) {
        const list = rolesByUser.get(r.user_id) || [];
        list.push({ role: r.role as string });
        rolesByUser.set(r.user_id, list);
      }
    }

    const allParts = participantsRaw.map((row: { conversation_id: string; user_id: string }) => ({
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      profiles: profileMap.get(row.user_id) ?? null,
      user_roles: rolesByUser.get(row.user_id) || [],
    }));

    // Build last message map
    const lastMsgMap = new Map<string, typeof allMsgs[0]>();
    for (const msg of allMsgs) {
      if (!lastMsgMap.has(msg.conversation_id)) lastMsgMap.set(msg.conversation_id, msg);
    }

    // Build unread count map
    const unreadMap = new Map<string, number>();
    for (const msg of allMsgTimes) {
      const lastRead = lastReadMap.get(msg.conversation_id);
      if (lastRead && msg.created_at > lastRead) {
        unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
      }
    }

    // Build participants map
    const partsByConvo = new Map<string, any[]>();
    for (const p of allParts) {
      const list = partsByConvo.get(p.conversation_id) || [];
      list.push(p);
      partsByConvo.set(p.conversation_id, list);
    }

    // Assemble conversations
    const enriched: Conversation[] = convos.map((c: any) => {
      const parts = partsByConvo.get(c.id) || [];
      const otherParts = parts.filter((p: any) => p.user_id !== profile.id);
      const other = otherParts[0];
      const roles = (other?.user_roles || []).map((r: any) => r.role);
      const roleLabel = roles.map((r: string) => ROLE_LABELS[r] || r).join(", ");
      const lastName = otherParts.map((p: any) => (p.profiles as any)?.full_name || "").filter(Boolean).join(", ");
      const otherUserId = c.type === "private" && other ? (other.user_id as string) : null;

      const participantNames = parts
        .map((p: any) => (p.profiles as any)?.full_name)
        .filter(Boolean) as string[];
      const participantPreview =
        participantNames.length > 0
          ? participantNames.slice(0, 8).join(" · ") +
            (participantNames.length > 8 ? ` · +${participantNames.length - 8}` : "")
          : "";

      const privateTitle = lastName || c.title || "שיחה";
      const groupTitle = c.title || lastName || "קבוצה";

      return {
        id: c.id,
        title: c.title,
        type: c.type as ConversationType,
        subject: c.subject,
        grade: c.grade,
        is_accepted: c.is_accepted,
        created_by: c.created_by,
        updated_at: c.updated_at,
        lastMessage: lastMsgMap.get(c.id)
          ? { content: lastMsgMap.get(c.id)!.content, created_at: lastMsgMap.get(c.id)!.created_at, is_flagged: lastMsgMap.get(c.id)!.is_flagged }
          : undefined,
        unreadCount: unreadMap.get(c.id) || 0,
        otherName: c.type === "private" ? privateTitle : groupTitle,
        otherAvatar: c.type === "private" ? avatarFromRow(firstAvatarFromProfile((other?.profiles as any)?.avatars)) : null,
        otherRoleLabel: roleLabel,
        otherUserId,
        participantCount: parts.length,
        participantPreview,
      };
    });

    setConversations(enriched);
    setLoadingConvos(false);
  }, [profile.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const selectedPrivatePeerId = useMemo(() => {
    const c = conversations.find((x) => x.id === selectedId);
    return c?.type === "private" ? c.otherUserId : null;
  }, [conversations, selectedId]);

  /* ── נראות הצד השני בצ'אט פרטי (עמודה אופציונלית ב-DB) ─ */
  useEffect(() => {
    if (!selectedPrivatePeerId) {
      setPeerPresence(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("chat_presence")
        .eq("id", selectedPrivatePeerId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.chat_presence) setPeerPresence(null);
      else setPeerPresence(data.chat_presence);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPrivatePeerId]);

  /* ── Load messages for selected conversation ──────────── */
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    setMessages([]);

    const load = async () => {
      const { data: msgRows, error: msgErr } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at, is_flagged, flag_reason")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (msgErr) {
        toast({ title: "שגיאה בטעינת הודעות", description: msgErr.message, variant: "destructive" });
        setMessages([]);
        setLoadingMsgs(false);
        return;
      }

      const senderIds = [...new Set((msgRows || []).map((m) => m.sender_id))];
      const profById = new Map<string, { full_name: string | null; avatars: unknown }>();
      if (senderIds.length > 0) {
        const [profRes, avatarMap] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", senderIds),
          fetchAvatarsByUserIds(senderIds),
        ]);
        if (profRes.error) console.error("profiles (messages):", profRes.error);
        for (const p of profRes.data || []) {
          profById.set(p.id, {
            full_name: p.full_name,
            avatars: avatarMap.get(p.id) ?? null,
          });
        }
      }

      setMessages(
        (msgRows || []).map((m) => {
          const pr = profById.get(m.sender_id);
          const avRow = firstAvatarFromProfile(pr?.avatars);
          return {
            id: m.id,
            sender_id: m.sender_id,
            sender_name: (pr?.full_name && pr.full_name.trim()) || "משתמש",
            sender_avatar: avatarFromRow(avRow),
            content: m.content,
            created_at: m.created_at,
            is_flagged: m.is_flagged,
            flag_reason: m.flag_reason,
          };
        }),
      );
      setLoadingMsgs(false);

      // Mark as read
      await supabase.from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", selectedId)
        .eq("user_id", profile.id);

      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unreadCount: 0 } : c));
    };
    load();

    // Realtime subscription
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    const channel = supabase
      .channel(`chat-${selectedId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, async (payload) => {
        const m = payload.new as any;
        // Fetch sender info
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", m.sender_id)
          .maybeSingle();
        const avMap = await fetchAvatarsByUserIds([m.sender_id]);
        const avRow = avMap.get(m.sender_id);
        const newMsg: Message = {
          id: m.id,
          sender_id: m.sender_id,
          sender_name: ((prof as any)?.full_name && String((prof as any).full_name).trim()) || "משתמש",
          sender_avatar: avatarFromRow(avRow ?? null),
          content: m.content,
          created_at: m.created_at,
          is_flagged: m.is_flagged,
          flag_reason: m.flag_reason,
        };
        setMessages(prev => [...prev, newMsg]);
        // Update last message in list
        setConversations(prev => prev.map(c =>
          c.id === selectedId
            ? { ...c, lastMessage: { content: m.content, created_at: m.created_at, is_flagged: m.is_flagged }, updated_at: m.created_at }
            : c
        ));
        await supabase.from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", selectedId).eq("user_id", profile.id);
      })
      .subscribe();
    realtimeRef.current = channel;

    return () => { if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); };
  }, [selectedId, profile.id]);

  // Handle deep linking from Dashboard
  useEffect(() => {
    if (conversations.length === 0 || !navState) return;

    const { targetUserId, initialType } = navState;

    if (targetUserId) {
      const existing = conversations.find(c => c.otherUserId === targetUserId);
      if (existing) {
        selectConvo(existing.id);
        (window as any).history?.replaceState({}, "");
      } else {
        const u: SearchUser = { user_id: targetUserId, full_name: "צוות חינוכי", avatar: null, roleLabel: "" };
        startDM(u);
        (window as any).history?.replaceState({}, "");
      }
    } else if (initialType) {
      const groupToken = initialType === 'parent_class' ? 'הורי כיתה' : 'הורי שכבה';
      const existingGroup = conversations.find(c => c.title?.includes(groupToken) || c.type === initialType);
      if (existingGroup) {
        selectConvo(existingGroup.id);
        (window as any).history?.replaceState({}, "");
      }
    }
  }, [conversations, navState]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Search users for new DM ─────────────────────────── */
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchUsers([]); return; }
    const timer = setTimeout(async () => {
      const term = searchQuery.trim();
      let q = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_approved", true)
        .neq("id", profile.id)
        .ilike("full_name", `%${term}%`);
      if (profile.schoolId) q = q.eq("school_id", profile.schoolId);
      const { data: profs, error } = await q.limit(25);
      if (error) {
        console.error("chat search profiles:", error);
        toast({ title: "חיפוש", description: error.message, variant: "destructive" });
        setSearchUsers([]);
        return;
      }
      if (!profs?.length) {
        setSearchUsers([]);
        return;
      }
      const searchIds = profs.map((p) => p.id);
      const [{ data: roleRows }, avatarMap] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", searchIds),
        fetchAvatarsByUserIds(searchIds),
      ]);
      const roleLabelByUser = new Map<string, string>();
      for (const row of roleRows || []) {
        const label = ROLE_LABELS[row.role as string] || row.role;
        roleLabelByUser.set(row.user_id, [roleLabelByUser.get(row.user_id), label].filter(Boolean).join(", "));
      }
      setSearchUsers(
        profs.map((u: { id: string; full_name: string }) => ({
          user_id: u.id,
          full_name: u.full_name,
          avatar: avatarFromRow(avatarMap.get(u.id) ?? null),
          roleLabel: roleLabelByUser.get(u.id) || "",
        })),
      );
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, profile.id, profile.schoolId]);

  /* ── Start / find DM ─────────────────────────────────── */
  const startDM = async (user: SearchUser) => {
    // Find existing
    const existing = conversations.find(
      (c) => c.type === "private" && c.otherUserId === user.user_id,
    );
    if (existing) {
      selectConvo(existing.id);
      setShowNewChat(false);
      return;
    }

    // Check DB
    const { data: myParts } = await supabase
      .from("conversation_participants").select("conversation_id").eq("user_id", profile.id);
    if (myParts?.length) {
      const myIds = myParts.map((p: any) => p.conversation_id);
      const { data: shared } = await supabase
        .from("conversation_participants").select("conversation_id")
        .eq("user_id", user.user_id).in("conversation_id", myIds);
      if (shared?.length) {
        const { data: priv } = await supabase
          .from("conversations").select("id").eq("id", shared[0].conversation_id).eq("type", "private").single();
        if (priv) {
          await loadConversations();
          selectConvo(priv.id);
          setShowNewChat(false);
          return;
        }
      }
    }

    // Create new
    const sharesGroup = conversations.some(c =>
      c.type !== "private" && c.otherName.includes(user.full_name)
    );
    let schoolId = profile.schoolId;
    if (!schoolId) {
      const { data: s } = await supabase.from("schools").select("id").limit(1).single();
      schoolId = s?.id;
    }
    if (!schoolId) return;

    const { data: convo } = await supabase.from("conversations")
      .insert({ school_id: schoolId, type: "private", created_by: profile.id, is_accepted: sharesGroup })
      .select("id").single();
    if (!convo) return;

    await supabase.from("conversation_participants").insert([
      { conversation_id: convo.id, user_id: profile.id },
      { conversation_id: convo.id, user_id: user.user_id },
    ]);

    await loadConversations();
    selectConvo(convo.id);
    setShowNewChat(false);
    if (!sharesGroup) toast({ title: "📩 בקשת הודעה", description: "ניתן לשלוח הודעה אחת עד שיקבלו" });
  };

  /* ── Send message ─────────────────────────────────────── */
  const sendMessage = async () => {
    if (!input.trim() || !selectedId || sending) return;

    const convo = conversations.find(c => c.id === selectedId);
    // Block: creator of unaccepted request already sent 1 message
    if (convo && !convo.is_accepted && convo.created_by === profile.id) {
      const { count } = await supabase
        .from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", selectedId).eq("sender_id", profile.id);
      if ((count || 0) >= 1) {
        toast({ title: "⏳ ממתין לתגובה", description: "ניתן לשלוח הודעה אחת עד שיענו", variant: "destructive" });
        return;
      }
    }
    // Accept if receiver replies
    if (convo && !convo.is_accepted && convo.created_by !== profile.id) {
      await supabase.from("conversations").update({ is_accepted: true }).eq("id", selectedId);
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, is_accepted: true } : c));
    }

    if (quietHours) toast({ title: "🌙 שעות שקטות", description: "ההודעה תישלח אך ההתראות מושתקות" });

    setSending(true);
    const content = input.trim();
    setInput("");

    try {
      type ModResponse = {
        blocked?: boolean;
        block_reason?: string | null;
        flag?: boolean;
        flag_reason?: string | null;
        safe?: boolean;
        reason?: string | null;
      };

      const { data: modResult } = await supabase.functions.invoke("chat-moderate", {
        body: {
          message: content,
          sender_name: profile.fullName,
          sender_id: profile.id,
          conversation_id: selectedId,
        },
      });

      const mr = modResult as ModResponse | null;
      const blocked = mr?.blocked === true;
      const legacyUnsafe = Boolean(mr && mr.blocked !== true && mr.safe === false);
      const flagged = !blocked && (mr?.flag === true || legacyUnsafe);
      const flagReason = mr?.flag_reason || mr?.reason || null;

      if (blocked) {
        toast({
          title: "לא נשלחה",
          description:
            mr?.block_reason ||
            "ההודעה שכתבת לא עומדת בסטנדרט הקהילה שלנו. נסה/י לנסח מחדש בנימוס ובכבוד.",
          variant: "destructive",
        });
        setInput(content);
        return;
      }

      await supabase.from("messages").insert({
        conversation_id: selectedId,
        sender_id: profile.id,
        content,
        is_flagged: flagged,
        flag_reason: flagged ? flagReason : null,
      });

      await supabase.from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedId);

      if (flagged) {
        toast({
          title: "⚠️ הודעה נשלחה לבדיקה",
          description: flagReason || "התוכן סומן לצוות",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const selectConvo = (id: string) => {
    setSelectedId(id);
    setMobileShowChat(true);
    setShowNewChat(false);
  };

  const acceptRequest = async (convoId: string) => {
    await supabase.from("conversations").update({ is_accepted: true }).eq("id", convoId);
    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, is_accepted: true } : c));
    selectConvo(convoId);
    toast({ title: "✅ בקשה אושרה" });
  };

  /* ── Derived data ─────────────────────────────────────── */
  const requests = conversations.filter(c => !c.is_accepted && c.created_by !== profile.id);
  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const selectedConvo = conversations.find(c => c.id === selectedId);

  const filteredConversations = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = c.otherName.toLowerCase();
      const title = (c.title || "").toLowerCase();
      const sub = (c.subject || "").toLowerCase();
      const gr = (c.grade || "").toLowerCase();
      return name.includes(q) || title.includes(q) || sub.includes(q) || gr.includes(q);
    });
  }, [conversations, listFilter]);

  const groupedConversationSections = useMemo(() => {
    const knownTypes = new Set(CHANNEL_SECTIONS.flatMap((s) => s.types));
    const sections = CHANNEL_SECTIONS.map((sec) => ({
      title: sec.title,
      items: filteredConversations
        .filter((c) => sec.types.includes(c.type))
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
    })).filter((s) => s.items.length > 0);

    const other = filteredConversations.filter((c) => !knownTypes.has(c.type));
    if (other.length > 0) {
      sections.push({
        title: "אחר",
        items: other.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
      });
    }
    return sections;
  }, [filteredConversations]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const formatListTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return formatTime(iso);
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  };

  const typeIcon = (type: string) => {
    if (type === "group") return <Users className="h-4 w-4" />;
    if (type === "class_subject") return <BookOpen className="h-4 w-4" />;
    if (type === "class_homeroom") return <School className="h-4 w-4" />;
    if (type === "counseling") return <HeartHandshake className="h-4 w-4" />;
    if (type === "parent_teacher") return <UserRound className="h-4 w-4" />;
    if (type === "class_parent_group") return <Users className="h-4 w-4" />;
    if (type === "grade_parent_group") return <School className="h-4 w-4" />;
    return <MessageCircle className="h-4 w-4" />;
  };

  const typeColor = (type: string) => {
    if (type === "group") return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    if (type === "class_subject") return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
    if (type === "class_homeroom") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    if (type === "counseling") return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
    if (type === "parent_teacher") return "bg-amber-500/15 text-amber-800 dark:text-amber-400";
    if (type === "class_parent_group") return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400";
    if (type === "grade_parent_group") return "bg-blue-700/15 text-blue-800 dark:text-blue-300";
    return "bg-muted text-muted-foreground";
  };

  /* ── Render conversation row ──────────────────────────── */
  const ConvoRow = ({ c }: { c: Conversation }) => {
    const isSelected = selectedId === c.id;
    return (
      <button
        onClick={() => selectConvo(c.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-right border-b border-border/40 last:border-0
          ${isSelected ? "bg-primary/8 border-l-2 border-l-primary" : ""}`}
      >
        {/* Avatar / icon */}
        <div className="shrink-0 relative">
          {c.type === "private" && c.otherAvatar ? (
            <AvatarPreview config={c.otherAvatar} size={42} />
          ) : (
            <div className={`w-[42px] h-[42px] rounded-2xl flex items-center justify-center ${typeColor(c.type)}`}>
              {typeIcon(c.type)}
            </div>
          )}
          {c.unreadCount > 0 && (
            <span className="absolute -top-1 -left-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {c.unreadCount > 9 ? "9+" : c.unreadCount}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={`font-heading text-sm truncate ${c.unreadCount > 0 ? "font-bold" : "font-medium"}`}>
              {c.otherName}
            </p>
            {c.lastMessage && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatListTime(c.lastMessage.created_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!c.is_accepted && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
            <p className={`text-xs truncate ${c.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
              {c.lastMessage
                ? c.lastMessage.is_flagged ? "⚠️ " + c.lastMessage.content : c.lastMessage.content
                : c.otherRoleLabel || "אין הודעות"}
            </p>
          </div>
        </div>
      </button>
    );
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] flex flex-col">
      {/* Page header */}
      <div className="mb-3 shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {mobileShowChat && (
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-2xl font-heading font-bold">שיחות</h1>
            {totalUnread > 0 && <Badge variant="destructive" className="text-xs">{totalUnread}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSetPresence && (
              <Select value={myPresence} onValueChange={updateMyPresence}>
                <SelectTrigger className="h-8 w-[148px] text-xs">
                  <SelectValue placeholder="נראות" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{PRESENCE_LABELS.available}</SelectItem>
                  <SelectItem value="in_lesson">{PRESENCE_LABELS.in_lesson}</SelectItem>
                  <SelectItem value="resting">{PRESENCE_LABELS.resting}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {quietHours && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Moon className="h-3 w-3" />שעות שקטות
              </Badge>
            )}
          </div>
        </div>
        <details className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
          <summary className="cursor-pointer select-none font-medium text-foreground/85">
            מבנה מרחב השיחות
          </summary>
          <p className="mt-2 pe-2">
            השיחות מסודרות לפי הקשר פדגוגי: מקצועות, חדר כיתה, ייעוץ, ערוץ הורה–מורה ושיחות אישיות.
            צוות יכול לסמן נראות (בשיעור / במנוחה). תוכן פוגען נחסם לפני שליחה; מצוקה מזוהה בדיסקרטיות לצוות טיפולי.
            Live Engagement (אנונימי בסקרים), תזמון הודעות וגיימיפיקציית קהילה — בשלבי הרחבה.
          </p>
        </details>
      </div>

      <div className="flex flex-1 min-h-0 rounded-2xl border border-border overflow-hidden bg-card">

        {/* ── Left panel: conversation list ────────────────── */}
        <div className={`w-full md:w-80 lg:w-96 border-l border-border flex flex-col ${mobileShowChat ? "hidden md:flex" : "flex"}`}>

          {/* Search bar + new chat button */}
          <div className="p-3 border-b border-border flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  showNewChat ? "שם פרטי או משפחה באותו בית ספר..." : "חיפוש ברשימת השיחות..."
                }
                className="pr-9 h-9 text-sm bg-muted/40 border-0 focus-visible:ring-1"
                value={showNewChat ? searchQuery : listFilter}
                onChange={(e) => (showNewChat ? setSearchQuery(e.target.value) : setListFilter(e.target.value))}
              />
            </div>
            <Button
              size="icon"
              variant={showNewChat ? "secondary" : "ghost"}
              className="h-9 w-9 shrink-0"
              onClick={() => setShowNewChat((s) => !s)}
              title="שיחה חדשה"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* New chat search panel */}
          {showNewChat && (
            <div className="border-b border-border">
              <p className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground leading-snug">
                חיפוש לפי שם — משתמשים מאושרים באותו בית ספר. אם אין תוצאות, ייתכן שחברים עדיין לא אושרו או שאין להם שם מלא בפרופיל.
              </p>
              {searchUsers.length > 0 && (
                <div className="max-h-52 overflow-y-auto">
                  {searchUsers.map(u => (
                    <button key={u.user_id} onClick={() => startDM(u)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-right border-t border-border/30">
                      {u.avatar ? (
                        <AvatarPreview config={u.avatar} size={34} />
                      ) : (
                        <div className="w-[34px] h-[34px] rounded-xl bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {u.full_name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-heading text-sm font-medium">{u.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{u.roleLabel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.trim().length >= 1 && searchUsers.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-4 px-2">
                  לא נמצאו משתמשים לפי החיפוש
                </p>
              )}
            </div>
          )}

          {/* Message requests banner */}
          {requests.length > 0 && (
            <button
              className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-border hover:bg-primary/10 transition-colors w-full text-right"
              onClick={() => {
                const r = requests[0];
                selectConvo(r.id);
              }}
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm font-medium">בקשות הודעה</p>
                <p className="text-xs text-muted-foreground">{requests.length} בקשות ממתינות</p>
              </div>
              <Badge variant="default" className="text-[10px] shrink-0">{requests.length}</Badge>
            </button>
          )}

          {/* Conversations list */}
          <ScrollArea className="flex-1">
            {loadingConvos ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-2xl bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted rounded w-32" />
                      <div className="h-2.5 bg-muted rounded w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground/20 mb-3" />
                <p className="font-heading font-medium text-muted-foreground">אין שיחות עדיין</p>
                <p className="text-xs text-muted-foreground mt-1">לחץ + כדי להתחיל שיחה חדשה</p>
              </div>
            ) : groupedConversationSections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <Search className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">לא נמצאו שיחות לפי החיפוש</p>
              </div>
            ) : (
              groupedConversationSections.map((sec) => (
                <div key={sec.title}>
                  <div className="px-4 py-2 text-[10px] font-heading font-semibold uppercase tracking-wide text-muted-foreground bg-muted/25 border-b border-border/40">
                    {sec.title}
                  </div>
                  {sec.items.map((c) => (
                    <ConvoRow key={c.id} c={c} />
                  ))}
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* ── Right panel: messages ─────────────────────────── */}
        <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageCircle className="h-16 w-16 text-muted-foreground/15 mb-4" />
              <p className="font-heading font-medium text-muted-foreground">בחר שיחה כדי להתחיל</p>
              <p className="text-xs text-muted-foreground mt-1">או לחץ + לשיחה חדשה</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                {selectedConvo?.type === "private" && selectedConvo.otherAvatar ? (
                  <AvatarPreview config={selectedConvo.otherAvatar} size={36} />
                ) : (
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${typeColor(selectedConvo?.type || "private")}`}>
                    {typeIcon(selectedConvo?.type || "private")}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-semibold text-sm truncate">{selectedConvo?.otherName}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {selectedConvo?.type === "private" ? (
                      <>
                        {selectedConvo.otherRoleLabel || "שיחה פרטית"}
                        {peerPresence && (
                          <span>
                            {" · "}
                            {PRESENCE_LABELS[peerPresence] || peerPresence}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {(selectedConvo?.participantCount ?? 0) === 0
                          ? "טוען משתתפים…"
                          : `${selectedConvo?.participantCount} משתתפים`}
                        {selectedConvo?.participantPreview ? (
                          <span className="block mt-0.5 opacity-90">{selectedConvo.participantPreview}</span>
                        ) : null}
                      </>
                    )}
                    {!selectedConvo?.is_accepted && " • בקשת הודעה"}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {selectedConvo?.is_accepted ? "אין הודעות עדיין — שלח הודעה ראשונה!" : "שלח הודעה ראשונה..."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((msg, idx) => {
                      const isMe = msg.sender_id === profile.id;
                      const prevMsg = messages[idx - 1];
                      const isGroupChat = Boolean(selectedConvo && selectedConvo.type !== "private");
                      /* בקבוצה: תמיד מציגים מי שלח. בפרטי: רק בתחילת רצף מאותו צד (כמו וואטסאפ) */
                      const showPeerHeader =
                        !isMe && (isGroupChat || prevMsg?.sender_id !== msg.sender_id);
                      const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1].created_at).toDateString();

                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex items-center justify-center my-3">
                              <span className="text-[10px] text-muted-foreground bg-muted px-3 py-0.5 rounded-full">
                                {new Date(msg.created_at).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
                              </span>
                            </div>
                          )}
                          <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""} ${idx > 0 && messages[idx - 1].sender_id === msg.sender_id ? "mt-0.5" : "mt-2"}`}>
                            {!isMe && (
                              <div className="w-8 h-8 shrink-0 mt-auto">
                                {showPeerHeader ? (
                                  msg.sender_avatar ? (
                                    <AvatarPreview config={msg.sender_avatar} size={32} />
                                  ) : (
                                    <div
                                      className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-heading font-semibold text-muted-foreground border border-border/60"
                                      title={msg.sender_name}
                                    >
                                      {(msg.sender_name || "?").trim().charAt(0) || "?"}
                                    </div>
                                  )
                                ) : (
                                  <div className="w-8 h-8" aria-hidden />
                                )}
                              </div>
                            )}
                            <div className={`max-w-[72%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                              {showPeerHeader && (
                                <p className="text-[11px] font-medium text-foreground/90 mb-0.5 px-1 leading-tight">
                                  {msg.sender_name}
                                </p>
                              )}
                              <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed
                                ${isMe
                                  ? "bg-primary text-primary-foreground rounded-tl-2xl rounded-tr-sm"
                                  : "bg-muted rounded-tr-2xl rounded-tl-sm"}
                                ${msg.is_flagged ? "ring-1 ring-yellow-400" : ""}`}>
                                {msg.content}
                                {msg.is_flagged && (
                                  <div className="flex items-center gap-1 mt-1 text-[9px] opacity-60">
                                    <AlertTriangle className="h-3 w-3" />
                                    {msg.flag_reason || "תוכן סומן"}
                                  </div>
                                )}
                              </div>
                              <p className={`text-[9px] text-muted-foreground mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
                                {formatTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input area */}
              <div className="px-3 py-2.5 border-t border-border shrink-0">
                {!selectedConvo?.is_accepted && selectedConvo?.created_by !== profile.id ? (
                  /* Accept / decline request */
                  <div className="flex items-center justify-center gap-3 py-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <UserPlus className="h-4 w-4" />
                      בקשת הודעה מ{selectedConvo?.otherName}
                    </p>
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs font-heading text-destructive border-destructive/30">
                      <X className="h-3.5 w-3.5" />דחה
                    </Button>
                    <Button size="sm" className="h-8 gap-1 text-xs font-heading" onClick={() => acceptRequest(selectedId!)}>
                      <Check className="h-3.5 w-3.5" />אשר
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-end">
                    <Textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                      placeholder={quietHours ? "🌙 שעות שקטות — כתוב הודעה..." : "כתוב הודעה..."}
                      disabled={sending}
                      rows={1}
                      className="flex-1 resize-none text-sm min-h-[38px] max-h-24 py-2 bg-muted/40 border-muted"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-xl"
                      disabled={!input.trim() || sending}
                    >
                      {sending
                        ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        : <Send className="h-4 w-4" />
                      }
                    </Button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
