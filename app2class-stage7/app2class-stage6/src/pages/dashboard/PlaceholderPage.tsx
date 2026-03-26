import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: string;
}

const PlaceholderPage = ({ title, description, icon = "🚧" }: PlaceholderPageProps) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardContent className="py-16 text-center">
          <span className="text-5xl block mb-4">{icon}</span>
          <h2 className="text-2xl font-heading font-bold mb-2">{title}</h2>
          <p className="text-muted-foreground font-body">{description}</p>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground/60">
            <Construction className="w-4 h-4" />
            <span>בפיתוח...</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PlaceholderPage;
