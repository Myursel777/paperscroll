import { expect, test, type Page } from "@playwright/test";

// Account flows against the fake Supabase (scripts/fake-supabase.ts), which
// the Playwright config starts on :54321. Emails are not sent; the fake
// records them at /_dev/emails and the tests follow the link a person would.
//
// Tests run in parallel workers (and in several browsers at once) against
// the one fake, so they never reset it. Each test signs up its own unique
// address and only reads emails sent to that address.

const FAKE = "http://localhost:54321";

// Messages the forms show. Scoped to <main> because Next adds its own empty
// role="alert" route announcer outside it.
const alert = (page: Page) => page.locator("main [role=alert]");
const status = (page: Page) => page.locator("main [role=status]");

const uniqueEmail = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function emailLink(to: string, type: "signup" | "recovery") {
  for (let attempt = 0; attempt < 20; attempt++) {
    const emails: { to: string; type: string; link: string }[] = await (await fetch(`${FAKE}/_dev/emails`)).json();
    const match = [...emails].reverse().find((e) => e.to === to && e.type === type);
    if (match) return match.link;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no ${type} email recorded for ${to}`);
}

async function signUp(page: Page, email: string, password = "correct horse") {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
}

async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("signing up sends a confirmation link that signs the user in", async ({ page }) => {
  const email = uniqueEmail("ada");
  await signUp(page, email);
  await page.goto(await emailLink(email, "signup"));

  // The link exchanges its code for a session and sends new users to onboarding.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Your account" })).toHaveText("A");
});

test("a wrong password is refused with a plain message", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, uniqueEmail("nobody"), "nope nope");
  await expect(alert(page)).toHaveText("Wrong email or password.");
});

test("logging in before confirming the email is explained", async ({ page }) => {
  const email = uniqueEmail("eve");
  await signUp(page, email);
  await page.goto("/login");
  await logIn(page, email, "correct horse");
  await expect(alert(page)).toContainText("confirm your email");
});

test("account pages redirect to log in and come back afterwards", async ({ page }) => {
  const email = uniqueEmail("bob");
  await signUp(page, email);
  await page.goto(await emailLink(email, "signup")); // confirms the address

  // Sign out by clearing cookies, then hit a protected page.
  await page.context().clearCookies();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/);

  await logIn(page, email, "correct horse");
  await expect(page).toHaveURL(/\/account/);
});

test("the password reset link lets the user choose a new password", async ({ page }) => {
  const email = uniqueEmail("cy");
  await signUp(page, email, "old password");
  await page.goto(await emailLink(email, "signup"));
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(status(page)).toContainText("a reset link is on its way");

  await page.goto(await emailLink(email, "recovery"));
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel("New password").fill("brand new pass");
  await page.getByLabel("Repeat it").fill("brand new pass");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(status(page)).toContainText("Password updated");

  await page.context().clearCookies();
  await page.goto("/login");
  await logIn(page, email, "brand new pass");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Your account" })).toBeVisible();
});

test("without a session the reset page explains the link expired", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired." })).toBeVisible();
});
