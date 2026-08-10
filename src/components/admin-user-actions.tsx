import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAppUser } from "@/lib/admin-users.functions";
import { ROLE_LABEL } from "@/lib/stages";

const ROLES = ["sales_rep", "engineer", "chief_engineer", "admin"] as const;

export function AdminUserActions({
  user,
  isSelf,
}: {
  user: { id: string; full_name: string; role: string };
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const removeUser = useServerFn(deleteAppUser);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["fulfillments"] });
    qc.invalidateQueries({ queryKey: ["commissions"] });
  };

  const changeRole = useMutation({
    mutationFn: async (role: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ role: role as (typeof ROLES)[number] })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      await removeUser({ data: { userId: user.id } });
    },
    onSuccess: () => {
      toast.success(`${user.full_name} deleted`);
      setConfirming(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not delete this user"),
  });

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={user.role} onValueChange={(v) => changeRole.mutate(v)}>
        <SelectTrigger className="h-9 w-[168px]" aria-label={`Role for ${user.full_name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={isSelf}
        aria-label={`Delete ${user.full_name}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes their account and sign-in access. Past orders stay in the
              records but will no longer show them as the responsible person.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteUser.mutate();
              }}
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
