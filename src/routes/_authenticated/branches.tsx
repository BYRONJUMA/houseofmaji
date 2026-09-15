import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Trash2, UserPlus } from "lucide-react";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { nameOf, useTeam } from "@/hooks/use-crm";
import {
  MACHINES_BRANCH_ID,
  useBranchAccessList,
  useBranchAccessMutation,
  useBranchMutation,
  useBranches,
} from "@/hooks/use-branch";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "Branches — House of Maji" },
      {
        name: "description",
        content: "Add and manage business branches and who can use each branch's point of sale.",
      },
      { property: "og:title", content: "Branches — House of Maji" },
      { property: "og:description", content: "Manage branches and per-branch sales access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const { profile, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { data: branches = [], isLoading } = useBranches();
  const { data: access = [] } = useBranchAccessList();
  const { data: team = [] } = useTeam();
  const mutate = useBranchMutation();
  const grant = useBranchAccessMutation();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", description: "", location: "" });
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState("");

  if (!isAdmin) {
    return (
      <AppShell title="Branches" subtitle="Business branches" showBack>
        <EmptyState
          icon={Building2}
          title="Admins only"
          message="Only an admin can add branches or decide who may use each branch's point of sale."
        />
      </AppShell>
    );
  }

  const save = () => {
    if (!f.name.trim()) {
      toast.error("Give the branch a name");
      return;
    }
    mutate.mutate(
      {
        type: "insert",
        values: {
          name: f.name.trim(),
          description: f.description.trim() || null,
          location: f.location.trim() || null,
          created_by: profile?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Branch added — it starts with an empty catalog");
          setF({ name: "", description: "", location: "" });
          setAdding(false);
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <AppShell
      title="Branches"
      subtitle="Machines runs the full system; every other branch runs point of sale only"
      showBack
      actions={
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add branch
        </Button>
      }
    >
      {branches.length === 0 && !isLoading ? (
        <EmptyState icon={Building2} title="No branches yet" message="Add your first branch." />
      ) : (
        <div className="space-y-4">
          {branches.map((b) => {
            const grants = access.filter((a) => a.branch_id === b.id);
            const machines = b.id === MACHINES_BRANCH_ID;
            return (
              <section key={b.id} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{b.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {b.description || "—"}
                      {b.location ? ` · ${b.location}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added {formatDate(b.created_at)} ·{" "}
                      {machines ? "Full system" : "Point of sale only"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!machines && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setGrantFor(b.id)}>
                          <UserPlus className="h-4 w-4" /> Grant access
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            mutate.mutate(
                              { type: "delete", id: b.id },
                              {
                                onSuccess: () => toast.success("Branch removed"),
                                onError: (e: Error) => toast.error(e.message),
                              },
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {!machines && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Point of sale access
                    </p>
                    {grants.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Only admins can use this branch so far.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {grants.map((g) => (
                          <li key={g.id} className="flex items-center justify-between text-sm">
                            <span>{nameOf(team, g.user_id) || g.user_id}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                grant.mutate(
                                  { type: "revoke", branchId: b.id, userId: g.user_id },
                                  {
                                    onSuccess: () => toast.success("Access revoked"),
                                    onError: (e: Error) => toast.error(e.message),
                                  },
                                )
                              }
                            >
                              Revoke
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {adding && (
        <Dialog open onOpenChange={(o) => !o && setAdding(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add branch</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="Nakuru shop"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Location (optional)</Label>
                <Input
                  value={f.location}
                  onChange={(e) => setF({ ...f, location: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea
                  rows={3}
                  value={f.description}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={save} disabled={mutate.isPending}>
              Add branch
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {grantFor && (
        <Dialog open onOpenChange={(o) => !o && setGrantFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Grant point of sale access</DialogTitle>
            </DialogHeader>
            <Select value={grantUser} onValueChange={setGrantUser}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {team.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!grantUser || grant.isPending}
              onClick={() =>
                grant.mutate(
                  {
                    type: "grant",
                    branchId: grantFor,
                    userId: grantUser,
                    grantedBy: profile?.id ?? null,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Access granted");
                      setGrantUser("");
                      setGrantFor(null);
                    },
                    onError: (e: Error) => toast.error(e.message),
                  },
                )
              }
            >
              Grant access
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
