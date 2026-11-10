/**
 * End-to-end test of the 14 major workflows (docs/27 §3), through the UI, on a
 * phone-sized viewport, against a running production build.
 *
 *   1. npm run build && npm start                       (or a staging deployment)
 *   2. OWNER_PASSWORD=… npm run owner:create -- e2e-$(date +%s)@localhost
 *   3. E2E_EMAIL=… E2E_PASSWORD=… node tests/e2e/workflows.cjs [fromStep]
 *
 * Needs Playwright with Chromium (npx playwright install chromium). Uses a NEW
 * account: step 0 enrols the authenticator and sets up the journey. Progress
 * (cookies, ids, TOTP secret) is kept in $TMPDIR so a failed run can resume
 * with fromStep. Run it against a test database, not your real data.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const crypto = require("crypto");
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32 = (t) => { let bits = 0, v = 0; const o = []; for (const c of t.replace(/\s/g, "")) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret, offset = 0) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset)); const h = crypto.createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0"); };

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const os = require("os");
const S = process.env.E2E_STATE_DIR ?? require("path").join(os.tmpdir(), "fyos-e2e");
fs.mkdirSync(require("path").join(S, "shots"), { recursive: true });
const from = Number(process.argv[2] ?? 0);
const stateFile = `${S}/e2e-state.json`;
const info = {
  ...(fs.existsSync(`${S}/e2e-info.json`) ? JSON.parse(fs.readFileSync(`${S}/e2e-info.json`, "utf8")) : {}),
  ...(process.env.E2E_EMAIL ? { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD, day1: process.env.E2E_DAY1 ?? new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10) } : {}),
};
if (!info.email || !info.password) {
  console.error("Set E2E_EMAIL and E2E_PASSWORD (a new owner account created with npm run owner:create).");
  process.exit(1);
}
const results = [];
const ok = (n, msg) => { results.push(`✔ ${n} ${msg}`); console.log(`✔ ${n} ${msg}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36", ...(from > 0 && fs.existsSync(stateFile) ? { storageState: stateFile } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const main = () => page.locator("main:visible");
  const overflow = async (label) => { if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`horizontal overflow on ${label}`); };
  try {
    if (from <= 0) {
      // Sign in as the fresh owner, enrol the authenticator.
      await page.goto(base + "/today");
      await page.getByLabel("Email").fill(info.email);
      await page.getByLabel("Password").fill(info.password);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByText("Can't scan? Enter the key by hand").click();
      info.secret = (await page.locator("details p.font-mono").innerText()).replace(/\s/g, "");
      await page.getByLabel("6-digit code").fill(totp(info.secret, -1));
      await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
      await page.getByRole("list", { name: "Recovery codes" }).waitFor();
      await page.getByLabel("I've saved these codes somewhere safe").check();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/today");
      // Journey setup (first run).
      await page.locator("#startDate").fill(info.day1);
      await page.locator("#baseCurrency").fill("INR");
      await page.locator("#timezone").fill("Asia/Kolkata");
      await main().getByRole("button").last().click();
      await page.getByText(/Day \d+ of/).first().waitFor({ timeout: 20000 });
      await overflow("/today");
      ok(0, "signed in with password + TOTP on a new account and set up the journey");
      fs.writeFileSync(stateFile, JSON.stringify(await ctx.storageState()));
      fs.writeFileSync(`${S}/e2e-info.json`, JSON.stringify(info));
    }
    if (from <= 1) {
      await page.goto(base + "/goals/vision");
      await page.locator("#statement").fill("By 2031 I run a profitable B2B software company, sell with confidence, and could stop working for anyone else.");
      await page.locator("#professionalIdentity").fill("Founder-seller");
      await page.locator("#exitStrategy").fill("Replace salary with product profit, then resign.");
      await main().getByRole("button", { name: /save/i }).first().click();
      await page.getByText(/Version 1, effective/).waitFor();
      await overflow("/goals/vision");
      ok(1, "five-year vision saved (version 1)");
    }
    if (from <= 2) {
      const goal = async (params, f) => {
        await page.goto(base + `/goals/new?${params}`);
        await page.locator("#title").waitFor();
        await f();
        await page.getByRole("button", { name: "Create goal" }).click();
        await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/, { timeout: 20000 });
        return page.url().split("/").pop();
      };
      info.fiveYear = await goal("level=five_year", async () => {
        await page.locator("#title").fill("Reach INR 2,00,000 monthly product profit");
        const cat = page.locator("#category");
        if (await cat.count()) await cat.selectOption({ index: 1 });
        await page.locator("#successMetric").fill("Monthly product profit");
        await page.locator("#targetValue").fill("200000");
      });
      info.annual = await goal(`parentId=${info.fiveYear}`, async () => {
        await page.locator("#title").fill("Launch the first paid product");
        await page.locator("#successMetric").fill("Paying customers");
        await page.locator("#targetValue").fill("20");
      });
      ok(2, "five-year goal and an annual objective under it created");
      fs.writeFileSync(`${S}/e2e-info.json`, JSON.stringify(info));
    }
    if (from <= 3) {
      await page.goto(base + `/goals/new?parentId=${info.annual}`);
      await page.locator("#title").fill("Q1: 5 paying pilot customers");
      await page.locator("#successMetric").fill("Paying pilots");
      await page.locator("#targetValue").fill("5");
      await page.getByRole("button", { name: "Create goal" }).click();
      await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/, { timeout: 20000 });
      info.quarterly = page.url().split("/").pop();
      await page.goto(base + "/goals");
      await page.getByText("Q1: 5 paying pilot customers").first().waitFor();
      await overflow("/goals");
      ok(3, "quarterly milestone created under the annual objective; visible in the goal tree");
      fs.writeFileSync(`${S}/e2e-info.json`, JSON.stringify(info));
    }
    if (from <= 4) {
      await page.goto(base + "/week");
      await main().getByText("Weekly scorecard").waitFor(); // streamed content has arrived
      if (!(await main().getByText("Close 2 pilot deals").count())) {
        await main().getByText("Add sales goal").click();
        const form = main().locator("form", { has: page.locator('select[name="parentId"]') }).first();
        await form.locator('select[name="parentId"]').selectOption({ label: "Quarterly objective: Q1: 5 paying pilot customers" });
        await form.locator('input[name="title"]').fill("Close 2 pilot deals");
        await form.locator('input[name="successMetric"]').fill("Pilots closed");
        await form.locator('input[name="targetValue"]').fill("2");
        await form.getByRole("button", { name: "Add weekly goal" }).click();
        await main().getByText("Close 2 pilot deals").first().waitFor({ timeout: 20000 });
      }
      for (const [title, est] of [["Demo to Acme", "45m"], ["Write pilot agreement", "1h"]]) {
        if (await main().getByText(title, { exact: true }).count()) continue;
        const det = main().locator("details", { has: page.locator("summary", { hasText: /^Add task$/ }) }).first();
        if (!(await det.evaluate((d) => d.open))) await det.locator("summary").click();
        await det.locator('input[name="title"]').fill(title);
        await det.locator('input[name="estimatedMinutes"]').fill(est);
        await det.getByRole("button", { name: "Add task" }).click();
        await main().getByText(title, { exact: true }).first().waitFor({ timeout: 20000 });
      }
      await overflow("/week");
      ok(4, "weekly goal serving the quarterly milestone, with 2 planned tasks");
    }
    if (from <= 5) {
      await page.goto(base + "/today");
      await main().getByText("Daily execution").waitFor();
      const pull = main().locator("details", { has: page.getByText(/Pull from this week/) });
      if (await pull.count() && !(await pull.evaluate((d) => d.open))) await pull.locator("summary").click();
      const row = main().locator("li", { hasText: "Demo to Acme" }).filter({ has: page.getByRole("button", { name: "Do today" }) });
      if (await row.count()) await row.getByRole("button", { name: "Do today" }).click();
      await page.getByRole("button", { name: "Complete Demo to Acme" }).first().waitFor({ timeout: 20000 });
      const barBox = await page.getByLabel("New task for today").boundingBox();
      const navBox = await page.locator('nav[aria-label="Main"]:visible').boundingBox();
      if (barBox.y + barBox.height > navBox.y) throw new Error(`quick-add bar (bottom ${barBox.y + barBox.height}) is covered by the tab bar (top ${navBox.y})`);
      await page.getByLabel("New task for today").fill("Send pilot proposal to Beta Ltd");
      await page.getByLabel("Estimate").last().fill("30m");
      await main().getByRole("button", { name: "Add", exact: true }).last().click();
      await page.getByRole("button", { name: "Complete Send pilot proposal to Beta Ltd" }).first().waitFor({ timeout: 20000 });
      ok(5, "daily tasks generated: one pulled from the week plan, one captured for today");
    }
    if (from <= 6) {
      await page.goto(base + "/today");
      const before = await main().getByRole("img", { name: /Daily progress|No progress/ }).first().getAttribute("aria-label");
      for (const t of ["Demo to Acme", "Send pilot proposal to Beta Ltd"]) {
        await page.getByRole("button", { name: `Complete ${t}` }).first().click();
        await page.getByRole("button", { name: `Reopen ${t}` }).first().waitFor({ timeout: 20000 });
      }
      const after = await main().getByRole("img", { name: /Daily progress/ }).first().getAttribute("aria-label");
      ok(6, `both tasks completed; progress ring "${before}" -> "${after}"`);
    }
    if (from <= 7) {
      await page.goto(base + "/sales");
      await page.getByRole("heading", { name: "Sales mastery" }).waitFor();
      for (const outcome of ["No answer", "Connected", "Meeting booked"]) {
        await main().getByRole("button", { name: outcome, exact: true }).first().click();
        await page.waitForTimeout(700);
      }
      await page.reload();
      const calls = await main().locator("li", { hasText: "Cold calls" }).filter({ has: page.locator("span.text-lg") }).first().locator("span.text-lg").innerText();
      const meetings = await main().locator("li", { hasText: "Meetings booked" }).filter({ has: page.locator("span.text-lg") }).first().locator("span.text-lg").innerText();
      if (calls !== "3" || meetings !== "1") throw new Error(`sales counts ${calls}/${meetings}`);
      await overflow("/sales");
      ok(7, `sales calls logged with one tap: cold calls ${calls}, meetings booked ${meetings}`);
    }
    if (from <= 8) {
      await page.goto(base + "/communication/public_speaking");
      await page.locator("#a-level").waitFor();
      if (!(await main().getByText(/Assessed|4\/10/).count())) {
      await page.locator("#a-level").selectOption("4");
      await page.locator("#a-evidence").fill("Self-review of a 2-minute recording: clear structure, many filler words");
      await page.getByRole("button", { name: "Save assessment" }).click();
      await page.getByText("Assessment saved.").waitFor();
      }
      await page.goto(base + "/communication");
      await page.getByRole("heading", { name: "Communication mastery" }).waitFor();
      const card = main().locator("div.rounded-xl", { has: page.getByText("Record a two-minute speech", { exact: true }) }).first();
      const sum = card.locator("summary").first();
      if (await sum.count()) await sum.click();
      const ta = card.locator('textarea[name="content"]');
      if (await ta.count()) await ta.fill("Practised a 2-minute pitch for the pilot offer.");
      const mins = card.locator('input[name="durationMinutes"]');
      if (await mins.count()) await mins.fill("15");
      await card.getByRole("button", { name: "Log practice" }).click();
      await card.getByText(/Practice logged/).waitFor({ timeout: 20000 });
      await overflow("/communication");
      ok(8, "communication: assessed level 4 with evidence, practice session logged");
    }
    if (from <= 9) {
      await page.goto(base + "/products");
      await page.getByRole("heading", { name: "Product portfolio" }).waitFor();
      if (!(await main().getByText("PilotDesk").count())) {
        await page.locator("#p-name").fill("PilotDesk");
        await page.locator("#p-customer").fill("B2B sales teams");
        await page.getByRole("button", { name: "Add product" }).click();
        await page.waitForURL(/\/products\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
      }
      if (!/\/products\/[0-9a-f-]{36}/.test(page.url())) await main().getByRole("link", { name: /PilotDesk/ }).first().click();
      await page.waitForURL(/\/products\/[0-9a-f-]{36}/);
      info.product = page.url().split("/products/")[1].split(/[/?#]/)[0];
      await page.getByRole("link", { name: "Revenue & expenses" }).click();
      await page.getByText("Revenue and expense report").waitFor();
      await page.locator("#t-amount").fill("15000");
      await page.locator("#t-desc").fill("Pilot fee, Acme");
      await page.getByRole("button", { name: "Record", exact: true }).click();
      await page.getByText("Pilot fee, Acme").first().waitFor({ timeout: 20000 });
      await page.locator("#mm-mrr").fill("15000");
      await page.locator("#mm-active").fill("1");
      await page.locator("#mm-new").fill("1");
      await page.getByRole("button", { name: "Save month" }).click();
      await page.waitForTimeout(1000);
      await overflow("/products/[id]");
      ok(9, "product created; pilot revenue and monthly metrics (MRR, customers) recorded");
      fs.writeFileSync(`${S}/e2e-info.json`, JSON.stringify(info));
    }
    if (from <= 10) {
      await page.goto(base + "/content");
      await page.getByRole("heading", { name: "Content", level: 1 }).waitFor();
      if (!(await main().getByText("Why pilots beat free trials").count())) {
        await page.getByLabel("Idea", { exact: true }).fill("Why pilots beat free trials");
        await page.getByLabel("Pillar", { exact: true }).selectOption({ index: 1 });
        await page.getByRole("button", { name: "Save idea" }).click();
        await main().getByText("Why pilots beat free trials").first().waitFor({ timeout: 20000 });
      }
      await main().getByRole("link", { name: "Why pilots beat free trials" }).first().click();
      await page.locator("#ci-status").waitFor();
      await page.locator("#ci-platform").selectOption("linkedin");
      await page.locator("#ci-format").selectOption("text_post");
      await page.locator("#ci-status").selectOption("published");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Record metrics", { exact: true }).waitFor({ timeout: 20000 });
      for (const [id, v] of [["#m-impressions", "2400"], ["#m-likes", "45"], ["#m-comments", "9"], ["#m-leads", "2"]]) if (await page.locator(id).count()) await page.locator(id).fill(v);
      await page.getByRole("button", { name: "Save metrics" }).click();
      await page.getByText("Metrics saved.").waitFor();
      await overflow("/content/[id]");
      ok(10, "content idea captured, published on LinkedIn and its metrics (incl. 2 leads) recorded");
    }
    if (from <= 11) {
      await page.goto(base + "/finance");
      await page.getByRole("heading", { name: "Financial independence", level: 1 }).waitFor();
      await main().getByText("Record income").first().waitFor();
      if (!(await main().getByText("150,000.00").count())) {
      await page.locator("#fi-src").selectOption("salary");
      await page.locator("#fi-amt").fill("150000");
      await page.getByRole("button", { name: "Record income" }).click();
      await page.waitForTimeout(800);
      await page.locator("#fe-cat").selectOption({ index: 1 });
      await page.locator("#fe-amt").fill("60000");
      await page.getByRole("button", { name: "Record expense" }).click();
      await page.waitForTimeout(800);
      }
      await main().getByText("Add an account or debt").click();
      await page.locator("#fa-name").fill("Index fund");
      await page.locator("#fa-kind").selectOption("investment");
      await page.locator("#fa-bal").fill("500000");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await main().getByText("Index fund").first().waitFor({ timeout: 20000 });
      await overflow("/finance");
      ok(11, "finance: income, expense and an investment account with a balance recorded");
    }
    if (from <= 12) {
      await page.goto(base + "/review");
      await page.getByRole("heading", { name: "Weekly review", level: 1 }).waitFor();
      await page.locator("#rv-biggestAchievement").fill("First pilot demo done and first content published");
      await page.locator("#rv-learned").fill("Demos convert better when the agreement is ready");
      await page.locator("#rv-stopDoing").fill("Polishing slides");
      await page.locator("#rv-changeNextWeek").fill("Send the agreement within 24 hours of a demo");
      const reasons = page.locator('select[name^="reason_"]');
      for (let i = 0; i < (await reasons.count()); i++) await reasons.nth(i).selectOption({ index: 1 });
      await page.getByRole("button", { name: "Complete review" }).click();
      await page.getByText("Review completed.").waitFor({ timeout: 20000 });
      await overflow("/review");
      ok(12, "weekly review completed");
    }
    if (from <= 13) {
      const month = new Date().toISOString().slice(0, 7);
      await page.goto(base + `/analytics?month=${month}`);
      await main().getByRole("heading", { name: "Analytics", level: 1 }).waitFor();
      const sales = await main().locator("#sales li", { hasText: "Cold calls" }).first().innerText();
      const content = await main().locator("#content li", { hasText: "Published" }).first().innerText();
      const [dl] = await Promise.all([page.waitForEvent("download"), main().getByRole("link", { name: "PDF" }).click()]);
      await dl.saveAs(`${S}/e2e-month.pdf`);
      const head = fs.readFileSync(`${S}/e2e-month.pdf`).subarray(0, 5).toString();
      if (head !== "%PDF-") throw new Error("not a PDF");
      await overflow("/analytics");
      ok(13, `monthly report for ${month}: sales "${sales.replace(/\s+/g, " ")}", content "${content.replace(/\s+/g, " ")}", PDF ${dl.suggestedFilename()}`);
    }
    if (from <= 14) {
      await page.goto(base + `/goals/${info.fiveYear}`);
      await page.locator("#value").fill("15000");
      await page.getByRole("button", { name: "Log measurement" }).click();
      await page.getByText("Measurement logged.").waitFor();
      await page.goto(base + "/analytics?range=journey");
      const five = main().locator("#five_year li", { hasText: "Average outcome progress" }).first();
      const text = (await five.innerText()).replace(/\s+/g, " ");
      if (!text.includes("7.5%")) throw new Error(`five-year progress shows "${text}"`);
      ok(14, `five-year progress visible: ${text}`);
    }
    fs.writeFileSync(stateFile, JSON.stringify(await ctx.storageState()));
  } catch (e) {
    console.error("FAILED:", e.message.split("\n")[0]);
    await page.screenshot({ path: `${S}/shots/e2e-fail.png`, fullPage: true });
    process.exitCode = 1;
  }
  console.log("page errors:", errors.length ? errors : "none");
  await b.close();
})();
