import { expect, test } from "@playwright/test";

test("the board lists feedback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await expect(page.getByTestId("feedback-row").first()).toBeVisible();
});

test("search filters the board", async ({ page }) => {
  await page.goto("/?q=Slack");
  await expect(page.getByTestId("feedback-row")).toHaveCount(1);
});

test("a signed-in customer can vote", async ({ page }) => {
  await page.request.post("/api/dev/login?as=lin");
  const created = await page.request.post("/api/feedback", { data: { title: `Vote test ${Date.now()}` } });
  const { item } = await created.json();
  await page.goto(`/feedback/${item.id}`);
  const count = page.getByTestId("vote-count");
  await expect(count).toHaveText("0");

  await page.getByRole("button", { name: "Vote", exact: true }).click();
  await page.waitForTimeout(200);

  expect(Number(await count.textContent())).toBe(1);
});

test("a customer signs in with one click", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue as Ada" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the sort toggle switches between top and newest", async ({ page }) => {
  await page.goto("/?status=open&q=a");
  const sort = page.getByRole("group", { name: "Sort" });
  await expect(sort.getByRole("button", { name: "Top" })).toHaveAttribute("aria-pressed", "true");

  await sort.getByRole("button", { name: "Newest" }).click();
  await expect(page).toHaveURL(/sort=newest/);
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/q=a/);
  await expect(sort.getByRole("button", { name: "Newest" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Planned" }).click();
  await expect(page).toHaveURL(/sort=newest/);

  await sort.getByRole("button", { name: "Top" }).click();
  await expect(page).not.toHaveURL(/sort=/);
});
