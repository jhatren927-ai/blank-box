import { expect, test } from '@playwright/test'

test('master control stocks, fixes, and automates a lineup', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
  await page.getByTestId('nav-master').click()
  await expect(page.getByTestId('master-control')).toBeVisible()

  await page.getByTestId('mc-new-name').fill('duck pond')
  await page.getByTestId('mc-create-channel').click()
  await expect(page.getByRole('tab').first()).toContainText('DUCK')

  await page.getByTestId('mc-search-input').fill('duck')
  await page.getByTestId('mc-search-go').click()
  await expect(page.getByTestId('mc-hit').first()).toBeVisible({ timeout: 45_000 })
  await page.screenshot({ path: '/opt/cursor/artifacts/master-control-builder.png' })

  const adds = page.getByTestId('mc-hit-add')
  const total = await adds.count()
  let added = 0
  for (let index = 0; index < total && added < 2; index++) {
    await adds.nth(index).click()
    added += 1
    await expect(page.getByTestId('mc-tape-count')).toContainText(`${added} tapes`, { timeout: 40_000 })
  }
  expect(added).toBe(2)
  await page.screenshot({ path: '/opt/cursor/artifacts/master-control-tapes.png' })

  await page.getByRole('button', { name: 'Pull' }).first().click()
  await expect(page.getByRole('button', { name: 'Put back' })).toBeVisible()
  await page.getByRole('button', { name: 'Put back' }).click()
  await expect(page.getByTestId('mc-tape-count')).toContainText('2 tapes')

  await page.getByTestId('mc-new-name').fill('copy pond')
  await page.getByTestId('mc-create-channel').click()
  await expect(page.getByRole('tab', { name: /COPY/ })).toBeVisible()
  await page.getByTestId('mc-search-go').click()
  await expect(page.getByTestId('mc-hit').first()).toBeVisible({ timeout: 45_000 })
  await page.getByTestId('mc-hit-add').first().click()
  await expect(page.getByTestId('mc-tape-count')).toContainText('1 tapes', { timeout: 40_000 })
  await expect(page.getByTestId('mc-dup-fix')).toBeVisible()
  await page.getByTestId('mc-dup-fix').click()
  await expect(page.getByTestId('mc-dup-empty')).toBeVisible()

  await page.getByRole('tab', { name: /DUCK/ }).click()
  const row = page.getByTestId('mc-tape').first()
  await row.locator('select').selectOption({ index: 1 })
  await row.getByRole('button', { name: 'Move' }).click()
  await page.getByRole('tab', { name: /COPY/ }).click()
  await page.getByTestId('mc-merge-into').selectOption({ index: 1 })
  await page.getByTestId('mc-merge').click()
  await expect(page.getByTestId('signed-off-list')).toBeVisible()
  await expect(page.getByRole('tab', { name: /COPY/ })).toHaveCount(0)

  await page.getByTestId('mc-edit-name').fill('Duck Theater')
  await page.getByTestId('mc-edit-tagline').fill('Quack all night')
  await page.getByTestId('mc-edit-call').fill('QUACK')
  await page.getByTestId('mc-save-channel').click()
  await expect(page.getByRole('tab')).toContainText('QUACK')

  await page.getByRole('button', { name: 'Watch' }).click()
  await expect(page.getByTestId('guide-row')).toHaveCount(1)
  await expect(page.getByTestId('playback')).toHaveAttribute('data-state', 'playing', { timeout: 60_000 })

  await page.getByTestId('nav-master').click()
  await page.getByTestId('mc-rule-include').fill('zzzzzz')
  await page.getByTestId('mc-rule-save').click()
  await expect(page.getByTestId('mc-verdict')).toContainText(/[1-9] fail/)
  await page.screenshot({ path: '/opt/cursor/artifacts/master-control-rules.png' })
  await page.getByTestId('mc-cleanup').click()
  await expect(page.getByRole('button', { name: 'Put back' }).first()).toBeVisible()
  await page.getByTestId('mc-undo').click()
  await expect(page.getByTestId('mc-tape-count')).toContainText('2 tapes')
  await page.getByRole('button', { name: 'Turn off' }).click()

  await page.getByTestId('mc-preset-autofill').click()
  await page.getByTestId('mc-auto-query').fill('duck')
  await page.getByTestId('mc-auto-target').fill('4')
  await page.getByTestId('mc-auto-save').click()
  await page.getByTestId('mc-auto-run').click()
  await expect(page.getByTestId('mc-auto-log')).toContainText(/Added|already full/, { timeout: 60_000 })

  expect(pageErrors).toEqual([])
})
