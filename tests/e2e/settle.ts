import type { Page } from "@playwright/test";

/**
 * Waits for every finite CSS animation and transition on the page to finish. Feedback panels
 * fade in (gf-rise), and axe measures colour contrast on whatever opacity it finds, so a scan
 * started mid-fade reports a contrast failure that no reader ever sees (seen in WebKit in CI).
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
