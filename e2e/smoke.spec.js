import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('dashboard loads and sidebar shows status', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Pipeline overview and quick actions')).toBeVisible();
    await expect(page.getByText(/Live \(API\)|Live \(real-time\)|Offline/)).toBeVisible();
  });

  test('jobs route renders', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByText('Job Applications')).toBeVisible();
  });
});
