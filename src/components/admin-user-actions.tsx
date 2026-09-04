import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteAppUser } from "@/lib/admin-users.functions";
import { ROLE_LABEL } from "@/lib/stages";

const ROLES = ["sales_rep", "engineer", "chief_engineer", "sales_head", "admin"] as const;

export function AdminUserActions({
  user,
  isSelf,
}: {
  user: { id: string; full_name: string; role: string };
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const removeUser = useServerFn(deleteAppUser);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    qc.invalidateQueries({ queryKey: ["crm-team"] });
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
        aria-label={`Edit ${user.full_name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
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

      {editing && (
        <EditUserDialog user={user} onClose={() => setEditing(false)} onSaved={invalidate} />
      )}


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

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: { id: string; full_name: string; role: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState(user.role);

  const save = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error("Full name is required");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), role: role as (typeof ROLES)[number] })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("User updated");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
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
          </div>
          <p className="text-xs text-muted-foreground">
            Email addresses can’t be changed here — they go through the verified email-change
            process.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}
