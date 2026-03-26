import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface StudioModeWrapperProps {
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
  onBack: () => void;
  children: ReactNode;
}

const StudioModeWrapper = ({ title, description, icon, badge, onBack, children }: StudioModeWrapperProps) => {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-heading font-bold">{title}</h2>
              {badge && (
                <Badge variant="secondary" className="text-[10px] bg-accent/20 text-accent border-0">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-body">{description}</p>
          </div>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {children}
      </motion.div>
    </div>
  );
};

export default StudioModeWrapper;
