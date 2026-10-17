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

test("double-clicking Vote counts one vote, and Remove vote takes it back", async ({ page }) => {
  await page.request.post("/api/dev/login?as=lin");
  const created = await page.request.post("/api/feedback", { data: { title: `Double vote test ${Date.now()}` } });
  const { item } = await created.json();
  await page.goto(`/feedback/${item.id}`);
  const count = page.getByTestId("vote-count");
  await expect(count).toHaveText("0");

  await page.getByRole("button", { name: "Vote", exact: true }).dblclick();
  await expect(count).toHaveText("1");
  await page.reload();
  await expect(count).toHaveText("1");
  const remove = page.getByRole("button", { name: "Remove vote" });
  await expect(remove).toHaveAttribute("aria-pressed", "true");

  await remove.click();
  await expect(count).toHaveText("0");
  await page.reload();
  await expect(count).toHaveText("0");
  await expect(page.getByRole("button", { name: "Vote", exact: true })).toBeVisible();
});

test("a customer signs in with one click", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue as Ada" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
