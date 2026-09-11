// Runs a command with the environment the end-to-end tests expect:
// a separate build folder, and the fake Supabase address baked into the
// public variables (Next inlines NEXT_PUBLIC_* at build time).
//
//   node scripts/with-test-env.mjs next build
//   node scripts/with-test-env.mjs next start -p 3001
//
// Any variable already set in the environment wins, so a real Supabase
// project can be tested against by exporting the two values first.
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-test",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fake-anon-key",
};

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
process.exit(result.status ?? 1);
