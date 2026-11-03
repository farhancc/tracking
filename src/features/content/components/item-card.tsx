import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { CONTENT_STATUS_LABELS, FORMAT_LABELS, nextStatus, PLATFORM_LABELS, type ContentStatus, type Format, type Platform } from "@/lib/domain/content";
import { advanceItemAction } from "../server/actions";

export type CardItem = {
  id: string;
  title: string;
  status: ContentStatus;
  platform: Platform | null;
  format: Format | null;
  pillarId: string | null;
  scheduledOn: string | null;
  publishedOn: string | null;
  plannedRecordOn: string | null;
};

export function ItemCard({ item, pillarName, today, showAdvance = true }: { item: CardItem; pillarName?: string; today: string; showAdvance?: boolean }) {
  const next = nextStatus(item.status);
  const date =
    item.publishedOn != null
      ? `published ${item.publishedOn}`
      : item.scheduledOn
        ? `${item.scheduledOn < today ? "overdue · " : ""}scheduled ${item.scheduledOn}`
        : item.plannedRecordOn
          ? `record ${item.plannedRecordOn}`
          : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <Link href={`/content/${item.id}`} className="font-medium leading-snug underline-offset-2 hover:underline">
        {item.title}
      </Link>
      <div className="flex flex-wrap items-center gap-1">
        {item.platform ? <Badge variant="outline">{PLATFORM_LABELS[item.platform]}</Badge> : null}
        {item.format ? <span className="text-xs text-muted-foreground">{FORMAT_LABELS[item.format]}</span> : null}
        {pillarName ? (
          <span className="text-xs text-muted-foreground">
            {item.platform ? "· " : ""}
            {pillarName}
          </span>
        ) : null}
      </div>
      {date ? <span className={`text-xs ${date.startsWith("overdue") ? "text-destructive" : "text-muted-foreground"}`}>{date}</span> : null}
      {showAdvance && next && next !== "scheduled" && next !== "reviewed" ? (
        <ActionForm action={advanceItemAction.bind(null, item.id)} submitLabel={`→ ${CONTENT_STATUS_LABELS[next]}`} submitVariant="outline" inline submitClassName="h-8 text-xs" pendingLabel="…">
          {null}
        </ActionForm>
      ) : null}
    </div>
  );
}
