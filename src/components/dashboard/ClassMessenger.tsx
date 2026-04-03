
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Megaphone, 
  Send, 
  Pin, 
  Trash2, 
  Smile, 
  MessageCircle, 
  Calendar,
  AlertCircle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AvatarPreview from "@/components/avatar/AvatarPreview";

interface ClassMessage {
  id: string;
  class_id: string;
  author_id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author_name: string;
  author_avatar: any;
}

const ClassMessenger = ({ classId, userId, isTeacher }: { classId: string; userId: string; isTeacher: boolean }) => {
  const [messages, setMessages] = useState<ClassMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const loadMessages = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      // For now, we reuse the faction_posts table but conceptually for class messages
      // We'll search for a faction linked to this class or create one
      let { data: faction } = await supabase
        .from("factions")
        .select("id")
        .eq("class_id", classId)
        .eq("faction_type", "class_board")
        .single();

      if (!faction) {
          // Auto-create class board faction if it doesn't exist
          const { data: classData } = await supabase.from("classes").select("grade, class_number").eq("id", classId).single();
          const { data: newFaction, error } = await supabase.from("factions").insert({
            name: `לוח כיתה ${classData?.grade}' ${classData?.class_number}`,
            class_id: classId,
            faction_type: "class_board",
            school_id: (await supabase.from("profiles").select("school_id").eq("id", userId).single()).data?.school_id,
            icon: "📋",
            color: "#3b82f6"
          }).select().single();
          
          if (newFaction) faction = newFaction;
      }

      if (faction) {
        const { data: posts } = await supabase
          .from("faction_posts")
          .select("*, profiles!faction_posts_author_id_fkey(full_name), avatars(face_shape, skin_color, eye_shape, eye_color, hair_style, hair_color, facial_hair, outfit, outfit_color, accessory, expression, background)")
          .eq("faction_id", faction.id)
          .eq("is_removed", false)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(10);

        if (posts) {
          setMessages(posts.map((p: any) => ({
            id: p.id,
            class_id: classId,
            author_id: p.author_id,
            content: p.content,
            is_pinned: p.is_pinned,
            created_at: p.created_at,
            author_name: p.profiles?.full_name || "מורה",
            author_avatar: p.avatars ? {
               faceShape: p.avatars.face_shape, skinColor: p.avatars.skin_color, eyeShape: p.avatars.eye_shape,
               eyeColor: p.avatars.eye_color, hairStyle: p.avatars.hair_style, hairColor: p.avatars.hair_color,
               facialHair: p.avatars.facial_hair || "none", outfit: p.avatars.outfit, outfitColor: p.avatars.outfit_color,
               accessory: p.avatars.accessory || "none", expression: p.avatars.expression, background: p.avatars.background,
            } : null
          })));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [classId]);

  const postMessage = async () => {
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
        const { data: faction } = await supabase
            .from("factions")
            .select("id")
            .eq("class_id", classId)
            .eq("faction_type", "class_board")
            .single();

        if (faction) {
            await supabase.from("faction_posts").insert({
                faction_id: faction.id,
                author_id: userId,
                content: newMsg,
                is_pinned: false
            });
            setNewMsg("");
            loadMessages();
            toast({ title: "ההודעה פורסמה לכל הכיתה! 📢" });
        }
    } catch (e) {
        toast({ title: "שגיאה בפרסום", variant: "destructive" });
    } finally {
        setSending(false);
    }
  };

  const togglePin = async (msgId: string, currentStatus: boolean) => {
      await supabase.from("faction_posts").update({ is_pinned: !currentStatus }).eq("id", msgId);
      loadMessages();
  };

  const deleteMessage = async (msgId: string) => {
      await supabase.from("faction_posts").update({ is_removed: true }).eq("id", msgId);
      loadMessages();
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <Card className="border-none shadow-xl bg-white/70 backdrop-blur-md overflow-hidden ring-1 ring-black/[0.02]">
      <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Megaphone className="h-5 w-5 text-primary" />
               </div>
               <div>
                  <CardTitle className="text-sm font-heading font-black">לוח הודעות כיתתי</CardTitle>
                  <CardDescription className="text-[10px] font-medium">עדכונים רשמיים ונושאים לדיון</CardDescription>
               </div>
            </div>
            {isTeacher && (
               <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] px-2">ניהול מורה</Badge>
            )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col h-[450px]">
           <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <AnimatePresence initial={false}>
                 {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                       <MessageCircle className="h-12 w-12 mb-2" />
                       <p className="text-sm font-medium">עדיין אין הודעות בכיתה</p>
                    </div>
                 ) : (
                    messages.map((m, idx) => (
                       <motion.div 
                         key={m.id}
                         initial={{ opacity: 0, x: 20 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: idx * 0.05 }}
                         className={`relative p-4 rounded-2xl border transition-all ${
                            m.is_pinned ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-white border-slate-100 shadow-sm hover:shadow-md'
                         }`}
                       >
                          {m.is_pinned && (
                             <div className="absolute -left-1 -top-1 bg-primary text-white p-1 rounded-lg">
                                <Pin className="h-3 w-3" />
                             </div>
                          )}
                          <div className="flex items-start gap-3">
                             {m.author_avatar ? (
                                <AvatarPreview config={m.author_avatar} size={36} />
                             ) : (
                                <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-sm">👤</div>
                             )}
                             <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                   <p className="text-xs font-heading font-black text-slate-800">{m.author_name}</p>
                                   <span className="text-[9px] text-slate-400 font-medium">
                                      {new Date(m.created_at).toLocaleDateString('he-IL')} • {new Date(m.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                   </span>
                                </div>
                                <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                
                                {isTeacher && (
                                   <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-50">
                                      <Button variant="ghost" size="sm" onClick={() => togglePin(m.id, m.is_pinned)} className="h-7 px-2 text-[10px] gap-1 hover:text-primary">
                                         <Pin className="h-3 w-3" /> {m.is_pinned ? 'בטל נעילה' : 'נעץ הודעה'}
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => deleteMessage(m.id)} className="h-7 px-2 text-[10px] gap-1 text-destructive hover:bg-destructive/10">
                                         <Trash2 className="h-3 w-3" /> מחק
                                      </Button>
                                   </div>
                                )}
                             </div>
                          </div>
                       </motion.div>
                    ))
                 )}
              </AnimatePresence>
           </div>

           {/* Input Area */}
           {isTeacher ? (
              <div className="p-4 bg-slate-50/80 border-t border-slate-100">
                 <div className="relative">
                    <Textarea 
                       value={newMsg}
                       onChange={(e) => setNewMsg(e.target.value)}
                       placeholder="כתוב הודעה לכיתה..."
                       className="min-h-[80px] rounded-2xl bg-white border-slate-200 focus:ring-primary/20 pr-4 pt-3 text-sm resize-none shadow-sm"
                    />
                    <div className="flex items-center justify-between mt-3">
                       <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-slate-400"><Smile className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-slate-400"><Calendar className="h-4 w-4" /></Button>
                       </div>
                       <Button 
                         onClick={postMessage} 
                         disabled={!newMsg.trim() || sending} 
                         className="rounded-xl h-9 px-6 font-bold gap-2 shadow-lg shadow-primary/20"
                       >
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          שלח הודעה
                       </Button>
                    </div>
                 </div>
              </div>
           ) : (
             <div className="p-4 bg-primary/5 border-t border-primary/10 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-bold text-primary">רק מורים יכולים לפרסם הודעות בלוח זה. התלמידים וההורים יכולים לקרוא ולהתעדכן בלבד.</p>
             </div>
           )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClassMessenger;
