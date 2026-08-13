import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground", className)}
      onClick={() => router.history.back()}
    >
      <ArrowLeft className="mr-1 h-4 w-4" /> Back
    </Button>
  );
}
