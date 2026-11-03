# 23. AI Personal Strategy Advisor

| | |
|---|---|
| **Status** | Implemented: tools, loop, fact verification, confirmation flow, API, UI and tests. The model call itself is verified up to the API (a request with an invalid key returns 401), but **no real answer has been generated in development** because this environment has no Anthropic credentials. |
| **Code** | `src/lib/domain/advisor.ts` · `src/db/schema/advisor.ts` · `drizzle/0031_advisor.sql`, `0032_advisor_rules.sql` · `src/features/advisor/server/{advisor,tools,proposals}.ts` · `/advisor` (Plan → Advisor) |
| **Model / SDK** | `claude-opus-5-5` via `@anthropic-ai/sdk` 1.4.0 (`client.beta.messages.create`) |
| **Configuration** | `ANTHROPIC_API_KEY` (or another credential the SDK resolves, e.g. `ANTHROPIC_AUTH_TOKEN`; set `FYOS_ADVISOR=1` to force-enable). Without it, `/advisor` says it is off, the question box is disabled, and the rest of the app works unchanged. |

## 1. What it can read: only your authorised data

The advisor sees nothing directly. It calls **read tools**, which run on the server as the signed-in user:

| Tool | Contents |
|---|---|
| `get_overview` | Five-year vision, journey position, pillars, five-year / annual / quarterly goals with progress vs expected, health |
| `get_goals` | Any level, including monthly and weekly goals |
| `get_week` | Weekly plan, goals, scorecard, completed review |
| `get_tasks` | Overdue, this week, today |
| `get_sales` | 30/90-day activities, connect rate, meetings, deals won/lost, pipeline, prospects |
| `get_products` | Portfolio figures, demand evidence, rule-based recommendation |
| `get_content` | Content analytics by pillar and format, insights |
| `get_communication` | Skill levels, targets, gaps, practice |
| `get_finance` | Savings rate, income, business profit, net worth, debt, FI target (with assumptions), milestones |
| `get_habits` | Consistency, streaks, missed days, priority correlation |
| `get_reviews` | Recent completed weekly reviews |
| `get_learning` | Reading and the psychology lab |

How access is limited:

- Every tool runs through `withUser(userId)`, so **row-level security limits it to your rows**. The integration test asserts that another user's goal never appears in a tool result.
- Read tools run in a transaction that is **always rolled back**. Even loaders that create default rows on first use (e.g. finance settings) leave nothing behind; the test checks this.
- Tool schemas are `strict: true`.
- The model sees only these compact summaries. It never sees the database or raw rows beyond them.

## 2. Facts vs assumptions, and no fabrication

The final answer is constrained by structured outputs (`output_config.format`, a JSON schema) to:

```
answer, facts[{statement, source, evidence}], assumptions[], recommendations[{action, rationale, basis: facts|assumptions}], dataGaps[]
```

The system prompt (cached with `cache_control`) forbids stating any completed task, sales figure, financial result or metric not read from a tool in that conversation; missing data goes to `dataGaps`.

The app checks the facts itself before showing them (`verifyFacts`):

- a fact is **verified** only if the tool it cites was actually called, and its quoted evidence appears in that tool's output (after normalising spaces, commas and quotes);
- unverified "facts" are shown separately, struck through, under **"Stated as fact but not found in your data"**, with the reason;
- `unbackedNumbers` lists any number in the headline answer that no verified fact supports (years are exempt, and "1" is backed by a fact saying "one"), shown as **"Not backed by a verified fact"**.

If the model declines (`stop_reason: refusal`), runs out of tokens, or returns something that isn't the schema, the question is stored with an error and **no answer is shown**. Nothing is guessed.

## 3. Confirmation before changing goals or deleting data

The advisor has **proposal tools** and no write tools: `propose_goal_change`, `propose_archive_goal`, `propose_task`, `propose_delete_task`.

- Each one checks that the goal or task exists for you, and records an `advisor_proposals` row (`pending`) with a summary and the reason. It replies to the model "Nothing has changed."
- On `/advisor`, **Waiting for your decision** lists proposals with **Confirm** (red for deletes and archives) or **Reject**.
- **Confirm** runs the change through the normal services (`updateGoal`, `archiveGoal`, `createTask`, task delete) inside a savepoint. If that fails validation, the proposal is marked `failed` with the message, and nothing changes.
- A decided proposal can't be decided again (service check and DB trigger, `proposal_decided`).

## 4. Questions it answers

One-tap questions:

- Am I progressing toward my five-year objectives?
- What is my biggest bottleneck?
- Which activity produces the most value?
- Am I spreading myself too thin?
- Which product deserves attention?
- Which skill needs improvement?
- What should I prioritize this week?

Free-text questions work too. The last few answered questions are sent as plain-text context; tool data from earlier questions is not replayed.

## 5. The loop

`askAdvisor()` uses a manual tool loop (no beta tool-runner dependency):

- **Request:** `claude-opus-5-5`, `max_tokens` 16000, effort `high`, strict tools, the JSON-schema output format.
- **Refusal fallback:** `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`, so a policy decline is re-run server-side on a recommended model. `echoable()` drops pre-fallback thinking and `tool_use` blocks when echoing a turn back, as the API requires. A final `refusal` is reported as declined.
- **Tools:** all `tool_use` blocks in a turn are executed and their results returned in **one** user message, with `is_error` on failures.
- **Limits and errors:** up to 12 turns. Authentication, rate-limit and other API errors become a stored error message.
- **No long transaction:** each data read is its own short transaction, and the HTTP endpoint (`apiRouteNoTx`) doesn't hold one open during the model call.
- **Audit log:** each question records its answer, the tools called with their inputs (shown as "read products, finances"), and the model that served it.

## 6. REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/advisor` | `configured`, standing questions, recent answers, proposals |
| POST | `/api/v1/advisor/ask` | `{ question }` → `{ questionId, answer, error }` (503 `advisor_not_configured` without credentials) |
| POST | `/api/v1/advisor/proposals/:id/confirm` | Apply (your confirmation) |
| POST | `/api/v1/advisor/proposals/:id/reject` | Reject |

## 7. Tests

- **Unit** (`advisor.test.ts`):
  - facts are verified only against the tool they cite; fabricated values and uncalled tools are rejected
  - unbacked numbers in the answer, including number words
- **Integration** (`tests/integration/advisor.test.ts`, real migrations under the RLS app role, **scripted model responses** via the injectable `AdvisorClient`):
  - the request shape: model, structured output, strict tools, cached system prompt, refusal fallback
  - tool results returned in one message; another user's data never present
  - verified vs fabricated facts; unbacked numbers
  - read tools roll back (no finance settings created)
  - a proposal leaves the goal unchanged until confirmed; then applied; can't be decided twice (service and DB)
  - cross-user proposals refused; refusal and malformed output stored as errors with no answer; a failing change marked `failed`
- **Browser** (Playwright):
  - "not configured" state; the answer card's verified / unverified / unbacked sections
  - confirming one proposal and rejecting another
  - with an invalid key, a real request reaches the API, the 401 is shown as a clear error and stored
  - no overflow at 390 px

**Not yet done:** an end-to-end run with real credentials, to judge answer quality and prompt behaviour. Do this before relying on the advisor.
