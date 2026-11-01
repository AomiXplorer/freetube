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

  test("watch page plays or silently falls back to the embed", async ({ page }) => {
    await page.goto("/watch?v=dQw4w9WgXcQ");
    // Either the native <video> pipeline or the no-cookie embed must be mounted.
    await expect(
      page.locator("main video, main iframe[src*='youtube'], main iframe[src*='youtube-nocookie']").first(),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("main")).toContainText(/Rick Astley/i, { timeout: 45_000 });

    // Users never see implementation labels about which pipeline is running.
    const main = page.locator("main");
    await expect(main).not.toContainText(/Embedded player/i);
    await expect(main).not.toContainText(/Native playback unavailable/i);
    await expect(main).not.toContainText(/Sign in to confirm/i);
  });

  test("player controls appear with the native player", async ({ page }) => {
    await page.goto("/watch?v=dQw4w9WgXcQ");
    await expect(page.locator("main video, main iframe").first()).toBeVisible({ timeout: 45_000 });

    // Anonymous deployments get the embed, which has no custom controls by
    // design; a native stream (signed in) must expose both new toggles.
    if ((await page.locator("main video").count()) === 0) {
      await expect(page.locator("main iframe").first()).toBeVisible();
      return;
    }
    await expect(page.getByRole("button", { name: /audio only/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /picture in picture/i }).first()).toBeVisible();
  });

  test("settings page exposes sign-in, advanced cookies and theme controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dark$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();

    // Cookies are the advanced path now: the field only appears after opting in.
    await expect(page.getByPlaceholder(/SID=/)).toHaveCount(0);
    await page.getByRole("button", { name: /Advanced: paste cookies/i }).click();
    await expect(page.getByPlaceholder(/SID=/)).toBeVisible();

    await page.getByRole("button", { name: /^Dark$/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("device sign-in shows a real Google code", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /Sign in with Google/i }).click();
    const code = page.locator("code").filter({ hasText: /^[A-Z0-9-]{8,}$/ }).first();
    await expect(code).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /google.com\/device/i })).toHaveAttribute(
      "href",
      /google\.com\/device/,
    );
  });

  test("closing the mini player stops playback instead of skipping", async ({ page }) => {
    // Seed a track without needing a signed-in stream: this asserts UI state only.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "freetube-player",
        JSON.stringify({
          state: {
            queue: [{ videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channelName: "Blender" }],
            index: 0,
            playing: true,
            miniOpen: false,
          },
          version: 0,
        }),
      );
    });
    await page.reload();

    const close = page.getByRole("button", { name: /Stop and close mini player/i });
    await expect(close).toBeVisible({ timeout: 15_000 });
    const box = await close.boundingBox();
    // Touch target must stay at least 44x44 CSS px.
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const before = page.url();
    await close.click();
    await expect(close).toHaveCount(0);
    expect(page.url()).toBe(before);
    const queueLength = await page.evaluate(
      () => JSON.parse(localStorage.getItem("freetube-player") ?? "{}")?.state?.queue?.length ?? -1,
    );
    expect(queueLength).toBe(0);
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
