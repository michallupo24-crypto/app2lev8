import { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  MessageCircle, Send, Search, Users, ArrowRight, Moon, AlertTriangle,
  BookOpen, GraduationCap, UserPlus, Lock, Check, X, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AvatarPreview from "@/components/avatar/AvatarPreview";
import type { UserProfile } from "@/hooks/useAuth";
import type { AvatarConfig } from "@/components/avatar/AvatarStudio";

interface Conversation {
  id: string;
  title: string | null;
  type: string;
  subject: string | null;
  grade: string | null;
  is_accepted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants: Participant[];
  lastMessage?: Message;
  unreadCount: number;
}

interface Participant {
  user_id: string;
  full_name: string;
  avatar: AvatarConfig | null;
  roles: string[];
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_flagged: boolean;
  flag_reason: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  student: "תלמיד/ה", parent: "הורה", educator: "מחנך/ת",
  professional_teacher: "מורה", subject_coordinator: "רכז/ת מקצוע",
  grade_coordinator: "רכז/ת שכבה", counselor: "יועץ/ת",
  management: "הנהלה", system_admin: "מנהל/ת מערכת",
};

// Helper to load avatar from DB row
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

async function loadParticipantInfo(userId: string): Promise<Participant> {
  const [profRes, rolesRes, avRes] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("avatars").select("*").eq("user_id", userId).single(),
  ]);
  return {
    user_id: userId,
    full_name: profRes.data?.full_name || "?",
    avatar: avatarFromRow(avRes.data),
    roles: (rolesRes.data || []).map((r: any) => r.role),
  };
}

const ChatPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("recent");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [quietHours, setQuietHours] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [mobileShowMessages, setMobileShowMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // DM search
  const [dmSearch, setDmSearch] = useState("");
  const [dmResults, setDmResults] = useState<Participant[]>([]);

  // Auto-group chats
  const [classGroups, setClassGroups] = useState<Conversation[]>([]);
  const [subjectGroups, setSubjectGroups] = useState<Conversation[]>([]);
  const [parentChats, setParentChats] = useState<Conversation[]>([]);
  const [directMessages, setDirectMessages] = useState<Conversation[]>([]);
  const [messageRequests, setMessageRequests] = useState<Conversation[]>([]);

  const isStudent = profile.roles.includes("student");
  const isParent = profile.roles.includes("parent");
  const isStaff = profile.roles.some(r => !["student", "parent"].includes(r));

  // Quiet hours check
  useEffect(() => {
    if (!profile.schoolId) return;
    const checkQuietHours = async () => {
      const { data } = await supabase
        .from("chat_settings").select("*")
        .eq("school_id", profile.schoolId!).single();
      if (data?.quiet_hours_enabled) {
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const s = data.quiet_hours_start || "22:00";
        const e = data.quiet_hours_end || "07:00";
        setQuietHours(s > e ? (t >= s || t < e) : (t >= s && t < e));
      }
    };
    checkQuietHours();
    const iv = setInterval(checkQuietHours, 60000);
    return () => clearInterval(iv);
  }, [profile.schoolId]);

  // Ensure auto-group chats exist and load all conversations
  const loadConversations = useCallback(async () => {
    const schoolId = profile.schoolId;

    // 1. Ensure class group chats exist (only if school assigned)
    if (schoolId) {
    if (isStudent) {
      // Student: auto-join their class chat
      const { data: myProfile } = await supabase
        .from("profiles").select("class_id").eq("id", profile.id).single();
      if (myProfile?.class_id) {
        const { data: cls } = await supabase
          .from("classes").select("*").eq("id", myProfile.class_id).single();
        if (cls) {
          await ensureGroupChat(`class_${cls.id}`, `כיתה ${cls.grade}'${cls.class_number}`, "group", null, cls.grade);
        }
      }
    } else if (isStaff) {
      // Staff: auto-join chats for classes they teach
      const { data: teacherClasses } = await supabase
        .from("teacher_classes").select("class_id").eq("user_id", profile.id);
      if (teacherClasses) {
        for (const tc of teacherClasses) {
          const { data: cls } = await supabase
            .from("classes").select("*").eq("id", tc.class_id).single();
          if (cls) {
            await ensureGroupChat(`class_${cls.id}`, `כיתה ${cls.grade}'${cls.class_number}`, "group", null, cls.grade);
          }
        }
      }
      // Educator: homeroom class
      const { data: homeroomRoles } = await supabase
        .from("user_roles").select("homeroom_class_id")
        .eq("user_id", profile.id).not("homeroom_class_id", "is", null);
      if (homeroomRoles) {
        for (const hr of homeroomRoles) {
          if (hr.homeroom_class_id) {
            const { data: cls } = await supabase
              .from("classes").select("*").eq("id", hr.homeroom_class_id).single();
            if (cls) {
              await ensureGroupChat(`class_${cls.id}`, `כיתה ${cls.grade}'${cls.class_number}`, "group", null, cls.grade);
            }
          }
        }
      }
    }

    // 2. Ensure subject group chats
    const { data: myRoles } = await supabase
      .from("user_roles").select("role, subject, grade")
      .eq("user_id", profile.id);
    if (myRoles) {
      for (const r of myRoles) {
        if (r.subject) {
          const grade = r.grade || (isStudent ? await getStudentGrade() : null);
          if (grade) {
            await ensureGroupChat(
              `subject_${r.subject}_${grade}`,
              `${r.subject} - ${grade}'`,
              "class_subject",
              r.subject,
              grade
            );
          }
        }
      }
    }

    // For students: auto-join subject chats based on their grade
    if (isStudent) {
      const grade = await getStudentGrade();
      if (grade) {
        // Find all subject conversations for this grade and join them
        const { data: subjectConvos } = await supabase
          .from("conversations")
          .select("id")
          .eq("school_id", profile.schoolId!)
          .eq("type", "class_subject")
          .eq("grade", grade);
        if (subjectConvos) {
          for (const sc of subjectConvos) {
            const { data: existing } = await supabase
              .from("conversation_participants")
              .select("id").eq("conversation_id", sc.id).eq("user_id", profile.id).single();
            if (!existing) {
              await supabase.from("conversation_participants")
                .insert({ conversation_id: sc.id, user_id: profile.id });
            }
          }
        }
      }
    }

    // 3. Parent chats: link parents to their children's educators
    if (isParent) {
      const { data: links } = await supabase
        .from("parent_student").select("student_id").eq("parent_id", profile.id);
      if (links) {
        for (const l of links) {
          const { data: studentProfile } = await supabase
            .from("profiles").select("full_name, class_id").eq("id", l.student_id).single();
          if (studentProfile?.class_id) {
            // Find educator for this class
            const { data: educatorRoles } = await supabase
              .from("user_roles").select("user_id")
              .eq("role", "educator" as any)
              .eq("homeroom_class_id", studentProfile.class_id);
            if (educatorRoles) {
              for (const er of educatorRoles) {
                await ensurePrivateChat(er.user_id, `שיחה עם מחנך - ${studentProfile.full_name}`);
              }
            }
          }
        }
      }
    }
    } // end if (schoolId)

    // 4. Load all conversations I'm part of
    const { data: participantData } = await supabase
      .from("conversation_participants").select("conversation_id")
      .eq("user_id", profile.id);

    if (!participantData?.length) {
      setConversations([]);
      setLoadingConvos(false);
      return;
    }

    const convoIds = participantData.map((p: any) => p.conversation_id);
    const { data: convos } = await supabase
      .from("conversations").select("*")
      .in("id", convoIds).order("updated_at", { ascending: false });

    if (!convos) { setLoadingConvos(false); return; }

    const enriched: Conversation[] = [];
    for (const c of convos) {
      const { data: parts } = await supabase
        .from("conversation_participants").select("user_id")
        .eq("conversation_id", c.id);

      const participants: Participant[] = [];
      if (parts) {
        for (const p of parts) {
          participants.push(await loadParticipantInfo(p.user_id));
        }
      }

      const { data: lastMsg } = await supabase
        .from("messages").select("*")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(1);

      // Unread count
      const { data: myPart } = await supabase
        .from("conversation_participants")
        .select("last_read_at")
        .eq("conversation_id", c.id).eq("user_id", profile.id).single();
      let unreadCount = 0;
      if (myPart?.last_read_at) {
        const { count } = await supabase
          .from("messages").select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id).gt("created_at", myPart.last_read_at);
        unreadCount = count || 0;
      }

      enriched.push({
        ...c,
        participants,
        lastMessage: lastMsg?.[0] || undefined,
        unreadCount,
      });
    }

    // Categorize
    setClassGroups(enriched.filter(c => c.type === "group"));
    setSubjectGroups(enriched.filter(c => c.type === "class_subject"));
    setParentChats(enriched.filter(c => c.type === "private" && c.participants.some(p =>
      p.user_id !== profile.id && (p.roles.includes("parent") || p.roles.includes("educator"))
    )));
    setDirectMessages(enriched.filter(c => c.type === "private" && c.is_accepted));
    setMessageRequests(enriched.filter(c => c.type === "private" && !c.is_accepted && c.created_by !== profile.id));
    setConversations(enriched);
    setLoadingConvos(false);
  }, [profile.id, profile.schoolId]);

  const getStudentGrade = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("profiles").select("class_id").eq("id", profile.id).single();
    if (!data?.class_id) return null;
    const { data: cls } = await supabase
      .from("classes").select("grade").eq("id", data.class_id).single();
    return cls?.grade || null;
  };

  const ensureGroupChat = async (
    key: string, title: string, type: string, subject: string | null, grade: string | null
  ) => {
    // Check if conversation with this title+type+school exists
    let query = supabase
      .from("conversations").select("id")
      .eq("school_id", profile.schoolId!)
      .eq("type", type)
      .eq("title", title);
    if (subject) query = query.eq("subject", subject);
    if (grade) query = query.eq("grade", grade);

    const { data: existing } = await query.limit(1);
    let convoId: string;

    if (existing?.length) {
      convoId = existing[0].id;
    } else {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({
          school_id: profile.schoolId!,
          title,
          type,
          subject,
          grade,
          created_by: profile.id,
          is_accepted: true,
        })
        .select().single();
      if (!newConvo) return;
      convoId = newConvo.id;
    }

    // Ensure I'm a participant
    const { data: myPart } = await supabase
      .from("conversation_participants")
      .select("id").eq("conversation_id", convoId).eq("user_id", profile.id).single();
    if (!myPart) {
      await supabase.from("conversation_participants")
        .insert({ conversation_id: convoId, user_id: profile.id });
    }
  };

  const ensurePrivateChat = async (otherUserId: string, title: string) => {
    // Check existing private chat
    const { data: myConvos } = await supabase
      .from("conversation_participants").select("conversation_id")
      .eq("user_id", profile.id);
    if (myConvos) {
      for (const mc of myConvos) {
        const { data: otherPart } = await supabase
          .from("conversation_participants")
          .select("id").eq("conversation_id", mc.conversation_id).eq("user_id", otherUserId).single();
        if (otherPart) {
          const { data: convo } = await supabase
            .from("conversations").select("type")
            .eq("id", mc.conversation_id).eq("type", "private").single();
          if (convo) return; // Already exists
        }
      }
    }

    const { data: newConvo } = await supabase
      .from("conversations")
      .insert({
        school_id: profile.schoolId!,
        title,
        type: "private",
        created_by: profile.id,
        is_accepted: true,
      })
      .select().single();
    if (!newConvo) return;

    await supabase.from("conversation_participants").insert([
      { conversation_id: newConvo.id, user_id: profile.id },
      { conversation_id: newConvo.id, user_id: otherUserId },
    ]);
  };

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvo) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages").select("*")
        .eq("conversation_id", selectedConvo)
        .order("created_at", { ascending: true });
      setMessages(data || []);
      await supabase.from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", selectedConvo).eq("user_id", profile.id);
    };
    loadMessages();

    const channel = supabase
      .channel(`messages-${selectedConvo}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${selectedConvo}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
        supabase.from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", selectedConvo).eq("user_id", profile.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo, profile.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // DM search - search all approved users (same school if available, otherwise all)
  useEffect(() => {
    if (!dmSearch.trim()) { setDmResults([]); return; }
    const search = async () => {
      let query = supabase
        .from("profiles").select("id, full_name")
        .eq("is_approved", true)
        .neq("id", profile.id)
        .ilike("full_name", `%${dmSearch}%`)
        .limit(15);
      if (profile.schoolId) {
        query = query.eq("school_id", profile.schoolId);
      }
      const { data } = await query;
      if (!data) return;
      const users: Participant[] = [];
      for (const u of data) {
        users.push(await loadParticipantInfo(u.id));
      }
      setDmResults(users);
    };
    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [dmSearch, profile.schoolId, profile.id]);

  // Start DM with Instagram-like restriction
  const startDM = async (otherUser: Participant) => {
    // Check local state first
    const existing = conversations.find(c =>
      c.type === "private" && c.participants.some(p => p.user_id === otherUser.user_id)
    );
    if (existing) {
      setSelectedConvo(existing.id);
      setMobileShowMessages(true);
      setDmSearch("");
      return;
    }

    // Also check DB for existing private conversation between us
    const { data: myConvoParts } = await supabase
      .from("conversation_participants").select("conversation_id")
      .eq("user_id", profile.id);
    if (myConvoParts) {
      const myConvoIds = myConvoParts.map(p => p.conversation_id);
      if (myConvoIds.length > 0) {
        const { data: sharedConvo } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", otherUser.user_id)
          .in("conversation_id", myConvoIds);
        if (sharedConvo?.length) {
          // Verify it's a private conversation
          const { data: privConvo } = await supabase
            .from("conversations").select("id")
            .eq("id", sharedConvo[0].conversation_id)
            .eq("type", "private").single();
          if (privConvo) {
            await loadConversations();
            setSelectedConvo(privConvo.id);
            setMobileShowMessages(true);
            setDmSearch("");
            return;
          }
        }
      }
    }

    // Check if they share a class/subject (if so, no restriction)
    const sharesContext = conversations.some(c =>
      (c.type === "group" || c.type === "class_subject") &&
      c.participants.some(p => p.user_id === otherUser.user_id)
    );

    // Get a school_id - from current user or the other user
    let dmSchoolId = profile.schoolId;
    if (!dmSchoolId) {
      const { data: otherProf } = await supabase
        .from("profiles").select("school_id").eq("id", otherUser.user_id).single();
      dmSchoolId = otherProf?.school_id;
    }
    if (!dmSchoolId) {
      // Fallback: get first school
      const { data: anySchool } = await supabase.from("schools").select("id").limit(1).single();
      dmSchoolId = anySchool?.id;
    }
    if (!dmSchoolId) { toast({ title: "שגיאה", description: "לא נמצא בית ספר", variant: "destructive" }); return; }

    const { data: convo } = await supabase
      .from("conversations")
      .insert({
        school_id: dmSchoolId,
        type: "private",
        created_by: profile.id,
        is_accepted: sharesContext,
      })
      .select().single();
    if (!convo) return;

    await supabase.from("conversation_participants").insert([
      { conversation_id: convo.id, user_id: profile.id },
      { conversation_id: convo.id, user_id: otherUser.user_id },
    ]);

    await loadConversations();
    setSelectedConvo(convo.id);
    setMobileShowMessages(true);
    setDmSearch("");

    if (!sharesContext) {
      toast({
        title: "📩 בקשת הודעה",
        description: "תוכל לשלוח הודעה אחת. השיחה תיפתח כשהצד השני יענה.",
      });
    }
  };

  // Accept message request
  const acceptRequest = async (convoId: string) => {
    await supabase.from("conversations").update({ is_accepted: true }).eq("id", convoId);
    toast({ title: "✅ בקשה אושרה" });
    await loadConversations();
    setSelectedConvo(convoId);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConvo || sending) return;
    const convo = conversations.find(c => c.id === selectedConvo);

    // Instagram-like: if not accepted and not creator, block
    if (convo && !convo.is_accepted && convo.created_by !== profile.id) {
      // This is a request - accepting by replying
      await supabase.from("conversations").update({ is_accepted: true }).eq("id", selectedConvo);
    }

    // If not accepted and IS creator, check if already sent a message
    if (convo && !convo.is_accepted && convo.created_by === profile.id) {
      const { count } = await supabase
        .from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", selectedConvo).eq("sender_id", profile.id);
      if ((count || 0) >= 1) {
        toast({
          title: "⏳ ממתין לתגובה",
          description: "ניתן לשלוח הודעה אחת בלבד עד שהצד השני יענה",
          variant: "destructive",
        });
        return;
      }
    }

    if (quietHours) {
      toast({ title: "🌙 שעות שקטות", description: "ההודעה תישלח אך ההתראות מושתקות" });
    }

    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const { data: modResult } = await supabase.functions.invoke("chat-moderate", {
        body: { message: content, sender_name: profile.fullName },
      });
      const isFlagged = modResult && !modResult.safe;

      await supabase.from("messages").insert({
        conversation_id: selectedConvo,
        sender_id: profile.id,
        content,
        is_flagged: isFlagged || false,
        flag_reason: isFlagged ? modResult.reason : null,
      });

      if (isFlagged) {
        toast({ title: "⚠️ הודעה סומנה", description: modResult.reason, variant: "destructive" });
      }

      await supabase.from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedConvo);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const getConvoDisplayName = (convo: Conversation) => {
    if (convo.title) return convo.title;
    const others = convo.participants.filter(p => p.user_id !== profile.id);
    return others.map(p => p.full_name).join(", ") || "שיחה";
  };

  const getConvoAvatar = (convo: Conversation) => {
    const other = convo.participants.find(p => p.user_id !== profile.id);
    return other?.avatar || null;
  };

  const selectedConversation = conversations.find(c => c.id === selectedConvo);
  const participantsMap = new Map<string, Participant>();
  selectedConversation?.participants.forEach(p => participantsMap.set(p.user_id, p));

  const renderConvoList = (items: Conversation[], emptyMsg: string, icon: React.ReactNode) => {
    if (loadingConvos) return <div className="p-4 text-center text-sm text-muted-foreground">טוען...</div>;
    if (!items.length) return (
      <div className="p-8 text-center">
        <div className="text-muted-foreground/30 mx-auto mb-3">{icon}</div>
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      </div>
    );
    return items.map(convo => (
      <button
        key={convo.id}
        onClick={() => { setSelectedConvo(convo.id); setMobileShowMessages(true); }}
        className={`w-full flex items-center gap-3 p-3 border-b border-border/50 hover:bg-muted/30 transition-colors text-right ${
          selectedConvo === convo.id ? "bg-primary/5" : ""
        }`}
      >
        {convo.type === "private" && getConvoAvatar(convo) ? (
          <AvatarPreview config={getConvoAvatar(convo)!} size={40} />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {convo.type === "group" ? <Users className="h-5 w-5 text-primary" /> :
             convo.type === "class_subject" ? <BookOpen className="h-5 w-5 text-primary" /> :
             <MessageCircle className="h-5 w-5 text-primary" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="font-heading font-medium text-sm truncate">{getConvoDisplayName(convo)}</p>
            {convo.unreadCount > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 h-4 shrink-0">{convo.unreadCount}</Badge>
            )}
          </div>
          {convo.lastMessage && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {convo.lastMessage.is_flagged && <AlertTriangle className="h-3 w-3 inline ml-1 text-warning" />}
              {convo.lastMessage.content}
            </p>
          )}
          {!convo.is_accepted && (
            <div className="flex items-center gap-1 mt-0.5">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">בקשת הודעה</span>
            </div>
          )}
        </div>
      </button>
    ));
  };

  // Determine available tabs based on role
  // Recent chats - all conversations sorted by last message
  const recentChats = [...conversations]
    .filter(c => c.lastMessage)
    .sort((a, b) => new Date(b.lastMessage!.created_at).getTime() - new Date(a.lastMessage!.created_at).getTime());

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const tabs = [];
  tabs.push({ value: "recent", label: "אחרונים", icon: Clock, badge: totalUnread });
  if (!isParent) tabs.push({ value: "classes", label: "כיתות", icon: GraduationCap });
  if (!isParent) tabs.push({ value: "subjects", label: "מקצועות", icon: BookOpen });
  if (isParent || isStaff) tabs.push({ value: "parents", label: isParent ? "מחנכים" : "הורים", icon: Users });
  tabs.push({ value: "dm", label: "הודעות", icon: MessageCircle });
  if (messageRequests.length > 0) tabs.push({ value: "requests", label: `בקשות (${messageRequests.length})`, icon: UserPlus });

  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {mobileShowMessages && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowMessages(false)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-2xl font-heading font-bold">שיחות 💬</h1>
        </div>
        {quietHours && (
          <Badge variant="secondary" className="gap-1">
            <Moon className="h-3 w-3" /> שעות שקטות
          </Badge>
        )}
      </div>

      <div className="flex flex-1 gap-0 min-h-0 border border-border rounded-2xl overflow-hidden bg-card">
        {/* Left panel - conversation list */}
        <div className={`w-full md:w-96 border-l border-border flex flex-col ${mobileShowMessages ? "hidden md:flex" : "flex"}`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0 flex-shrink-0">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-xs font-heading gap-1 relative"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {(tab as any).badge > 0 && (
                    <Badge variant="destructive" className="text-[8px] px-1 h-3.5 min-w-[14px] absolute -top-0.5 -left-0.5">
                      {(tab as any).badge}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="recent" className="m-0">
                {renderConvoList(recentChats, "אין שיחות אחרונות עדיין\nהתחל שיחה חדשה!", <Clock className="h-12 w-12 mx-auto" />)}
              </TabsContent>

              <TabsContent value="classes" className="m-0">
                {renderConvoList(classGroups, "אין קבוצות כיתה עדיין", <GraduationCap className="h-12 w-12 mx-auto" />)}
              </TabsContent>

              <TabsContent value="subjects" className="m-0">
                {renderConvoList(subjectGroups, "אין קבוצות מקצוע עדיין", <BookOpen className="h-12 w-12 mx-auto" />)}
              </TabsContent>

              <TabsContent value="parents" className="m-0">
                {renderConvoList(parentChats, isParent ? "אין שיחות עם מחנכים" : "אין שיחות עם הורים", <Users className="h-12 w-12 mx-auto" />)}
              </TabsContent>

              <TabsContent value="dm" className="m-0">
                <div className="p-3 border-b border-border">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={dmSearch}
                      onChange={e => setDmSearch(e.target.value)}
                      placeholder="חפש אנשים לשליחת הודעה..."
                      className="pr-9 h-9 text-sm"
                    />
                  </div>
                </div>
                {dmSearch ? (
                  <div>
                    {dmResults.map(u => (
                      <button
                        key={u.user_id}
                        onClick={() => startDM(u)}
                        className="w-full flex items-center gap-3 p-3 border-b border-border/50 hover:bg-muted/30 transition-colors text-right"
                      >
                        {u.avatar ? (
                          <AvatarPreview config={u.avatar} size={40} />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-bold">
                            {u.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-heading font-medium text-sm">{u.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {u.roles.map(r => ROLE_LABELS[r] || r).join(", ")}
                          </p>
                        </div>
                      </button>
                    ))}
                    {!dmResults.length && (
                      <p className="text-center text-sm text-muted-foreground py-6">לא נמצאו תוצאות</p>
                    )}
                  </div>
                ) : (
                  renderConvoList(
                    directMessages.filter(c => !parentChats.some(pc => pc.id === c.id)),
                    "אין הודעות ישירות עדיין\nחפש אנשים למעלה כדי להתחיל",
                    <MessageCircle className="h-12 w-12 mx-auto" />
                  )
                )}
              </TabsContent>

              <TabsContent value="requests" className="m-0">
                {messageRequests.map(convo => {
                  const sender = convo.participants.find(p => p.user_id === convo.created_by);
                  return (
                    <div key={convo.id} className="flex items-center gap-3 p-3 border-b border-border/50">
                      {sender?.avatar ? (
                        <AvatarPreview config={sender.avatar} size={40} />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-bold">
                          {sender?.full_name.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-medium text-sm">{sender?.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {sender?.roles.map(r => ROLE_LABELS[r] || r).join(", ")}
                        </p>
                        {convo.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">"{convo.lastMessage.content}"</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => {/* decline */}}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => acceptRequest(convo.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right panel - messages */}
        <div className={`flex-1 flex flex-col ${!mobileShowMessages ? "hidden md:flex" : "flex"}`}>
          {!selectedConvo ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-heading">בחר שיחה כדי להתחיל</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-3 border-b border-border flex items-center gap-3">
                {selectedConversation && (
                  <>
                    {selectedConversation.type === "private" && getConvoAvatar(selectedConversation) ? (
                      <AvatarPreview config={getConvoAvatar(selectedConversation)!} size={32} />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        {selectedConversation.type === "group" ? <Users className="h-4 w-4 text-primary" /> :
                         selectedConversation.type === "class_subject" ? <BookOpen className="h-4 w-4 text-primary" /> :
                         <MessageCircle className="h-4 w-4 text-primary" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-heading font-medium text-sm truncate">{getConvoDisplayName(selectedConversation)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedConversation.participants.length} משתתפים
                        {!selectedConversation.is_accepted && " • בקשת הודעה"}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map(msg => {
                    const isMe = msg.sender_id === profile.id;
                    const sender = participantsMap.get(msg.sender_id);
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        {!isMe && sender?.avatar && <AvatarPreview config={sender.avatar} size={28} />}
                        <div className={`max-w-[70%]`}>
                          {!isMe && (
                            <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{sender?.full_name}</p>
                          )}
                          <div className={`rounded-2xl px-4 py-2 text-sm ${
                            isMe
                              ? "bg-primary text-primary-foreground rounded-bl-2xl rounded-br-sm"
                              : "bg-muted rounded-br-2xl rounded-bl-sm"
                          } ${msg.is_flagged ? "border-2 border-warning/50" : ""}`}>
                            {msg.content}
                            {msg.is_flagged && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] opacity-70">
                                <AlertTriangle className="h-3 w-3" />
                                {msg.flag_reason || "תוכן סומן"}
                              </div>
                            )}
                          </div>
                          <p className={`text-[9px] text-muted-foreground mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
                            {new Date(msg.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-3 border-t border-border">
                {selectedConversation && !selectedConversation.is_accepted && selectedConversation.created_by !== profile.id ? (
                  <div className="flex items-center justify-center gap-3">
                    <p className="text-sm text-muted-foreground">בקשת הודעה מ{getConvoDisplayName(selectedConversation)}</p>
                    <Button size="sm" variant="outline" onClick={() => {/* decline */}}>
                      <X className="h-4 w-4 ml-1" /> דחה
                    </Button>
                    <Button size="sm" onClick={() => acceptRequest(selectedConvo!)}>
                      <Check className="h-4 w-4 ml-1" /> אשר ושלח
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder={
                        selectedConversation && !selectedConversation.is_accepted
                          ? "שלח הודעה אחת..."
                          : "כתוב הודעה..."
                      }
                      disabled={sending}
                      className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
                      <Send className="h-4 w-4" />
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
