import { User } from "lucide-react";
import type { AvatarConfig } from "./AvatarStudio";

interface AvatarPreviewProps {
  config: AvatarConfig | null;
  size?: number;
}

const AvatarPreview = ({ size = 48 }: AvatarPreviewProps) => {
  return (
    <div 
      className="flex items-center justify-center bg-muted rounded-xl border border-border/50 shadow-inner overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      <User className="text-muted-foreground/40" style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  );
};

export default AvatarPreview;
