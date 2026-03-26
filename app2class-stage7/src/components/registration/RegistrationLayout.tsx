import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface RegistrationLayoutProps {
  title: string;
  step: number;
  totalSteps: number;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  showBack?: boolean;
}

const RegistrationLayout = ({
  title,
  step,
  totalSteps,
  children,
  onNext,
  onBack,
  nextLabel = "המשך",
  nextDisabled = false,
  loading = false,
  showBack = true,
}: RegistrationLayoutProps) => {
  const navigate = useNavigate();
  const progressValue = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-muted to-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <X className="w-5 h-5" />
          </Button>
          <h2 className="font-heading font-bold text-lg">{title}</h2>
          <span className="text-sm text-muted-foreground font-heading">
            {step}/{totalSteps}
          </span>
        </div>
        <div className="max-w-2xl mx-auto mt-2">
          <Progress value={progressValue} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 py-6">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="flex-1"
        >
          {children}
        </motion.div>

        {/* Navigation */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          {showBack && step > 1 && (
            <Button variant="outline" onClick={onBack} className="gap-2 font-heading">
              <ArrowRight className="w-4 h-4" />
              חזרה
            </Button>
          )}
          {onNext && (
            <Button
              onClick={onNext}
              disabled={nextDisabled || loading}
              className="flex-1 gap-2 font-heading text-base"
            >
              {loading ? "שולח..." : nextLabel}
              {!loading && <ArrowLeft className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationLayout;
