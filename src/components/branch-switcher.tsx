import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentBranch } from "@/hooks/use-branch";

/** Top-level branch selection — outranks the In-House/Warehouse switcher. */
export function BranchSwitcher() {
  const { branchId, branches, setBranch } = useCurrentBranch();
  if (branches.length < 2) return null;
  return (
    <Select value={branchId} onValueChange={setBranch}>
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
