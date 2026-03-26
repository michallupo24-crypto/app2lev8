import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center py-16">
          <Card className="max-w-md w-full border-destructive/30">
            <CardContent className="py-8 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive/60" />
              <div>
                <p className="font-heading font-bold text-lg">משהו השתבש</p>
                <p className="text-sm text-muted-foreground mt-1 font-body">
                  {this.state.error?.message || "שגיאה לא ידועה"}
                </p>
              </div>
              <Button
                className="gap-2 font-heading"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RefreshCw className="h-4 w-4" />נסה שוב
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
