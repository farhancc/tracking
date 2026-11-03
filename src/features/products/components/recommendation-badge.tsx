import { Badge } from "@/components/ui/badge";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/domain/products";

const variant: Record<Recommendation, "success" | "secondary" | "warning" | "outline" | "destructive" | "default"> = {
  invest: "success",
  maintain: "secondary",
  fix_retention: "warning",
  validate: "outline",
  pause: "warning",
  discontinue: "destructive",
  insufficient_data: "outline",
  paused: "outline",
  discontinued: "outline",
};

export function RecommendationBadge({ value }: { value: Recommendation }) {
  return <Badge variant={variant[value]}>{RECOMMENDATION_LABELS[value]}</Badge>;
}
