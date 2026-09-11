import { expect, test, type Page } from "@playwright/test";
import { FIELDS } from "../../lib/arxiv";

// Saved papers follow the account. Uses the fake Supabase (see auth.spec.ts
// for the conventions: unique addresses, no resets) and the fake papers API
// (see feed.spec.ts).

const FAKE = "http://localhost:54321";
const uniqueEmail = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}@example.com`;

function fakePapers(fieldId: string, start: number, max: number) {
  const field = FIELDS.find((f) => f.id === fieldId) ?? FIELDS[0];
  return Array.from({ length: Math.min(max, 30 - start) }, (_, i) => {
    const n = start + i;
    return {
      id: `http://arxiv.org/abs/${field.id}.${n}`,
      title: `${field.label} paper ${n}`,
      summary: `Abstract ${n}. `.repeat(20),
      authors: ["A. Author"],
      published: new Date(Date.now() - n * 3_600_000).toISOString(),
      pdfLink: null,
      primaryCategory: field.cats[0],
      categories: field.cats,
      tags: [],
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
  await page.getByLabel("Name").fill("Sam");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await page.goto(await emailLink(email)); // signs in
}

const cards = (page: Page) => page.locator("article:not([aria-hidden])");
const savedCounter = (page: Page) => page.getByRole("button", { name: /^Saved · \d+$/ });

test("a paper saved while logged out is merged into the account on first login", async ({ page }) => {
  await mockApi(page);
  const email = uniqueEmail("merge");

  // Logged out: save paper 0 locally.
  await page.goto("/");
  await cards(page).first().getByRole("button", { name: "Save" }).click();
  await expect(savedCounter(page)).toHaveText("Saved · 1");

  // Create the account in the same browser and confirm it.
  await createConfirmedUser(page, email);
  await page.goto("/");
  await expect(savedCounter(page)).toHaveText("Saved · 1");

  // Wipe the browser copy: the account must still have the paper.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(savedCounter(page)).toHaveText("Saved · 1");
  await expect(cards(page).first().getByRole("button", { name: "Saved" })).toBeVisible();
});

test("saves and removals while signed in reach the account", async ({ page }) => {
  await mockApi(page);
  const email = uniqueEmail("sync");
  await createConfirmedUser(page, email);

  await page.goto("/");
  await cards(page).nth(0).getByRole("button", { name: "Save" }).click();
  await cards(page).nth(1).getByRole("button", { name: "Save" }).click();
  await expect(savedCounter(page)).toHaveText("Saved · 2");
  await cards(page).nth(0).getByRole("button", { name: "Saved" }).click(); // un-save paper 0
  await expect(savedCounter(page)).toHaveText("Saved · 1");

  // A fresh browser state with only the session: the account's copy is what shows.
  await page.waitForTimeout(500); // background writes
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(savedCounter(page)).toHaveText("Saved · 1");
  await expect(cards(page).nth(1).getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(cards(page).nth(0).getByRole("button", { name: "Save" })).toBeVisible();
});
