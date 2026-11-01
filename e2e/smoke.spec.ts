import { expect, test, type Page } from "@playwright/test";

/** The desktop search field and the mobile overlay field are different elements. */
const visibleSearchInput = (page: Page) => page.locator('input[placeholder="Search"]:visible').first();

async function openSearch(page: Page) {
  const input = visibleSearchInput(page);
  if (!(await input.isVisible())) {
    await page.getByRole("button", { name: "Search" }).first().click();
  }
  return visibleSearchInput(page);
}

test.describe("Freetube shell", () => {
  test("home renders the shell and content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Freetube/i }).first()).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    // Feed cards, the empty state or the network-error state - never a blank page.
    await expect(page.locator("main").getByRole("link").first()).toBeVisible({ timeout: 30_000 });
  });

  test("search flow submits and renders results", async ({ page }) => {
    await page.goto("/");
    const input = await openSearch(page);
    await expect(input).toBeVisible();
    await input.fill("big buck bunny");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.locator("main")).toContainText(/Videos|No results|Search failed/i, {
      timeout: 30_000,
    });
  });

  test("watch page plays or falls back to the embed", async ({ page }) => {
    await page.goto("/watch?v=dQw4w9WgXcQ");
    // Either the native <video> pipeline or the no-cookie embed must be mounted.
    await expect(
      page.locator("main video, main iframe[src*='youtube'], main iframe[src*='youtube-nocookie']").first(),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("main")).toContainText(/Rick Astley/i, { timeout: 45_000 });
  });

  test("settings page exposes cookie connect and theme controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dark$/ })).toBeVisible();
    await expect(page.getByPlaceholder(/SID=/)).toBeVisible();
    await page.getByRole("button", { name: /^Dark$/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("installable manifest is served", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = (await response.json()) as {
      name: string;
      display: string;
      display_override?: string[];
      icons: { src: string }[];
    };
    expect(manifest.name).toBe("Freetube");
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toContain("window-controls-overlay");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });
});
