import { expect, test, type Page } from "@playwright/test";
import { FIELDS } from "../../lib/arxiv";

// The main user journey: open the feed, switch field, save a paper, open
// "For You", use the keyboard, recover from an error.
//
// /api/papers is answered by a fake inside the browser, so these tests are
// deterministic and never call arXiv. Each field pretends to have 30 papers.

const PER_FIELD = 30;

function fakePapers(fieldId: string, start: number, max: number) {
  const field = FIELDS.find((f) => f.id === fieldId) ?? FIELDS[0];
  const count = Math.max(0, Math.min(max, PER_FIELD - start));
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return {
      id: `http://arxiv.org/abs/${field.id}.${n}`,
      title: `${field.label} paper ${n}`,
      summary: `Abstract sentence ${n}. `.repeat(25),
      authors: ["A. Author", "B. Author"],
      published: new Date(Date.now() - n * 3_600_000).toISOString(),
      pdfLink: `http://arxiv.org/pdf/${field.id}.${n}`,
      primaryCategory: field.cats[0],
    };
  });
}

/** Answer /api/papers from the fake and record every request's query string. */
async function mockApi(page: Page) {
  const calls: URLSearchParams[] = [];
  await page.route("**/api/papers**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    calls.push(params);
    const papers = fakePapers(
      params.get("field") ?? "ai-ml",
      Number(params.get("start") ?? 0),
      Number(params.get("max") ?? 12),
    );
    return route.fulfill({ json: { papers } });
  });
  return calls;
}

const cards = (page: Page) => page.locator("article:not([aria-hidden])");
const feedScrollTop = (page: Page) => page.locator(".feed").evaluate((el) => el.scrollTop);

test("loads one page and stays on the first card", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/");

  await expect(cards(page)).toHaveCount(12);
  await expect(cards(page).first()).toContainText("AI & Machine Learning paper 0");

  // Give a runaway infinite scroll time to show itself. It must not.
  await page.waitForTimeout(1500);
  expect(await feedScrollTop(page)).toBeLessThan(200);
  expect(calls.some((c) => c.get("start") === "12")).toBe(false);
});

test("switching field shows that field's papers", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Language & NLP" }).click();

  await expect(cards(page).first()).toContainText("Language & NLP paper 0");
  await expect(cards(page).first().locator("header")).toContainText("Language & NLP");
});

test("saving a paper updates the counter and the drawer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  await cards(page).first().getByRole("button", { name: "Save" }).click();
  await expect(cards(page).first().getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saved · 1" })).toBeVisible();

  await page.getByRole("button", { name: "Saved · 1" }).click();
  await expect(page.getByRole("dialog")).toContainText("AI & Machine Learning paper 0");
});

test("For You builds a feed from the saved fields", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/");
  await cards(page).first().getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "For You" }).click();

  // The pool is the saved paper's field, 20 candidates, minus the saved paper.
  await expect(cards(page)).toHaveCount(19);
  expect(calls.some((c) => c.get("max") === "20")).toBe(true);
});

test("arrow keys move one card at a time", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(cards(page)).toHaveCount(12);

  const before = await feedScrollTop(page);
  const cardHeight = await cards(page).first().evaluate((el) => el.getBoundingClientRect().height);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => feedScrollTop(page)).toBeGreaterThan(before + cardHeight * 0.9);

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => feedScrollTop(page)).toBeLessThan(before + cardHeight * 0.1 + 1);
});

test("an API error shows a message and Try again recovers", async ({ page }) => {
  let failing = true;
  await page.route("**/api/papers**", (route) => {
    if (failing) {
      return route.fulfill({
        status: 503,
        json: { papers: [], error: "arXiv is rate limiting us right now. Try again in about 60 seconds." },
      });
    }
    return route.fulfill({ json: { papers: fakePapers("ai-ml", 0, 12) } });
  });

  await page.goto("/");
  await expect(page.getByText("arXiv is rate limiting us right now")).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(cards(page)).toHaveCount(12);
});
