import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowRight } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="text-center space-y-6 max-w-sm">
        <div className="text-8xl font-heading font-bold text-muted-foreground/20 select-none">404</div>
        <div>
          <h1 className="text-2xl font-heading font-bold">הדף לא נמצא</h1>
          <p className="text-muted-foreground font-body mt-2">
            הכתובת שחיפשת לא קיימת או שאין לך הרשאה לגשת אליה.
          </p>
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button className="gap-2 font-heading" onClick={() => navigate("/dashboard")}>
            <Home className="h-4 w-4" />עבור לדאשבורד
          </Button>
          <Button variant="outline" className="gap-2 font-heading" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4" />חזור
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
