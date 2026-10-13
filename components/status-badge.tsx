import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/legacy/api/lib/format";

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "shipped" ? "default" : "secondary"}>{statusLabel(status)}</Badge>;
}
