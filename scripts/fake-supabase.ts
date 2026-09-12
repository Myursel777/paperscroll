// A stand-in for Supabase, for developing and testing the account features
// without a project. Everything lives in memory and is gone when it stops.
//
//   npx tsx scripts/fake-supabase.ts                       http://localhost:54321
//   FAKE_SUPABASE_PORT=55555 npx tsx scripts/fake-supabase.ts
// (Not PORT: that variable selects the app's port in the test setup.)
//
// It speaks the parts of the Supabase API the app uses:
//   Auth:  sign up (with email confirmation), password login, refresh, user,
//          update user (password, metadata), logout, password recovery, the
//          verify link, and the PKCE code exchange the callback route uses.
//   REST:  the profiles, collections, saved_papers, and events tables with
//          the PostgREST filters the app sends (select, eq, in, gte, ov,
//          order, limit, upsert with on_conflict, single-object responses),
//          the delete_own_account RPC, and row-level security: a request
//          only ever sees rows that belong to the bearer token's user. The
//          papers table (the store the nightly job fills) is public to read
//          and written only by the bearer token "fake-service-key", which
//          plays the service role; rpc/nearest_papers ranks stored papers by
//          cosine similarity to a query vector.
//
// Emails are not sent. Every "email" (confirmation, recovery) is recorded and
// can be read at GET /_dev/emails, which is how the end-to-end tests click the
// link a real user would get. POST /_dev/reset clears all state.
//
// Tokens are JWT-shaped so the client library can read the expiry, but they
// are not signed: this server accepts exactly the tokens it issued.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const TOKEN_TTL_S = 3600;

type User = {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  user_metadata: Record<string, unknown>;
  created_at: string;
};
type Row = Record<string, unknown>;
type Email = { to: string; type: "signup" | "recovery"; link: string; at: string };

const state = {
  users: new Map<string, User>(), // by id
  sessions: new Map<string, { userId: string; refresh: string }>(), // access token -> session
  refreshTokens: new Map<string, string>(), // refresh token -> user id
  codes: new Map<string, { userId: string; type: "signup" | "recovery" }>(), // PKCE auth codes
  verifyTokens: new Map<string, { userId: string; type: "signup" | "recovery"; redirectTo: string }>(),
  tables: {
    profiles: [] as Row[],
    collections: [] as Row[],
    saved_papers: [] as Row[],
    events: [] as Row[],
    papers: [] as Row[],
  },
  emails: [] as Email[],
};

// A table with a null owner column is public to read and writable only by
// the service role (the papers store the nightly job fills).
const OWNER_COLUMN: Record<string, string | null> = {
  profiles: "id",
  collections: "user_id",
  saved_papers: "user_id",
  events: "user_id",
  papers: null,
};
const PRIMARY_KEY: Record<string, string[]> = {
  profiles: ["id"],
  collections: ["id"],
  saved_papers: ["user_id", "paper_id"],
  events: ["id"],
  papers: ["id"],
};
const SERVICE_KEY = "fake-service-key";
let nextEventId = 1;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const now = () => new Date().toISOString();
const b64url = (s: string) => Buffer.from(s).toString("base64url");

function makeJwt(user: User) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
      iat: Math.floor(Date.now() / 1000),
      session_id: randomUUID(),
    }),
  );
  return `${header}.${payload}.fake-signature-${randomUUID().slice(0, 8)}`;
}

function publicUser(user: User) {
  const t = user.confirmed ? user.created_at : null;
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: t,
    confirmed_at: t,
    last_sign_in_at: now(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata,
    identities: [],
    created_at: user.created_at,
    updated_at: now(),
    is_anonymous: false,
  };
}

function issueSession(user: User) {
  const access_token = makeJwt(user);
  const refresh_token = randomUUID();
  state.sessions.set(access_token, { userId: user.id, refresh: refresh_token });
  state.refreshTokens.set(refresh_token, user.id);
  return {
    access_token,
    token_type: "bearer",
    expires_in: TOKEN_TTL_S,
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
    refresh_token,
    user: publicUser(user),
  };
}

function userFromRequest(req: IncomingMessage): User | null {
  const auth = req.headers.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const s = state.sessions.get(token);
  return s ? (state.users.get(s.userId) ?? null) : null;
}

function findUserByEmail(email: string) {
  for (const u of state.users.values()) if (u.email.toLowerCase() === email.toLowerCase()) return u;
  return null;
}

function createProfile(user: User) {
  const display = (user.user_metadata.display_name as string) ?? user.email.split("@")[0];
  state.tables.profiles.push({
    id: user.id,
    display_name: display,
    default_field: "ai-ml",
    interests: [],
    onboarded: false,
    topic_boosts: {},
    created_at: now(),
    updated_at: now(),
  });
}

function recordEmail(user: User, type: "signup" | "recovery", redirectTo: string) {
  const token = randomUUID();
  state.verifyTokens.set(token, { userId: user.id, type, redirectTo });
  const link = `http://localhost:${PORT}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
  state.emails.push({ to: user.email, type, link, at: now() });
  console.log(`[fake-supabase] ${type} email for ${user.email}: ${link}`);
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const authError = (res: ServerResponse, status: number, code: string, msg: string) =>
  send(res, status, { code: status, error_code: code, msg });

// ---------------------------------------------------------------------------
// PostgREST subset
// ---------------------------------------------------------------------------
function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const m = raw.match(/^(eq|neq|in|not\.is|is|ilike|gte|lte|gt|lt|ov)\.([\s\S]*)$/);
    if (!m) continue;
    const [, op, value] = m;
    out = out.filter((r) => {
      const v = r[key];
      switch (op) {
        case "eq": return String(v) === value;
        case "neq": return String(v) !== value;
        case "is": return value === "null" ? v === null || v === undefined : String(v) === value;
        case "not.is": return value === "null" ? !(v === null || v === undefined) : String(v) !== value;
        // Array overlap: tags=ov.{a,b} keeps rows whose array shares a value.
        case "ov": {
          const wanted = value.replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
          return Array.isArray(v) && v.some((x) => wanted.includes(String(x)));
        }
        case "in": return value.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v));
        case "ilike": return new RegExp("^" + value.replace(/%/g, ".*") + "$", "i").test(String(v));
        case "gte": return String(v) >= value;
        case "lte": return String(v) <= value;
        case "gt": return String(v) > value;
        case "lt": return String(v) < value;
        default: return true;
      }
    });
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

function wantsSingle(req: IncomingMessage) {
  return String(req.headers.accept ?? "").includes("vnd.pgrst.object");
}

function rowsResponse(req: IncomingMessage, res: ServerResponse, rows: Row[], status = 200) {
  if (wantsSingle(req)) {
    if (rows.length !== 1) {
      return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${rows.length} rows` });
    }
    return send(res, status, rows[0]);
  }
  return send(res, status, rows);
}

async function handleRest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const table = url.pathname.replace("/rest/v1/", "");

  if (table === "rpc/delete_own_account") {
    const user = userFromRequest(req);
    if (!user) return send(res, 401, { message: "not signed in" });
    deleteUser(user.id);
    return send(res, 204);
  }

  if (table === "rpc/nearest_papers") return handleNearest(req, res);

  if (!(table in state.tables)) return send(res, 404, { message: `table ${table} not found` });
  const rows = state.tables[table as keyof typeof state.tables];
  const owner = OWNER_COLUMN[table];
  const prefer = String(req.headers.prefer ?? "");
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  // The service role sees and writes every row of every table, as it does in
  // a real project, where it bypasses row-level security. Only the nightly
  // job uses it; the app never holds this key.
  if (bearer === SERVICE_KEY) {
    if (req.method === "GET") return rowsResponse(req, res, applyFilters(rows, url.searchParams).map(selected(url)));
    return writeRows(req, res, url, table, rows, rows, null, prefer);
  }

  // Public table: anybody may read it, only the service role may write it.
  if (owner === null) {
    if (req.method === "GET") {
      return rowsResponse(req, res, applyFilters(rows, url.searchParams).map(selected(url)));
    }
    return send(res, 401, { message: "service role required" });
  }

  const user = userFromRequest(req);
  if (!user) return send(res, 401, { message: "JWT required" }); // RLS: anonymous sees nothing
  const mine = rows.filter((r) => r[owner] === user.id);

  if (req.method === "GET") return rowsResponse(req, res, applyFilters(mine, url.searchParams));
  return writeRows(req, res, url, table, rows, mine, { owner, userId: user.id }, prefer);
}

// PostgREST returns a column only when the select lists it. The app relies on
// this for `embedding`, which it asks for separately and never with the rest.
function selected(url: URL) {
  const select = url.searchParams.get("select") ?? "*";
  if (select === "*" || select.includes("embedding")) return (r: Row) => r;
  return (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "embedding"));
}

async function writeRows(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  table: string,
  rows: Row[],
  visible: Row[],
  scope: { owner: string; userId: string } | null,
  prefer: string,
) {

  if (req.method === "POST") {
    const body = await readJson(req);
    const incoming: Row[] = Array.isArray(body) ? body : [body];
    const written: Row[] = [];
    for (const r of incoming) {
      const row: Row = scope ? { ...r, [scope.owner]: scope.userId } : { ...r };
      if (table === "collections" && !row.id) row.id = randomUUID();
      if (table !== "profiles" && !row.created_at && table === "collections") row.created_at = now();
      if (table === "saved_papers" && !row.saved_at) row.saved_at = now();
      if (table === "events") {
        row.id = nextEventId++;
        row.created_at ??= now();
      }
      if (table === "papers") row.fetched_at ??= now();
      const keys = PRIMARY_KEY[table];
      const existingIndex = rows.findIndex((x) => keys.every((k) => x[k] === row[k]));
      if (existingIndex >= 0) {
        if (!prefer.includes("merge-duplicates")) return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
        rows[existingIndex] = { ...rows[existingIndex], ...row };
        written.push(rows[existingIndex]);
      } else {
        rows.push(row);
        written.push(row);
      }
    }
    if (!prefer.includes("return=representation")) return send(res, 201);
    return rowsResponse(req, res, written, 201);
  }

  if (req.method === "PATCH") {
    const patch = await readJson(req);
    const targets = applyFilters(visible, url.searchParams);
    for (const t of targets) Object.assign(t, patch, table === "profiles" ? { updated_at: now() } : {});
    if (!prefer.includes("return=representation")) return send(res, 204);
    return rowsResponse(req, res, targets);
  }

  if (req.method === "DELETE") {
    const targets = new Set(applyFilters(visible, url.searchParams));
    const remaining = rows.filter((r) => !targets.has(r));
    rows.length = 0;
    rows.push(...remaining);
    if (!prefer.includes("return=representation")) return send(res, 204);
    return rowsResponse(req, res, [...targets]);
  }

  return send(res, 405, { message: "method not allowed" });
}

// rpc/nearest_papers: cosine similarity between the query vector and every
// stored embedding, best first. The vectors are unit length, so the dot
// product is the cosine. Papers without an embedding are skipped, exactly as
// the SQL function does.
async function handleNearest(req: IncomingMessage, res: ServerResponse) {
  const { query, n } = await readJson(req);
  const q: number[] = Array.isArray(query) ? query.map(Number) : [];
  const limit = Math.min(Math.max(Number(n ?? 60), 1), 200);
  const scored = state.tables.papers
    .filter((p) => Array.isArray(p.embedding) && (p.embedding as number[]).length === q.length)
    .map((p) => {
      const e = p.embedding as number[];
      let dot = 0;
      for (let i = 0; i < q.length; i++) dot += q[i] * e[i];
      const { embedding: _drop, ...rest } = p;
      return { ...rest, similarity: dot };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return send(res, 200, scored);
}

function deleteUser(userId: string) {
  state.users.delete(userId);
  for (const [k, s] of state.sessions) if (s.userId === userId) state.sessions.delete(k);
  for (const [k, u] of state.refreshTokens) if (u === userId) state.refreshTokens.delete(k);
  for (const table of Object.keys(state.tables) as (keyof typeof state.tables)[]) {
    const owner = OWNER_COLUMN[table];
    if (owner === null) continue; // the papers store belongs to nobody
    state.tables[table] = state.tables[table].filter((r) => r[owner] !== userId) as never;
  }
}

// ---------------------------------------------------------------------------
// GoTrue subset
// ---------------------------------------------------------------------------
async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname.replace("/auth/v1", "");

  if (path === "/signup" && req.method === "POST") {
    const { email, password, data, options } = await readJson(req);
    if (!email || !password) return authError(res, 422, "validation_failed", "Email and password are required");
    if (password.length < 6) return authError(res, 422, "weak_password", "Password should be at least 6 characters.");
    if (findUserByEmail(email)) return authError(res, 422, "user_already_exists", "User already registered");
    const user: User = { id: randomUUID(), email, password, confirmed: false, user_metadata: data ?? {}, created_at: now() };
    state.users.set(user.id, user);
    createProfile(user);
    const redirectTo = options?.emailRedirectTo ?? url.searchParams.get("redirect_to") ?? "http://localhost:3000/auth/callback";
    recordEmail(user, "signup", redirectTo);
    return send(res, 200, { ...publicUser(user), confirmation_sent_at: now() });
  }

  if (path === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const body = await readJson(req);
    if (grant === "password") {
      const user = findUserByEmail(body.email ?? "");
      if (!user || user.password !== body.password) return authError(res, 400, "invalid_credentials", "Invalid login credentials");
      if (!user.confirmed) return authError(res, 400, "email_not_confirmed", "Email not confirmed");
      return send(res, 200, issueSession(user));
    }
    if (grant === "refresh_token") {
      const userId = state.refreshTokens.get(body.refresh_token ?? "");
      const user = userId ? state.users.get(userId) : undefined;
      if (!user) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      return send(res, 200, issueSession(user));
    }
    if (grant === "pkce") {
      const entry = state.codes.get(body.auth_code ?? "");
      const user = entry ? state.users.get(entry.userId) : undefined;
      if (!user) return authError(res, 400, "flow_state_not_found", "invalid flow state, no valid flow state found");
      state.codes.delete(body.auth_code);
      return send(res, 200, issueSession(user));
    }
    return authError(res, 400, "unsupported_grant_type", `unsupported grant ${grant}`);
  }

  if (path === "/verify" && req.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    const entry = state.verifyTokens.get(token);
    if (!entry) return send(res, 302, undefined, { Location: `${url.searchParams.get("redirect_to") ?? "/"}#error=access_denied&error_description=Email+link+is+invalid+or+has+expired` });
    state.verifyTokens.delete(token);
    const user = state.users.get(entry.userId);
    if (!user) return send(res, 404);
    if (entry.type === "signup") user.confirmed = true;
    const code = randomUUID();
    state.codes.set(code, { userId: user.id, type: entry.type });
    const target = new URL(entry.redirectTo);
    target.searchParams.set("code", code);
    if (entry.type === "recovery") target.searchParams.set("type", "recovery");
    return send(res, 302, undefined, { Location: target.toString() });
  }

  if (path === "/recover" && req.method === "POST") {
    const { email, options } = await readJson(req);
    const user = findUserByEmail(email ?? "");
    if (user) recordEmail(user, "recovery", options?.redirectTo ?? url.searchParams.get("redirect_to") ?? "http://localhost:3000/auth/callback");
    return send(res, 200, {}); // same answer whether or not the address exists
  }

  if (path === "/user") {
    const user = userFromRequest(req);
    if (!user) return authError(res, 401, "no_authorization", "invalid claim: missing sub claim");
    if (req.method === "GET") return send(res, 200, publicUser(user));
    if (req.method === "PUT") {
      const body = await readJson(req);
      if (body.password) {
        if (String(body.password).length < 6) return authError(res, 422, "weak_password", "Password should be at least 6 characters.");
        user.password = body.password;
      }
      if (body.data) user.user_metadata = { ...user.user_metadata, ...body.data };
      return send(res, 200, publicUser(user));
    }
  }

  if (path === "/logout" && req.method === "POST") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const s = state.sessions.get(token);
    if (s) {
      state.sessions.delete(token);
      state.refreshTokens.delete(s.refresh);
    }
    return send(res, 204);
  }

  return send(res, 404, { message: `no fake for ${req.method} ${url.pathname}` });
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname === "/_dev/emails") return send(res, 200, state.emails);
    if (url.pathname === "/_dev/reset") {
      state.users.clear(); state.sessions.clear(); state.refreshTokens.clear(); state.codes.clear(); state.verifyTokens.clear();
      state.tables.profiles = []; state.tables.collections = []; state.tables.saved_papers = [];
      state.tables.events = []; state.tables.papers = []; state.emails = [];
      return send(res, 204);
    }
    if (url.pathname.startsWith("/auth/v1/")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) return await handleRest(req, res, url);
    return send(res, 200, {
      ok: true,
      fake: "supabase",
      users: state.users.size,
      events: state.tables.events.length,
      papers: state.tables.papers.length,
    });
  } catch (err) {
    console.error("[fake-supabase]", err);
    return send(res, 500, { message: String(err) });
  }
}).listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}`));
