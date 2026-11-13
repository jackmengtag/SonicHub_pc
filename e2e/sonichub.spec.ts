import { expect, test } from '@playwright/test';

test('real generation restores after refresh, plays audio and publishes the work', async ({ page }) => {
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('127.0.0.1:8080') && response.status() >= 400) {
      apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: '进入 SonicHub' })).toBeEnabled();
  await page.getByRole('textbox', { name: '验证码 获取验证码' }).fill('1234');
  await page.getByRole('button', { name: '进入 SonicHub' }).click();
  await page.waitForURL('**/discover');
  await expect(page.locator('audio')).toHaveCount(1);

  const title = `PC 验收清晨海边 ${Date.now()}`;
  const resumeGenerationId = process.env.SONICHUB_RESUME_GENERATION || '';
  let generationId = resumeGenerationId;

  if (resumeGenerationId) {
    await page.goto('/create');
    await page.evaluate((id) => localStorage.setItem('sh_active_generation', id), resumeGenerationId);
  } else {
    await page.locator('a[href="/create"]').click();
    await page.locator('#create-prompt').fill(`${title}，木吉他与柔和电子节拍，明亮而放松`);
    await page.locator('#create-lyrics').fill('清晨的风，吹过海边。\n木吉他响起，心情慢慢明亮。');
    await page.getByLabel('情绪 / 氛围（可选）').fill('清晨、海边、放松');
    await page.getByRole('button', { name: '下一步：配置参数' }).click();
    await expect(page.getByRole('button', { name: '15 秒' })).toHaveClass(/is-active/);

    const quoteResponse = page.waitForResponse((response) => (
      response.url().endsWith('/api/v1/credit/quotes') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: '下一步：获取报价' }).click();
    expect((await quoteResponse).status()).toBe(200);
    await expect(page.locator('.price-row.total')).toContainText('合计创作积分');

    await page.locator('.check-row input[type="checkbox"]').first().check();
    const generationResponse = page.waitForResponse((response) => (
      response.url().endsWith('/api/v1/generations') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: /确认并开始生成|重新报价并生成/ }).click();
    const generationPayload = await (await generationResponse).json();
    generationId = generationPayload.data.id as string;
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sh_active_generation'))).toBe(generationId);
  }

  expect(generationId).toBeTruthy();
  await page.reload();
  await expect(page.locator('.gen-log')).toContainText(generationId);
  await page.locator('.gen-result.is-active').waitFor({ timeout: 1_200_000 });
  await expect(page.locator('.gen-stage')).toContainText('STATUS succeeded');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sh_active_generation'))).toBeNull();

  const playButton = page.getByRole('button', { name: '试听真实音频' });
  await expect(playButton).toBeEnabled();
  await playButton.click();
  await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentSrc)).toContain('/media/');

  await page.locator('.result-publish input[placeholder="请输入作品标题"]').fill(title);
  await page.locator('.result-publish input[type="checkbox"]').check();
  const publishResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/works/') && response.url().endsWith('/publish')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '提交审核并发布' }).click();
  expect((await publishResponse).status()).toBe(200);
  await expect(page.getByText('作品已发布', { exact: true }).last()).toBeVisible();

  await page.locator('a[href="/works"]').click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
