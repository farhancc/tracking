/**
 * Owner account CLI. FiveYearOS has exactly one owner and no sign-up page
 * (SEC-AUTH-03), so this is how the account is created and recovered.
 *
 *   npm run owner:create -- you@example.com     create the owner (or set a new password)
 *   npm run owner:reset  -- you@example.com     new password AND remove the authenticator
 *                                               (use when both phone and recovery codes are lost)
 *
 * The password is read from OWNER_PASSWORD, or typed at a hidden prompt.
 * Every device is signed out. Uses AUTH_DATABASE_URL (the fyos_auth role).
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { createInterface } from "node:readline";
import { createDatabase } from "../src/db/drizzle";
import { setOwnerCredentials } from "../src/lib/auth/login";
import { breachCount, checkPasswordPolicy } from "../src/lib/auth/password";

config({ path: [".env.local", ".env"], quiet: true });

const [mode, email] = process.argv.slice(2);
if (!["create", "reset"].includes(mode) || !email || !email.includes("@")) {
  console.error("Usage: tsx scripts/owner.ts <create|reset> <email>");
  process.exit(1);
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => out.output.write(s.startsWith(question) ? s : "");
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a);
    });
  });
}

const password = process.env.OWNER_PASSWORD ?? (await ask("New password: "));
if (!process.env.OWNER_PASSWORD && (await ask("Repeat it: ")) !== password) {
  console.error("The passwords don't match.");
  process.exit(1);
}
const policy = checkPasswordPolicy(password, email);
if (!policy.ok) {
  console.error(policy.message);
  process.exit(1);
}
const breached = await breachCount(password);
if (breached === "unknown") console.warn("Couldn't reach the Pwned Passwords service; the breached-password check was skipped.");
else if (breached > 0) {
  console.error(`This password appears in ${breached.toLocaleString()} known data breaches. Choose another.`);
  process.exit(1);
}

const url = process.env.AUTH_DATABASE_URL;
if (!url) {
  console.error("AUTH_DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, max: 1 });
try {
  const r = await setOwnerCredentials(createDatabase(pool), { email, password, resetMfa: mode === "reset" });
  console.log(r.created ? `Owner ${email} created.` : `Owner ${email} updated${mode === "reset" ? "; authenticator removed" : ""}.`);
  console.log("Every device is signed out. Sign in at /login; you'll set up the authenticator app on first sign-in.");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
