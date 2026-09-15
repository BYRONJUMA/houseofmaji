import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "@tanstack/react-router";
import { MACHINES_BRANCH_ID, useCurrentBranch } from "@/hooks/use-branch";

/** Top-level branch selection — outranks the In-House/Warehouse switcher. */
export function BranchSwitcher() {
  const { branchId, branches, setBranch } = useCurrentBranch();
  const navigate = useNavigate();
  if (branches.length < 2) return null;
  // Each branch lands on its own overview when picked.
  const pick = (id: string) => {
    setBranch(id);
    navigate({ to: id === MACHINES_BRANCH_ID ? "/" : "/pos/overview" });
  };
  return (
    <Select value={branchId} onValueChange={pick}>
      <SelectTrigger className="w-[160px]" aria-label="Branch">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
