import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { CrmShell, StatCard, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatKES, formatDate } from "@/lib/format";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_BADGE,
  isCrmManager,
  isoDate,
  label,
  num,
} from "@/lib/crm";
import { useProjects, useTeam, useCrmMutation, nameOf, type Project } from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/projects")({
  head: () => ({
    meta: [
      { title: "Projects — House of Maji CRM" },
      {
        name: "description",
        content: "Installation and bulk-supply projects with totals, balances and status.",
      },
      { property: "og:title", content: "Projects — House of Maji CRM" },
      { property: "og:description", content: "Track project totals, balances and completion." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: projects = [] } = useProjects();
  const { data: team = [] } = useTeam();
  const mutate = useCrmMutation("projects", ["crm-projects"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [status, setStatus] = useState("all");

  const rows = projects.filter((p) => status === "all" || p.status === status);
  const total = rows.reduce((s, p) => s + num(p.total), 0);
  const balance = rows.reduce((s, p) => s + num(p.balance), 0);
  const ongoing = projects.filter((p) => p.status === "ongoing");

  const remove = (p: Project) => {
    if (!confirm(`Delete project for ${p.client_name || "this client"}?`)) return;
    mutate.mutate(
      { type: "delete", id: p.id },
      {
        onSuccess: () => toast.success("Project deleted"),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <CrmShell
      title="Projects"
      subtitle={`${projects.length} projects · ${ongoing.length} ongoing.`}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Projects" value={String(rows.length)} />
          <StatCard label="Ongoing" value={String(ongoing.length)} />
          <StatCard label="Total value" value={formatKES(total)} />
          <StatCard label="Outstanding balance" value={formatKES(balance)} />
        </div>

        <div className="surface-card flex flex-wrap items-center gap-3 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Machine / scope</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created by</th>
                {manager && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/50"
                >
                  <td className="px-3 py-2">{formatDate(p.date)}</td>
                  <td className="px-3 py-2 font-medium">{p.client_name || "—"}</td>
                  <td className="px-3 py-2">{p.machine_description || "—"}</td>
                  <td className="px-3 py-2">{p.location || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKES(p.total)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${num(p.balance) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {formatKES(p.balance)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={PROJECT_STATUS_BADGE[p.status] ?? ""}>
                      {label(p.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{nameOf(team, p.created_by)}</td>
                  {manager && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(p);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No projects recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <ProjectDialog
          project={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </CrmShell>
  );
}

function ProjectDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { profile } = useAuth();
  const mutate = useCrmMutation("projects", ["crm-projects"]);
  const [f, setF] = useState({
    date: project?.date ?? isoDate(new Date()),
    client_name: project?.client_name ?? "",
    machine_description: project?.machine_description ?? "",
    location: project?.location ?? "",
    total: String(project?.total ?? ""),
    balance: String(project?.balance ?? ""),
    status: project?.status ?? "ongoing",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    const values = {
      date: f.date,
      client_name: f.client_name.trim(),
      machine_description: f.machine_description.trim() || null,
      location: f.location.trim() || null,
      total: Number(f.total || 0),
      balance: f.balance ? Number(f.balance) : 0,
      status: f.status,
      ...(project ? {} : { created_by: profile?.id ?? null }),
    };
    mutate.mutate(
      project ? { type: "update", id: project.id, values } : { type: "insert", values },
      {
        onSuccess: () => {
          toast.success(project ? "Project updated" : "Project created");
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Machine / scope</Label>
            <Input
              value={f.machine_description}
              onChange={(e) => set("machine_description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Total (KES)</Label>
            <Input type="number" value={f.total} onChange={(e) => set("total", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Balance (KES)</Label>
            <Input
              type="number"
              value={f.balance}
              onChange={(e) => set("balance", e.target.value)}
            />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {project ? "Save changes" : "Create project"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
