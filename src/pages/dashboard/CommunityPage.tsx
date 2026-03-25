import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Users, Flower2, Plus, ArrowRight, Eye, EyeOff,
  Pin, Send, Lock, Globe, GraduationCap, BookOpen, Heart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/hooks/useAuth";

interface Faction {
  id: string;
  name: string;
  description: string | null;
  faction_type: string;
  icon: string;
  color: string;
  eligible_roles: string[];
  is_sub_faction: boolean;
  grade: string | null;
  subject: string | null;
  memberCount: number;
  postCount: number;
  isMember: boolean;
  isEligible: boolean;
}

interface Post {
  id: string;
  title: string | null;
  content: string;
  is_anonymous: boolean;
  flowers: number;
  is_pinned: boolean;
  created_at: string;
  author_name: string;
  author_id: string;
  hasVoted: boolean;
  commentCount: number;
}

interface Comment {
  id: string;
  content: string;
  is_anonymous: boolean;
  flowers: number;
  created_at: string;
  author_name: string;
  author_id: string;
}

const FACTION_TYPE_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  main_hub: { label: "כלל בית ספרי", icon: Globe, color: "text-primary" },
  student_sanctuary: { label: "מועדון תלמידים", icon: GraduationCap, color: "text-success" },
  staff_room: { label: "חדר מורים", icon: BookOpen, color: "text-warning" },
  parents_circle: { label: "מעגל הורים", icon: Heart, color: "text-secondary" },
};

const CommunityPage = () => {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const { toast } = useToast();
  const [factions, setFactions] = useState<Faction[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<Faction | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostAnon, setNewPostAnon] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newCommentAnon, setNewCommentAnon] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);

  const isStudent = profile.roles.includes("student");
  const isParent = profile.roles.includes("parent");
  const isStaff = profile.roles.some(r => !["student", "parent"].includes(r));

  const checkEligibility = useCallback((f: any): boolean => {
    const eligible = f.eligible_roles || [];
    if (eligible.length === 0) return true;
    return profile.roles.some(r => eligible.includes(r));
  }, [profile.roles]);

  const loadFactions = useCallback(async () => {
    if (!profile.schoolId) return;
    setLoading(true);

    const { data: factionsData } = await supabase
      .from("factions")
      .select("*")
      .eq("school_id", profile.schoolId)
      .order("faction_type");

    if (!factionsData) { setLoading(false); return; }

    const { data: myMemberships } = await supabase
      .from("faction_members")
      .select("faction_id")
      .eq("user_id", profile.id);

    const memberSet = new Set((myMemberships || []).map((m: any) => m.faction_id));

    const enriched: Faction[] = factionsData.map((f: any) => ({
      ...f,
      memberCount: 0,
      postCount: 0,
      isMember: memberSet.has(f.id),
      isEligible: checkEligibility(f),
    }));

    setFactions(enriched);
    setLoading(false);
  }, [profile.schoolId, profile.id, checkEligibility]);

  useEffect(() => { loadFactions(); }, [loadFactions]);

  const joinFaction = async (factionId: string) => {
    const { error } = await supabase.from("faction_members").insert({
      faction_id: factionId,
      user_id: profile.id,
    });
    if (error) {
      toast({ title: "שגיאה בהצטרפות", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הצטרפת לפלג! 🎉" });
    loadFactions();
  };

  const loadPosts = async (factionId: string) => {
    const { data } = await supabase
      .from("faction_posts")
      .select("*")
      .eq("faction_id", factionId)
      .eq("is_removed", false)
      .order("is_pinned", { ascending: false })
      .order("is_community_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (!data) return;

    const authorIds = [...new Set(data.map((p: any) => p.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    const { data: myVotes } = await supabase
      .from("flower_votes")
      .select("post_id")
      .eq("user_id", profile.id)
      .in("post_id", data.map((p: any) => p.id));
    const voteSet = new Set((myVotes || []).map((v: any) => v.post_id));

    setPosts(data.map((p: any) => ({
      ...p,
      author_name: p.is_anonymous ? "אנונימי 🎭" : (nameMap.get(p.author_id) || "?"),
      hasVoted: voteSet.has(p.id),
      commentCount: 0,
    })));
  };

  const openFaction = (f: Faction) => {
    setSelectedFaction(f);
    setSelectedPost(null);
    loadPosts(f.id);
  };

  const createPost = async () => {
    if (!selectedFaction || !newPostContent.trim()) return;
    const { error } = await supabase.from("faction_posts").insert({
      faction_id: selectedFaction.id,
      author_id: profile.id,
      title: newPostTitle || null,
      content: newPostContent,
      is_anonymous: newPostAnon,
    });
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    setNewPostTitle("");
    setNewPostContent("");
    setNewPostAnon(false);
    setShowNewPost(false);
    loadPosts(selectedFaction.id);
    toast({ title: "הפוסט פורסם! ✨" });
  };

  const votePost = async (postId: string, hasVoted: boolean) => {
    if (hasVoted) {
      await supabase.from("flower_votes").delete().eq("user_id", profile.id).eq("post_id", postId);
    } else {
      await supabase.from("flower_votes").insert({ user_id: profile.id, post_id: postId });
    }
    if (selectedFaction) loadPosts(selectedFaction.id);
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from("faction_comments")
      .select("*")
      .eq("post_id", postId)
      .eq("is_removed", false)
      .order("created_at", { ascending: true });

    if (!data) return;
    const authorIds = [...new Set(data.map((c: any) => c.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    setComments(data.map((c: any) => ({
      ...c,
      author_name: c.is_anonymous ? "אנונימי 🎭" : (nameMap.get(c.author_id) || "?"),
    })));
  };

  const openPost = (p: Post) => {
    setSelectedPost(p);
    loadComments(p.id);
  };

  const addComment = async () => {
    if (!selectedPost || !newComment.trim()) return;
    const { error } = await supabase.from("faction_comments").insert({
      post_id: selectedPost.id,
      author_id: profile.id,
      content: newComment,
      is_anonymous: newCommentAnon,
    });
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    setNewComment("");
    setNewCommentAnon(false);
    loadComments(selectedPost.id);
  };

  // Group factions by type
  const groupedFactions = factions.reduce((acc, f) => {
    if (!acc[f.faction_type]) acc[f.faction_type] = [];
    acc[f.faction_type].push(f);
    return acc;
  }, {} as Record<string, Faction[]>);

  if (selectedPost && selectedFaction) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedPost(null)} className="gap-2">
          <ArrowRight className="h-4 w-4" /> חזרה לפלג
        </Button>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {selectedPost.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                <span className="text-xs text-muted-foreground">{selectedPost.author_name}</span>
                <span className="text-[10px] text-muted-foreground/50">
                  {new Date(selectedPost.created_at).toLocaleDateString("he-IL")}
                </span>
              </div>
              {selectedPost.title && <h2 className="text-lg font-heading font-bold">{selectedPost.title}</h2>}
              <p className="text-sm font-body whitespace-pre-wrap mt-2">{selectedPost.content}</p>
            </div>
            <div className="flex items-center gap-3 border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1 ${selectedPost.hasVoted ? "text-secondary" : ""}`}
                onClick={() => votePost(selectedPost.id, selectedPost.hasVoted)}
              >
                <Flower2 className="h-4 w-4" /> {selectedPost.flowers}
              </Button>
              <span className="text-xs text-muted-foreground">{comments.length} תגובות</span>
            </div>
          </CardContent>
        </Card>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {comments.map(c => (
              <Card key={c.id}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-heading font-medium">{c.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm font-body">{c.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Switch checked={newCommentAnon} onCheckedChange={setNewCommentAnon} id="anon-comment" />
              <Label htmlFor="anon-comment" className="text-xs">
                {newCommentAnon ? <EyeOff className="h-3 w-3 inline" /> : <Eye className="h-3 w-3 inline" />}
                {newCommentAnon ? " אנונימי" : " גלוי"}
              </Label>
            </div>
            <Input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="הוסף תגובה..."
              onKeyDown={e => e.key === "Enter" && addComment()}
            />
          </div>
          <Button onClick={addComment} disabled={!newComment.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  if (selectedFaction) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedFaction(null)} className="gap-2">
            <ArrowRight className="h-4 w-4" /> חזרה
          </Button>
          <Button onClick={() => setShowNewPost(true)} className="gap-2 font-heading">
            <Plus className="h-4 w-4" /> פוסט חדש
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl">{selectedFaction.icon}</span>
          <div>
            <h1 className="text-xl font-heading font-bold">{selectedFaction.name}</h1>
            {selectedFaction.description && (
              <p className="text-sm text-muted-foreground">{selectedFaction.description}</p>
            )}
          </div>
        </div>

        {/* New Post Dialog */}
        <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">פוסט חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={newPostTitle}
                onChange={e => setNewPostTitle(e.target.value)}
                placeholder="כותרת (אופציונלי)"
              />
              <Textarea
                value={newPostContent}
                onChange={e => setNewPostContent(e.target.value)}
                placeholder="מה חדש? ..."
                rows={4}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={newPostAnon} onCheckedChange={setNewPostAnon} id="anon-post" />
                  <Label htmlFor="anon-post" className="text-sm">
                    {newPostAnon ? "🎭 אנונימי" : "👤 גלוי"}
                  </Label>
                </div>
                <Button onClick={createPost} disabled={!newPostContent.trim()} className="font-heading">
                  פרסם
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">עדיין אין פוסטים. תהיה הראשון! 🌟</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {posts.map(p => (
              <Card
                key={p.id}
                className="cursor-pointer hover:shadow-md transition-all"
                onClick={() => openPost(p)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    {p.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                    {(p as any).is_community_pinned && !p.is_pinned && <Pin className="h-3 w-3 text-secondary" />}
                    <span className="text-xs text-muted-foreground">{p.author_name}</span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {new Date(p.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                  {p.title && <p className="font-heading font-bold text-sm">{p.title}</p>}
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.content}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`gap-1 h-6 text-xs ${p.hasVoted ? "text-secondary" : ""}`}
                      onClick={(e) => { e.stopPropagation(); votePost(p.id, p.hasVoted); }}
                    >
                      <Flower2 className="h-3 w-3" /> {p.flowers}
                    </Button>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {p.commentCount}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Users className="h-7 w-7 text-primary" />
          App2Community
        </h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          הפורומים של בית הספר שלך
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : factions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-body">אין פלגים זמינים עדיין</p>
            <p className="text-xs text-muted-foreground/60 mt-1">ההנהלה תקים את הפורומים בקרוב</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedFactions).map(([type, facs]) => {
            const cfg = FACTION_TYPE_CONFIG[type] || FACTION_TYPE_CONFIG.main_hub;
            const Icon = cfg.icon;
            return (
              <div key={type}>
                <h2 className={`text-lg font-heading font-bold flex items-center gap-2 mb-3 ${cfg.color}`}>
                  <Icon className="h-5 w-5" />
                  {cfg.label}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {facs.map(f => (
                    <Card
                      key={f.id}
                      className={`transition-all ${f.isEligible ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "opacity-50"}`}
                      onClick={() => f.isMember ? openFaction(f) : f.isEligible ? joinFaction(f.id) : null}
                    >
                      <CardContent className="py-4 flex items-center gap-3">
                        <span className="text-2xl">{f.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-heading font-bold text-sm truncate">{f.name}</p>
                          {f.description && (
                            <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                          )}
                        </div>
                        {!f.isEligible ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : f.isMember ? (
                          <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">חבר</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="text-xs font-heading" onClick={(e) => { e.stopPropagation(); joinFaction(f.id); }}>
                            הצטרף
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default CommunityPage;
