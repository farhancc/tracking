import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { ADVISOR_QUESTIONS } from "@/lib/domain/advisor";
import type { StoredAnswer } from "../server/advisor";
import { askAction, confirmProposalAction, rejectProposalAction } from "../server/actions";
import { loadAdvisor } from "../server/queries";

const TOOL_LABELS: Record<string, string> = {
  get_overview: "vision and long-term goals",
  get_goals: "goals",
  get_week: "a week plan",
  get_tasks: "tasks",
  get_sales: "sales",
  get_products: "products",
  get_content: "content analytics",
  get_communication: "communication skills",
  get_finance: "finances",
  get_habits: "habits",
  get_reviews: "weekly reviews",
  get_learning: "reading and psychology",
};

function AnswerCard({ a }: { a: StoredAnswer }) {
  const verified = a.facts.filter((f) => f.verified);
  const unverified = a.facts.filter((f) => !f.verified);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="whitespace-pre-wrap text-base">{a.answer}</p>
      {a.unbackedNumbers.length ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Not backed by a verified fact: {a.unbackedNumbers.join(", ")}. Treat these as unconfirmed.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Facts">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Facts from your data</h3>
          {verified.length === 0 ? <p className="text-muted-foreground">None verified.</p> : null}
          <ul className="flex flex-col gap-1">
            {verified.map((f) => (
              <li key={`${f.statement}-${f.evidence}`} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  {f.statement} <span className="text-xs text-muted-foreground">({TOOL_LABELS[f.source] ?? f.source}: {f.evidence})</span>
                </span>
              </li>
            ))}
          </ul>
          {unverified.length ? (
            <>
              <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-warning-ink">Stated as fact but not found in your data</h3>
              <ul className="flex flex-col gap-1">
                {unverified.map((f) => (
                  <li key={`${f.statement}-${f.evidence}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
                    <span>
                      <span className="line-through decoration-muted-foreground/60">{f.statement}</span> <span className="text-xs text-muted-foreground">{f.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section aria-label="Assumptions">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Assumptions and interpretation</h3>
          {a.assumptions.length === 0 ? <p className="text-muted-foreground">None.</p> : null}
          <ul className="flex flex-col gap-1">
            {a.assumptions.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {x}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {a.recommendations.length ? (
        <section aria-label="Recommendations">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommendations</h3>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {a.recommendations.map((r) => (
              <li key={r.action}>
                <span className="font-medium">{r.action}</span>{" "}
                <Badge variant={r.basis === "facts" ? "secondary" : "outline"}>{r.basis === "facts" ? "from facts" : "from assumptions"}</Badge>
                <p className="text-muted-foreground">{r.rationale}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {a.dataGaps.length ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Missing data: </span>
          {a.dataGaps.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export async function AdvisorView() {
  const data = await loadAdvisor();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const pending = data.proposals.filter((p) => p.status === "pending");
  const decided = data.proposals.filter((p) => p.status !== "pending").slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Strategy advisor</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Answers from your own tracked data only. Facts are checked against the data it read; anything else is labelled as an assumption. It can
          suggest changes to goals and tasks, but nothing changes until you confirm.
        </p>
      </div>

      {!data.configured ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="text-base">The AI advisor isn&rsquo;t configured on this server</CardTitle>
            <CardDescription>
              Set <code>ANTHROPIC_API_KEY</code> in the server environment to enable it. Everything else in FiveYearOS works without it. The{" "}
              <Link className="underline-offset-2 hover:underline" href="/review">
                weekly review
              </Link>{" "}
              gives rule-based observations from the same data.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ask</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActionForm action={askAction} submitLabel="Ask" pendingLabel="Reading your data… (can take a minute)">
            <Textarea name="question" rows={2} maxLength={2000} required placeholder="e.g. Which pillar is falling behind, and what's the cause?" aria-label="Your question" disabled={!data.configured} />
          </ActionForm>
          <div className="flex flex-wrap gap-2">
            {ADVISOR_QUESTIONS.map((q) => (
              <ActionForm key={q} action={askAction} submitLabel={q} submitVariant="outline" inline submitClassName="h-auto whitespace-normal py-1.5 text-left text-xs" pendingLabel="Reading your data…">
                <input type="hidden" name="question" value={q} />
              </ActionForm>
            ))}
          </div>
        </CardContent>
      </Card>

      {pending.length ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Waiting for your decision</CardTitle>
            <CardDescription>Changes the advisor suggested. Confirm to apply, or reject.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.summary}</p>
                    <p className="text-xs text-muted-foreground">Why: {p.reason}</p>
                  </div>
                  <ActionForm action={confirmProposalAction.bind(null, p.id)} submitLabel={p.kind === "delete_task" ? "Confirm delete" : "Confirm"} submitVariant={p.kind === "delete_task" || p.kind === "archive_goal" ? "destructive" : "default"} inline submitClassName="h-9">
                    {null}
                  </ActionForm>
                  <ActionForm action={rejectProposalAction.bind(null, p.id)} submitLabel="Reject" submitVariant="outline" inline submitClassName="h-9">
                    {null}
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="hist-h" className="flex flex-col gap-4">
        <h2 id="hist-h" className="text-lg font-semibold">
          Answers
        </h2>
        {data.history.length === 0 ? <p className="text-sm text-muted-foreground">No questions yet.</p> : null}
        {data.history.map((q) => {
          const a = q.answer as StoredAnswer | null;
          return (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">{q.question}</CardTitle>
                <CardDescription>
                  {q.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {q.model}
                  {q.toolLog.length ? ` · read ${[...new Set(q.toolLog.map((t) => TOOL_LABELS[t.name] ?? t.name))].join(", ")}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>{a ? <AnswerCard a={a} /> : <p className="text-sm text-destructive">{q.error ?? "No answer."}</p>}</CardContent>
            </Card>
          );
        })}
      </section>

      {decided.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Decided proposals</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {decided.map((p) => (
              <li key={p.id}>
                <Badge variant={p.status === "confirmed" ? "success" : p.status === "failed" ? "destructive" : "outline"}>{p.status}</Badge> {p.summary}
                {p.result ? <span className="text-muted-foreground"> · {p.result}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
