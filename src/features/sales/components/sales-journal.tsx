import { Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { JOURNAL_KIND_LABELS, JOURNAL_KINDS, type JournalKind } from "@/lib/domain/sales";
import { cn } from "@/lib/utils";
import { createJournalAction, deleteJournalAction } from "../server/actions";
import { loadJournal } from "../server/queries";

export async function SalesJournal({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const kind = typeof p.kind === "string" && (JOURNAL_KINDS as readonly string[]).includes(p.kind) ? p.kind : undefined;
  const q = typeof p.q === "string" ? p.q.slice(0, 100) : undefined;
  const tag = typeof p.tag === "string" ? p.tag.slice(0, 40) : undefined;
  const entries = await loadJournal({ kind, q, tag });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
          <Link href="/sales/journal" className={cn("rounded-full border px-3 py-1 text-xs", !kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            All
          </Link>
          {JOURNAL_KINDS.map((k) => (
            <Link
              key={k}
              href={`/sales/journal?kind=${k}`}
              className={cn("rounded-full border px-3 py-1 text-xs", kind === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {JOURNAL_KIND_LABELS[k]}
            </Link>
          ))}
        </nav>
        <form action="/sales/journal" className="flex gap-2">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <Input name="q" defaultValue={q ?? ""} placeholder="Search objections, responses, lessons…" aria-label="Search the journal" />
          <SubmitButton variant="outline">Search</SubmitButton>
        </form>
        {tag ? (
          <p className="text-sm">
            Tag <Badge variant="outline">{tag}</Badge>{" "}
            <Link href="/sales/journal" className="text-xs underline">
              clear
            </Link>
          </p>
        ) : null}
        {entries.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : null}
        {entries.map((e) => (
          <Card key={e.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.kind === "mistake" || e.kind === "rejected_prospect" ? "warning" : e.kind === "successful_response" || e.kind === "successful_conversation" ? "success" : "outline"}>
                  {JOURNAL_KIND_LABELS[e.kind as JournalKind]}
                </Badge>
                <span className="text-xs text-muted-foreground">{e.occurredOn}</span>
                {e.worked !== null ? <span className={cn("text-xs", e.worked ? "text-success" : "text-destructive")}>{e.worked ? "worked" : "didn't work"}</span> : null}
                <form className="ml-auto" action={deleteJournalAction.bind(null, e.id)}>
                  <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete ${e.title}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </SubmitButton>
                </form>
              </div>
              <CardTitle className="text-base">{e.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {e.situation ? (
                <p>
                  <span className="font-medium">Situation: </span>
                  {e.situation}
                </p>
              ) : null}
              {e.response ? (
                <p>
                  <span className="font-medium">Response: </span>
                  {e.response}
                </p>
              ) : null}
              {e.lesson ? (
                <p>
                  <span className="font-medium">Lesson: </span>
                  {e.lesson}
                </p>
              ) : null}
              {e.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <Link key={t} href={`/sales/journal?tag=${encodeURIComponent(t)}`}>
                      <Badge variant="outline">{t}</Badge>
                    </Link>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New entry</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createJournalAction} submitLabel="Save entry">
              <Field label="Type" htmlFor="j-kind">
                <Select id="j-kind" name="kind" defaultValue={kind ?? "objection"}>
                  {JOURNAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {JOURNAL_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Title" htmlFor="j-title" hint="e.g. “Send me an email”">
                <Input id="j-title" name="title" required maxLength={200} />
              </Field>
              <Field label="What they said / what happened" htmlFor="j-situation">
                <Textarea id="j-situation" name="situation" rows={3} />
              </Field>
              <Field label="What I said or did" htmlFor="j-response">
                <Textarea id="j-response" name="response" rows={3} />
              </Field>
              <Field label="Did it work?" htmlFor="j-worked">
                <Select id="j-worked" name="worked" defaultValue="">
                  <option value="">Not applicable</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Field label="Lesson" htmlFor="j-lesson">
                <Textarea id="j-lesson" name="lesson" rows={2} />
              </Field>
              <Field label="Tags (comma-separated)" htmlFor="j-tags">
                <Input id="j-tags" name="tags" placeholder="price, timing, authority" />
              </Field>
              <Field label="Date" htmlFor="j-date">
                <Input id="j-date" name="occurredOn" type="date" />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
