// @ts-check
const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const URL         = '/questionnaire.html?yaml=example.yaml';
const STORAGE_KEY = 'qhelper-example-yaml';

// Derive question IDs directly from example.yaml so this file never needs
// editing when questions are added or removed.
const yamlText = fs.readFileSync(
  path.join(__dirname, '..', 'example.yaml'), 'utf8'
);
const questionIds = [...yamlText.matchAll(/^\s+- id: "([QS][\d.]+)"/gm)].map(m => m[1]);
const TOTAL_QUESTIONS = questionIds.length;
const QID = questionIds[0]; // 'Q1.1' — first question, used in most single-question tests

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build an attribute selector for an element by id.
 * Necessary because IDs like "q-Q1.1" contain dots which are invalid in CSS
 * id selectors (#q-Q1.1 would be parsed as id "q-Q1" with class "1").
 */
const byId = /** @param {string} id */ id => `[id="${id}"]`;

/**
 * Navigate to a clean page with no saved state.
 * Uses sessionStorage to guard the cleanup so that only the FIRST navigation
 * per test clears localStorage — subsequent page.reload() calls within a test
 * leave localStorage intact (needed for the persistence tests).
 */
async function loadClean(page) {
  await page.addInitScript(`
    if (!sessionStorage.getItem('__pw_clean_done')) {
      sessionStorage.setItem('__pw_clean_done', '1');
      localStorage.removeItem('${STORAGE_KEY}');
    }
  `);
  await page.goto(URL);
  await page.waitForSelector('.question-block[data-qid]');
}

/** Fill one answer and confirm it. */
async function answerAndConfirm(page, qid, text = 'Test answer') {
  await page.locator(`textarea[data-qid="${qid}"]`).fill(text);
  await page.locator(byId('confirm-' + qid)).check();
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe('Page load', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('renders all questions', async ({ page }) => {
    await expect(page.locator('.question-block[data-qid]')).toHaveCount(TOTAL_QUESTIONS);
  });

  test('TOC has an item for every question', async ({ page }) => {
    await expect(page.locator('.toc-q-item')).toHaveCount(TOTAL_QUESTIONS);
  });

  test('download button is disabled on fresh load', async ({ page }) => {
    await expect(page.locator('#download-btn')).toBeDisabled();
  });

  test('download hint shows all questions pending', async ({ page }) => {
    await expect(page.locator('#download-hint .en-only')).toContainText(
      String(TOTAL_QUESTIONS)
    );
  });

  test('confirm pills are all disabled on fresh load', async ({ page }) => {
    const pills = page.locator('.confirm-pill');
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      await expect(pills.nth(i)).toHaveClass(/disabled/);
    }
  });

  test('no restore banner on fresh load', async ({ page }) => {
    await expect(page.locator('#restore-banner')).toHaveCount(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Language toggle', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('defaults to both languages', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/lang-both/);
  });

  test('English-only hides Chinese elements', async ({ page }) => {
    // Lang-bar is shown after bilingual detection; wait for it
    await page.waitForSelector('#lang-bar:not([style*="display: none"])');
    await page.getByRole('button', { name: 'English Only' }).click();
    await expect(page.locator('body')).toHaveClass(/lang-en/);
    await expect(page.locator('.zh-only').first()).toBeHidden();
  });

  test('Chinese-only hides English elements', async ({ page }) => {
    await page.waitForSelector('#lang-bar:not([style*="display: none"])');
    await page.getByRole('button', { name: '仅中文' }).click();
    await expect(page.locator('body')).toHaveClass(/lang-zh/);
    await expect(page.locator('.en-only').first()).toBeHidden();
  });

  test('switching back to both shows all elements', async ({ page }) => {
    await page.waitForSelector('#lang-bar:not([style*="display: none"])');
    await page.getByRole('button', { name: 'English Only' }).click();
    await page.getByRole('button', { name: 'EN + 中文' }).click();
    await expect(page.locator('body')).toHaveClass(/lang-both/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Answer input', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('confirm pill disabled when textarea is empty', async ({ page }) => {
    await expect(page.locator(byId('confirm-label-' + QID))).toHaveClass(/disabled/);
  });

  test('typing enables the confirm pill', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Hello');
    await expect(page.locator(byId('confirm-label-' + QID))).not.toHaveClass(/disabled/);
  });

  test('typing marks TOC dot as answered (blue)', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Hello');
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-answered/);
  });

  test('question block gets answered background', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Hello');
    await expect(page.locator(byId('q-' + QID))).toHaveClass(/is-answered/);
  });

  test('clearing answer re-disables confirm pill', async ({ page }) => {
    const ta = page.locator(`textarea[data-qid="${QID}"]`);
    await ta.fill('Hello');
    await ta.clear();
    await expect(page.locator(byId('confirm-label-' + QID))).toHaveClass(/disabled/);
  });

  test('clearing answer unchecks confirm if it was checked', async ({ page }) => {
    const ta = page.locator(`textarea[data-qid="${QID}"]`);
    await ta.fill('Hello');
    await page.locator(byId('confirm-' + QID)).check();
    await ta.clear();
    await expect(page.locator(byId('confirm-' + QID))).not.toBeChecked();
  });

  test('clearing answer resets TOC dot to default (red)', async ({ page }) => {
    const ta = page.locator(`textarea[data-qid="${QID}"]`);
    await ta.fill('Hello');
    await ta.clear();
    const item = page.locator(`.toc-q-item[data-qid="${QID}"]`);
    await expect(item).not.toHaveClass(/state-answered/);
    await expect(item).not.toHaveClass(/state-confirmed/);
    await expect(item).not.toHaveClass(/state-skipped/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Skip', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('skipping disables textarea', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator(byId('ans-' + QID))).toBeDisabled();
  });

  test('skipping disables confirm pill', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator(byId('confirm-label-' + QID))).toHaveClass(/disabled/);
  });

  test('skipping marks TOC dot yellow', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-skipped/);
  });

  test('skipping applies yellow background to question block', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator(byId('q-' + QID))).toHaveClass(/is-skipped/);
  });

  test('unskipping re-enables textarea', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await page.locator(byId('skip-' + QID)).uncheck();
    await expect(page.locator(byId('ans-' + QID))).toBeEnabled();
  });

  test('unskipping with empty textarea keeps confirm disabled', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await page.locator(byId('skip-' + QID)).uncheck();
    await expect(page.locator(byId('confirm-label-' + QID))).toHaveClass(/disabled/);
  });

  test('unskipping with pre-existing answer re-enables confirm', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Some text');
    await page.locator(byId('skip-' + QID)).check();
    await page.locator(byId('skip-' + QID)).uncheck();
    await expect(page.locator(byId('confirm-label-' + QID))).not.toHaveClass(/disabled/);
  });

  test('skipping a question with an answer clears the answered TOC state', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Some text');
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-skipped/);
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).not.toHaveClass(/state-answered/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Confirm', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('confirming marks TOC dot green', async ({ page }) => {
    await answerAndConfirm(page, QID);
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-confirmed/);
  });

  test('confirming applies green background to question block', async ({ page }) => {
    await answerAndConfirm(page, QID);
    await expect(page.locator(byId('q-' + QID))).toHaveClass(/is-confirmed/);
  });

  test('unconfirming reverts TOC dot to answered (blue)', async ({ page }) => {
    await answerAndConfirm(page, QID);
    await page.locator(byId('confirm-' + QID)).uncheck();
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-answered/);
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).not.toHaveClass(/state-confirmed/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Progress bar', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('progress label shows totals', async ({ page }) => {
    await expect(page.locator('#toc-prog-label')).toContainText(`/ ${TOTAL_QUESTIONS}`);
  });

  test('answering a question increments the answered count', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('hello');
    await expect(page.locator('#toc-prog-label')).toContainText('1 answered');
  });

  test('confirming a question increments the confirmed count', async ({ page }) => {
    await answerAndConfirm(page, QID);
    await expect(page.locator('#toc-prog-label')).toContainText('1 confirmed');
  });

  test('skipping a question increments the skipped count', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator('#toc-prog-label')).toContainText('1 skipped');
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Download button', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('hint count decreases as questions are completed', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator('#download-hint .en-only')).toContainText(
      String(TOTAL_QUESTIONS - 1)
    );
  });

  test('enabled once every question is skipped', async ({ page }) => {
    for (const cb of await page.locator('input[id^="skip-"]').all()) {
      await cb.check();
    }
    await expect(page.locator('#download-btn')).toBeEnabled();
    await expect(page.locator('#download-hint')).toBeEmpty();
  });

  test('download requires name — shows error when name is empty', async ({ page }) => {
    for (const cb of await page.locator('input[id^="skip-"]').all()) {
      await cb.check();
    }
    await expect(page.locator('#download-btn')).toBeEnabled();
    await page.locator('#download-btn').click();
    await expect(page.locator('#respondent-box')).toHaveClass(/error/);
    await expect(page.locator('#name-error')).toBeVisible();
  });

  test('entering a name clears the name error', async ({ page }) => {
    for (const cb of await page.locator('input[id^="skip-"]').all()) {
      await cb.check();
    }
    await page.locator('#download-btn').click(); // trigger error
    await page.locator('#respondent-name').fill('Alice');
    await expect(page.locator('#respondent-box')).not.toHaveClass(/error/);
    await expect(page.locator('#name-error')).toBeHidden();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('localStorage persistence', () => {
  // These tests deliberately do NOT use loadClean() for subsequent navigations
  // so that state saved by beforeunload can be read back on reload.
  // loadClean() uses a sessionStorage guard so that page.reload() within a test
  // does NOT re-clear localStorage.

  test.beforeEach(({ page }) => loadClean(page));

  test('answer text is restored after reload', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Persistent answer');
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator(`textarea[data-qid="${QID}"]`)).toHaveValue('Persistent answer');
  });

  test('respondent name is restored after reload', async ({ page }) => {
    await page.locator('#respondent-name').fill('Alice');
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator('#respondent-name')).toHaveValue('Alice');
  });

  test('skipped state is restored after reload', async ({ page }) => {
    await page.locator(byId('skip-' + QID)).check();
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator(byId('skip-' + QID))).toBeChecked();
    await expect(page.locator(byId('ans-' + QID))).toBeDisabled();
  });

  test('confirmed state is restored after reload', async ({ page }) => {
    await answerAndConfirm(page, QID);
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator(byId('confirm-' + QID))).toBeChecked();
    await expect(page.locator(`.toc-q-item[data-qid="${QID}"]`)).toHaveClass(/state-confirmed/);
  });

  test('restore banner appears when saved state exists', async ({ page }) => {
    await page.locator('#respondent-name').fill('Alice');
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Some answer');
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator('#restore-banner')).toBeVisible();
  });

  test('no restore banner when nothing was saved', async ({ page }) => {
    // loadClean() already cleared storage, page loaded clean
    await expect(page.locator('#restore-banner')).toHaveCount(0);
  });

  test('discarding saved state clears the form', async ({ page }) => {
    await page.locator('#respondent-name').fill('Alice');
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Some answer');
    await page.reload();
    await page.waitForSelector('#restore-banner');
    await page.locator('.restore-discard-btn').click();
    await expect(page.locator('#respondent-name')).toHaveValue('');
    await expect(page.locator(`textarea[data-qid="${QID}"]`)).toHaveValue('');
    await expect(page.locator('#restore-banner')).toHaveCount(0);
  });

  test('discarded state is not restored on subsequent reload', async ({ page }) => {
    await page.locator('#respondent-name').fill('Alice');
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Some answer');
    await page.reload();
    await page.waitForSelector('#restore-banner');
    await page.locator('.restore-discard-btn').click();
    await page.reload();
    await page.waitForSelector('.question-block[data-qid]');
    await expect(page.locator('#restore-banner')).toHaveCount(0);
    await expect(page.locator(`textarea[data-qid="${QID}"]`)).toHaveValue('');
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Clear All', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('clears all answers and resets form', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('My answer');
    await page.locator(byId('skip-' + QID)).check();

    page.once('dialog', d => d.accept());
    await page.locator('.btn-secondary').click();

    await expect(page.locator(`textarea[data-qid="${QID}"]`)).toHaveValue('');
    await expect(page.locator(byId('skip-' + QID))).not.toBeChecked();
  });

  test('cancelling Clear All preserves data', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('Keep this');
    page.once('dialog', d => d.dismiss());
    await page.locator('.btn-secondary').click();
    await expect(page.locator(`textarea[data-qid="${QID}"]`)).toHaveValue('Keep this');
  });

  test('removes saved state from localStorage', async ({ page }) => {
    await page.locator(`textarea[data-qid="${QID}"]`).fill('My answer');
    page.once('dialog', d => d.accept());
    await page.locator('.btn-secondary').click();
    const stored = await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY);
    expect(stored).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Copy button', () => {
  test.beforeEach(({ page }) => loadClean(page));

  test('every question has a copy button', async ({ page }) => {
    await expect(page.locator('.copy-btn')).toHaveCount(TOTAL_QUESTIONS);
  });

  test('clicking copy writes text to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('.copy-btn').first().click();
    await expect(page.locator('.toast')).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('Q1.1');
  });
});
