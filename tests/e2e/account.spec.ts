import { expect, test, type Page } from "@playwright/test";
import { FIELDS } from "../../lib/arxiv";

// Onboarding, account pages, and the library, against the fake Supabase.
// Same conventions as auth.spec.ts: unique addresses, no shared resets.

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

/** Signs up, confirms, and lands on onboarding. */
async function freshUser(page: Page, name = "Ada") {
  const email = uniqueEmail("acct");
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await page.goto(await emailLink(email));
  await expect(page).toHaveURL(/\/onboarding/);
  return email;
}

const status = (page: Page) => page.locator("main [role=status]");
const cards = (page: Page) => page.locator("article:not([aria-hidden])");

test("onboarding picks a default field and topics, and the feed opens there", async ({ page }) => {
  await mockApi(page);
  await freshUser(page);

  await page.getByRole("button", { name: "Computer Vision" }).click();
  for (const t of ["3D vision", "Video understanding", "Medical imaging"]) {
    await page.getByRole("button", { name: t }).click();
  }
  await page.getByRole("button", { name: "Start reading" }).click();

  await expect(page).toHaveURL("/");
  await expect(cards(page).first()).toContainText("Computer Vision paper 0");
  await expect(page.getByRole("group", { name: "Field of study" }).getByRole("button", { name: "Computer Vision" })).toHaveAttribute("aria-pressed", "true");
});

test("onboarding insists on three topics", async ({ page }) => {
  await freshUser(page);
  await page.getByRole("button", { name: "Large language models" }).click();
  await page.getByRole("button", { name: "Start reading" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("at least 3 topics");
});

test("the profile name changes the header initial, and settings remember interests", async ({ page }) => {
  await mockApi(page);
  await freshUser(page, "Ada");

  await page.goto("/account");
  await expect(page.getByLabel("Name")).toHaveValue("Ada");
  await page.getByLabel("Name").fill("Zed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText("Saved.");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Your account" })).toHaveText("Z");

  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Robotics", exact: true }).click();
  await page.getByRole("button", { name: "Manipulation" }).click();
  await page.getByRole("button", { name: "Locomotion" }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(status(page)).toHaveText("Saved.");

  await page.reload();
  await expect(page.getByRole("button", { name: "Robotics", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Manipulation" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Locomotion" })).toHaveAttribute("aria-pressed", "true");
});

test("the library files saved papers into collections", async ({ page }) => {
  await mockApi(page);
  await freshUser(page);

  await page.goto("/");
  await cards(page).nth(0).getByRole("button", { name: "Save" }).click();
  await cards(page).nth(1).getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Saved · 2" }).click();
  await page.getByRole("link", { name: "Open library" }).click();
  await expect(page).toHaveURL(/\/saved/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator("main li")).toHaveCount(2);

  // New collection, file one paper into it, filter by it.
  await page.getByLabel("New collection name").fill("To read");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: /^To read \(0\)$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main li")).toHaveCount(0);

  await page.getByRole("button", { name: /^All \(2\)$/ }).click();
  await page.locator("main li").first().getByRole("combobox").selectOption({ label: "To read" });
  await expect(page.getByRole("button", { name: /^To read \(1\)$/ })).toBeVisible();
  await page.getByRole("button", { name: /^To read \(1\)$/ }).click();
  await expect(page.locator("main li")).toHaveCount(1);

  // Search narrows the list.
  await page.getByRole("button", { name: /^All \(2\)$/ }).click();
  await page.getByLabel("Search saved papers").fill("paper 1");
  await expect(page.locator("main li")).toHaveCount(1);
  await expect(page.locator("main li").first()).toContainText("paper 1");
});

test("changing the password and deleting the account both take effect", async ({ page }) => {
  const email = await freshUser(page);

  await page.goto("/account/security");
  await page.getByLabel("New password").fill("second password");
  await page.getByLabel("Repeat it").fill("second password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(status(page)).toHaveText("Password changed.");

  await page.goto("/account/data");
  await page.getByLabel("Confirmation").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("second password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Wrong email or password.");
});
