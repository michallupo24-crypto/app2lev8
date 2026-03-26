import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import AvatarStudio, { defaultAvatarConfig, type AvatarConfig } from "@/components/avatar/AvatarStudio";
import type { UserProfile } from "@/hooks/useAuth";

const AvatarEditPage = () => {
  const { profile, refresh } = useOutletContext<{ profile: UserProfile; refresh: () => Promise<void> }>();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState<AvatarConfig>(profile.avatar || defaultAvatarConfig);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Check if avatar exists
      const { data: existing } = await supabase
        .from("avatars")
        .select("id")
        .eq("user_id", profile.id)
        .single();

      const avatarData = {
        face_shape: avatar.body_type || "basic",
        skin_color: avatar.skin || "#FDDBB4",
        eye_color: avatar.eye_color || "brown",
        hair_style: avatar.hair_style || "boy",
        hair_color: avatar.hair_color || "#2C1A0E",
      };

      if (existing) {
        await supabase.from("avatars").update(avatarData).eq("user_id", profile.id);
      } else {
        await supabase.from("avatars").insert({
          user_id: profile.id,
          ...avatarData,
          eye_shape: "round",
          facial_hair: "none",
          outfit: "casual",
          outfit_color: "#3B82F6",
          accessory: "none",
          expression: "happy",
          background: "#E0F2FE",
        });
      }

      await refresh();
      toast({ title: "האווטאר עודכן בהצלחה! 🎨" });
    } catch (error: any) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">עריכת אווטאר 🎨</h1>
        <Button onClick={() => window.history.back()} variant="ghost" size="sm">
          <ArrowRight className="h-4 w-4 ml-1" />
          חזרה
        </Button>
      </div>
      <AvatarStudio config={avatar} onChange={setAvatar} />
      <div className="flex justify-center">
        <Button onClick={handleSave} disabled={saving} size="lg" className="px-12">
          {saving ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>
    </div>
  );
};

export default AvatarEditPage;
