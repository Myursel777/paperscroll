import { expect, test, type Page } from "@playwright/test";
import { FIELDS } from "../../lib/arxiv";

// For You v2: the reading history, the ranking blend, and the reader's
// controls. Uses the fake papers API (see feed.spec.ts) and, for the account
// tests, the fake Supabase (see auth.spec.ts: unique addresses, no resets).
//
// The fake papers carry topics on purpose: half are about large language
// models, half about manipulation in robotics, so a reader who acts on one
// group should see that group rise.

const FAKE = "http://localhost:54321";
const uniqueEmail = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const LLM_TOPIC = "llms";
const ROBOT_TOPIC = "manipulation";

function fakePapers(fieldId: string, start: number, max: number) {
  const field = FIELDS.find((f) => f.id === fieldId) ?? FIELDS[0];
  return Array.from({ length: Math.max(0, Math.min(max, 30 - start)) }, (_, i) => {
    const n = start + i;
    const llm = n % 2 === 0;
    return {
      id: `http://arxiv.org/abs/${field.id}.${n}`,
      title: `${llm ? "Language model" : "Robot gripper"} paper ${n}`,
      summary: `Abstract ${n}. `.repeat(20),
      authors: ["A. Author"],
      published: new Date(Date.now() - n * 3_600_000).toISOString(),
      pdfLink: null,
      primaryCategory: field.cats[0],
      categories: field.cats,
      tags: [llm ? LLM_TOPIC : ROBOT_TOPIC],
    };
  });
}

async function mockApi(page: Page) {
  await page.route("**/api/papers**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: { papers: fakePapers(p.get("field") ?? "ai-ml", Number(p.get("start") ?? 0), Number(p.get("max") ?? 12)) },
    });
  });
}

async function emailLink(to: string) {
  for (let i = 0; i < 20; i++) {
    const emails: { to: string; type: string; link: string }[] = await (await fetch(`${FAKE}/_dev/emails`)).json();
    const m = [...emails].reverse().find((e) => e.to === to && e.type === "signup");
    if (m) return m.link;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("no signup email for " + to);
}

async function createConfirmedUser(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await page.goto(await emailLink(email)); // signs in, lands on onboarding
}

const cards = (page: Page) => page.locator("article:not([aria-hidden])");
const forYouButton = (page: Page) => page.getByRole("button", { name: "For You" });

test("For You says why each paper is there", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(cards(page)).toHaveCount(12);

  // Save a language model paper, then open For You.
  await cards(page).nth(0).getByRole("button", { name: "Save" }).click();
  await forYouButton(page).click();

  await expect(cards(page).first()).toContainText(/Because you read about|Close to papers you responded to|New this week/);
});

test("what the reader acts on rises to the top of For You", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(cards(page)).toHaveCount(12);

  // Act on three robot papers (the odd-numbered ones).
  for (const n of [1, 3, 5]) await cards(page).nth(n).getByRole("button", { name: "Save" }).click();

  await forYouButton(page).click();
  await expect(cards(page).first()).toBeVisible();
  const firstFour = await cards(page).evaluateAll((list) => list.slice(0, 4).map((el) => el.textContent ?? ""));
  expect(firstFour.filter((t) => t.includes("Robot gripper")).length).toBeGreaterThanOrEqual(3);
});

test("not interested hides a paper from the next For You, and undo brings it back", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await cards(page).nth(1).getByRole("button", { name: "Save" }).click();
  await forYouButton(page).click();
  await expect(cards(page).first()).toBeVisible();

  const first = cards(page).first();
  const firstTitle = (await first.locator("h2").textContent()) ?? "";

  // The card stays where it is and says so, so the page does not move under
  // the reader's thumb. Undo puts it straight back.
  await first.getByRole("button", { name: /^Not interested in / }).click();
  await expect(first).toContainText("Hidden from For You");
  await first.getByRole("button", { name: "Undo" }).click();
  await expect(first).toContainText("Not interested");

  // Hidden again, the next rebuild of the feed leaves it out.
  await first.getByRole("button", { name: /^Not interested in / }).click();
  await expect(first).toContainText("Hidden from For You");
  await page.getByRole("button", { name: "AI & Machine Learning" }).click();
  await forYouButton(page).click();
  await expect(cards(page).first()).toBeVisible();
  await expect(cards(page).first().locator("h2")).not.toHaveText(firstTitle);
});

test("the reading history follows the account and the sliders can be set", async ({ page }) => {
  await mockApi(page);
  const email = uniqueEmail("foryou");
  await createConfirmedUser(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Skip for now" }).click();

  // Read and save two language model papers.
  await expect(cards(page)).toHaveCount(12);
  await cards(page).nth(0).getByRole("button", { name: "Save" }).click();
  await cards(page).nth(2).getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(2500); // the account flush is delayed and batched

  // A fresh browser state with only the session: the history came from the account.
  await page.evaluate(() => localStorage.clear());
  await page.goto("/account/foryou");
  await expect(page.getByRole("heading", { name: "For You", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Large language models" }).first()).toBeVisible();

  // The slider for that topic saves to the account.
  const slider = page.getByLabel(/Large language models/);
  await slider.fill("2");
  await expect(page.getByText("Much more")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Much more")).toBeVisible();

  // Clearing the history empties the learned list but keeps the saved papers.
  await page.getByRole("button", { name: "Clear reading history" }).click();
  await page.getByRole("button", { name: "Yes, clear it" }).click();
  await expect(page.getByText("Reading history cleared")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Saved · 2$/ })).toBeVisible();
});

test("with a paper store, For You is built from the database and not from arXiv", async ({ page }) => {
  // The store is the table the nightly job fills. It is answered here in the
  // browser rather than seeded into the shared fake, so this test cannot
  // change what the others see.
  const stored = Array.from({ length: 6 }, (_, n) => ({
    id: `http://arxiv.org/abs/store.${n}`,
    title: `Stored language model paper ${n}`,
    summary: `Abstract ${n}. `.repeat(20),
    authors: ["S. Store"],
    published: new Date(Date.now() - n * 86_400_000).toISOString(),
    pdf_link: null,
    primary_category: "cs.LG",
    categories: ["cs.LG"],
    tags: [LLM_TOPIC],
    popularity: 0.5,
  }));
  await page.route("**/rest/v1/papers*", (route) => route.fulfill({ json: stored }));

  const calls: string[] = [];
  await page.route("**/api/papers**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    calls.push(p.toString());
    return route.fulfill({
      json: { papers: fakePapers(p.get("field") ?? "ai-ml", Number(p.get("start") ?? 0), Number(p.get("max") ?? 12)) },
    });
  });

  await page.goto("/");
  await expect(cards(page)).toHaveCount(12);
  await cards(page).nth(0).getByRole("button", { name: "Save" }).click(); // a language model paper
  const before = calls.length;

  await forYouButton(page).click();
  await expect(cards(page).first()).toContainText("Stored language model paper");
  expect(calls.length).toBe(before); // arXiv was not asked at all
});
