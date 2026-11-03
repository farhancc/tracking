import { Badge } from "@/components/ui/badge";
import { EVIDENCE_LEVEL_LABELS, type EvidenceLevel } from "@/lib/domain/psychology";

const variant: Record<EvidenceLevel, "success" | "secondary" | "warning" | "outline" | "destructive"> = {
  strong: "success",
  moderate: "secondary",
  limited: "warning",
  practitioner: "outline",
  speculative: "destructive",
};

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const meta = EVIDENCE_LEVEL_LABELS[level];
  return (
    <Badge variant={variant[level]} title={meta.description}>
      {meta.evidenceBased ? "Evidence-based · " : ""}
      {meta.label}
    </Badge>
  );
}
