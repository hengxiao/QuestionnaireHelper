// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const URL = '/reader.html?yaml=example.yaml';

// ── Fixtures ───────────────────────────────────────────────────────────────
// Uses only question IDs present in example.yaml: Q1.1, Q1.2, Q2.1, S1

const ALICE_YAML = `
meta:
  respondent: Alice
  timestamp: '2024-01-15T10:00:00.000Z'
  questionnaire: Sample Feedback Survey
answers:
  Q1.1: Alice answer to Q1.1
  Q2.1: Alice answer to Q2.1
confirmed:
  - Q1.1
skipped:
  - Q1.2
`.trim();

const BOB_YAML = `
meta:
  respondent: Bob
  timestamp: '2024-01-16T11:00:00.000Z'
  questionnaire: Sample Feedback Survey
answers:
  Q1.1: Bob answer to Q1.1
confirmed: []
skipped:
  - Q2.1
`.trim();

let aliceFile, bobFile;

test.beforeAll(() => {
  aliceFile = path.join(os.tmpdir(), 'qhelper-test-alice.yaml');
  bobFile   = path.join(os.tmpdir(), 'qhelper-test-bob.yaml');
  fs.writeFileSync(aliceFile, ALICE_YAML);
  fs.writeFileSync(bobFile,   BOB_YAML);
});

test.afterAll(() => {
  [aliceFile, bobFile].forEach(f => { try { fs.unlinkSync(f); } catch {} });
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadFile(page, filePath) {
  await page.locator('#file-input').setInputFiles(filePath);
  await page.waitForSelector('.section-card');
}

// ──────────────────────────────────────────────────────────────────────────

test.describe('Initial state', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL); });

  test('shows empty state prompt', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('stats panel is hidden', async ({ page }) => {
    await expect(page.locator('#stats-panel')).toBeHidden();
  });

  test('filter bar is hidden', async ({ page }) => {
    await expect(page.locator('#filter-bar')).toBeHidden();
  });

  test('jump nav is hidden', async ({ page }) => {
    await expect(page.locator('#jump-nav')).toBeHidden();
  });

  test('clear button is hidden', async ({ page }) => {
    await expect(page.locator('#clear-btn')).toBeHidden();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Loading a file', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await loadFile(page, aliceFile);
  });

  test('shows file in file list with respondent name', async ({ page }) => {
    await expect(page.locator('.file-tag')).toHaveCount(1);
    await expect(page.locator('.respondent')).toContainText('Alice');
  });

  test('shows stats panel', async ({ page }) => {
    await expect(page.locator('#stats-panel')).toBeVisible();
  });

  test('shows filter bar', async ({ page }) => {
    await expect(page.locator('#filter-bar')).toBeVisible();
  });

  test('shows clear button', async ({ page }) => {
    await expect(page.locator('#clear-btn')).toBeVisible();
  });

  test('respondent count stat is 1', async ({ page }) => {
    await expect(page.locator('.stat-num').first()).toHaveText('1');
  });

  test('renders section cards', async ({ page }) => {
    const cards = await page.locator('.section-card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test("shows Alice's answer for Q1.1", async ({ page }) => {
    await expect(page.locator('[data-qid="Q1.1"] .answer-text')).toContainText('Alice answer to Q1.1');
  });

  test('shows confirmed badge for Q1.1', async ({ page }) => {
    const q1card = page.locator('[data-qid="Q1.1"]');
    await expect(q1card.locator('.answered-badge').filter({ hasText: /confirmed|已确认/ })).toBeVisible();
  });

  test('shows skipped badge for Q1.2', async ({ page }) => {
    const q12card = page.locator('[data-qid="Q1.2"]');
    await expect(q12card.locator('.answer-count-bar')).toContainText(/skipped|已跳过/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Multiple files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await loadFile(page, aliceFile);
    await page.locator('#file-input').setInputFiles(bobFile);
    await page.waitForFunction(() =>
      document.querySelectorAll('.file-tag').length === 2
    );
  });

  test('shows two files in list', async ({ page }) => {
    await expect(page.locator('.file-tag')).toHaveCount(2);
  });

  test('respondent count stat is 2', async ({ page }) => {
    await expect(page.locator('.stat-num').first()).toHaveText('2');
  });

  test('Q1.1 shows answers from both respondents', async ({ page }) => {
    const answers = page.locator('[data-qid="Q1.1"] .answer-text');
    await expect(answers).toHaveCount(2);
    await expect(answers.first()).toContainText('answer to Q1.1');
  });

  test('Q1.1 shows answered count 2/2', async ({ page }) => {
    await expect(
      page.locator('[data-qid="Q1.1"] .answered-badge').first()
    ).toContainText('2 / 2');
  });

  test('removing one file reduces respondent count to 1', async ({ page }) => {
    await page.locator('.remove-btn').first().click();
    await expect(page.locator('.file-tag')).toHaveCount(1);
    await expect(page.locator('.stat-num').first()).toHaveText('1');
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Filter and search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await loadFile(page, aliceFile);
  });

  test('filter "answered" hides unanswered questions', async ({ page }) => {
    await page.selectOption('#filter-mode', 'answered');
    const unanswered = page.locator('.question-block.q-unanswered');
    if (await unanswered.count() > 0) {
      await expect(unanswered.first()).toBeHidden();
    }
  });

  test('filter "unanswered" hides answered questions', async ({ page }) => {
    await page.selectOption('#filter-mode', 'unanswered');
    const answered = page.locator('.question-block.q-answered');
    if (await answered.count() > 0) {
      await expect(answered.first()).toBeHidden();
    }
  });

  test('search by question ID shows only matching questions', async ({ page }) => {
    await page.locator('#search-box').fill('Q1.1');
    const visibleBlocks = await page.locator('.question-block[data-qid]:visible').count();
    const q1block = page.locator('[data-qid="Q1.1"]');
    await expect(q1block).toBeVisible();
    // There should be fewer visible blocks than total questions (4)
    expect(visibleBlocks).toBeLessThan(4);
  });

  test('clearing search restores all sections', async ({ page }) => {
    await page.locator('#search-box').fill('Q1.1');
    await page.locator('#search-box').clear();
    await expect(page.locator('.section-card').first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Collapsible sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await loadFile(page, aliceFile);
  });

  test('clicking section header collapses it', async ({ page }) => {
    const header = page.locator('.section-toggle').first();
    const body   = page.locator('.section-body').first();
    await header.click();
    await expect(body).toBeHidden();
  });

  test('clicking collapsed section header expands it', async ({ page }) => {
    const header = page.locator('.section-toggle').first();
    const body   = page.locator('.section-body').first();
    await header.click(); // collapse
    await header.click(); // expand
    await expect(body).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Clear All', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await loadFile(page, aliceFile);
  });

  test('clears all files and shows empty state', async ({ page }) => {
    await page.locator('#clear-btn').click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.file-tag')).toHaveCount(0);
  });

  test('hides controls after clearing', async ({ page }) => {
    await page.locator('#clear-btn').click();
    await expect(page.locator('#stats-panel')).toBeHidden();
    await expect(page.locator('#filter-bar')).toBeHidden();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Language toggle', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL); });

  test('defaults to both languages', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/lang-both/);
  });

  test('English-only mode works', async ({ page }) => {
    // Wait for lang-bar to appear (shown after bilingual YAML loads)
    await page.waitForSelector('#lang-bar:not([style*="display: none"])');
    await page.getByRole('button', { name: 'English Only' }).click();
    await expect(page.locator('body')).toHaveClass(/lang-en/);
  });

  test('Chinese-only mode works', async ({ page }) => {
    await page.waitForSelector('#lang-bar:not([style*="display: none"])');
    await page.getByRole('button', { name: '仅中文' }).click();
    await expect(page.locator('body')).toHaveClass(/lang-zh/);
  });
});
