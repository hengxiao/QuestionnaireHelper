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

  test('download hint shows pending questions (excludes disabled conditionals)', async ({ page }) => {
    // Q2.5 is a conditional question that starts disabled, so it's excluded from the pending count.
    await expect(page.locator('#download-hint .en-only')).toContainText(
      String(TOTAL_QUESTIONS - 1)
    );
  });

  test('confirm pills are disabled on fresh load for non-ranking questions', async ({ page }) => {
    // Ranking questions (Q2.4) start with a seeded answer so their confirm pill is enabled.
    // All other question types start with no answer and should have a disabled confirm pill.
    const nonRankingPills = page.locator('.question-block:not([data-qid="Q2.4"]) .confirm-pill');
    const count = await nonRankingPills.count();
    for (let i = 0; i < count; i++) {
      await expect(nonRankingPills.nth(i)).toHaveClass(/disabled/);
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

  test('progress label shows totals (excludes disabled conditionals)', async ({ page }) => {
    // Q2.5 is a conditional question that starts disabled, so it's excluded from the progress count.
    await expect(page.locator('#toc-prog-label')).toContainText(`/ ${TOTAL_QUESTIONS - 1}`);
  });

  test('answering a question increments the answered count', async ({ page }) => {
    // Q2.4 (ranking) starts pre-seeded with a default answer,
    // so before typing we already have 1 answered. After typing in QID we get 2.
    const before = await page.locator('#toc-prog-label').textContent();
    const beforeCount = parseInt((before.match(/(\d+) answered/) || ['0','0'])[1]);
    await page.locator(`textarea[data-qid="${QID}"]`).fill('hello');
    await expect(page.locator('#toc-prog-label')).toContainText(`${beforeCount + 1} answered`);
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
    // Start: TOTAL_QUESTIONS - 1 pending (Q2.5 disabled conditional excluded).
    // After skipping QID: TOTAL_QUESTIONS - 2 pending.
    await page.locator(byId('skip-' + QID)).check();
    await expect(page.locator('#download-hint .en-only')).toContainText(
      String(TOTAL_QUESTIONS - 2)
    );
  });

  test('enabled once every non-disabled question is skipped', async ({ page }) => {
    // Q2.5 is a conditional question that starts disabled — it's excluded from pending count.
    // Skip all the others; the download button should become enabled.
    const allQids = await page.evaluate(() =>
      [...document.querySelectorAll('.question-block[data-qid]')]
        .filter(b => !b.closest('.cond-disabled'))
        .map(b => b.dataset.qid)
    );
    for (const qid of allQids) {
      await page.locator(`[id="skip-${qid}"]`).check();
    }
    await expect(page.locator('#download-btn')).toBeEnabled();
    await expect(page.locator('#download-hint')).toBeEmpty();
  });

  test('download requires name — shows error when name is empty', async ({ page }) => {
    const allQids = await page.evaluate(() =>
      [...document.querySelectorAll('.question-block[data-qid]')]
        .filter(b => !b.closest('.cond-disabled'))
        .map(b => b.dataset.qid)
    );
    for (const qid of allQids) {
      await page.locator(`[id="skip-${qid}"]`).check();
    }
    await expect(page.locator('#download-btn')).toBeEnabled();
    await page.locator('#download-btn').click();
    await expect(page.locator('#respondent-box')).toHaveClass(/error/);
    await expect(page.locator('#name-error')).toBeVisible();
  });

  test('entering a name clears the name error', async ({ page }) => {
    const allQids = await page.evaluate(() =>
      [...document.querySelectorAll('.question-block[data-qid]')]
        .filter(b => !b.closest('.cond-disabled'))
        .map(b => b.dataset.qid)
    );
    for (const qid of allQids) {
      await page.locator(`[id="skip-${qid}"]`).check();
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

// ──────────────────────────────────────────────────────────────────────────

test.describe('Single-choice (Q1.3)', () => {
  test.beforeEach(({ page }) => loadClean(page));

  const QID_SC = 'Q1.3';

  test('clicking an option enables the confirm pill', async ({ page }) => {
    await page.locator(`[id="q-${QID_SC}"] .choice-option`).first().click();
    await expect(page.locator(byId('confirm-label-' + QID_SC))).not.toHaveClass(/disabled/);
  });

  test('clicking an option marks TOC dot as answered', async ({ page }) => {
    await page.locator(`[id="q-${QID_SC}"] .choice-option`).first().click();
    await expect(page.locator(`.toc-q-item[data-qid="${QID_SC}"]`)).toHaveClass(/state-answered/);
  });

  test('confirm after selecting an option marks TOC dot green', async ({ page }) => {
    await page.locator(`[id="q-${QID_SC}"] .choice-option`).first().click();
    await page.locator(byId('confirm-' + QID_SC)).check();
    await expect(page.locator(`.toc-q-item[data-qid="${QID_SC}"]`)).toHaveClass(/state-confirmed/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Score (Q1.4)', () => {
  test.beforeEach(({ page }) => loadClean(page));

  const QID_SCORE = 'Q1.4';

  test('clicking a star enables the confirm pill', async ({ page }) => {
    // Click the 3rd star (value=3) — use attribute selector to avoid dot-in-id CSS issue
    await page.locator(`[id="stars-${QID_SCORE}"] .star-btn`).nth(2).click();
    await expect(page.locator(byId('confirm-label-' + QID_SCORE))).not.toHaveClass(/disabled/);
  });

  test('clicking a star marks TOC dot as answered', async ({ page }) => {
    await page.locator(`[id="stars-${QID_SCORE}"] .star-btn`).nth(2).click();
    await expect(page.locator(`.toc-q-item[data-qid="${QID_SCORE}"]`)).toHaveClass(/state-answered/);
  });

  test('re-clicking the same star deselects it', async ({ page }) => {
    const star = page.locator(`[id="stars-${QID_SCORE}"] .star-btn`).nth(2);
    await star.click();
    await expect(page.locator(byId('confirm-label-' + QID_SCORE))).not.toHaveClass(/disabled/);
    await star.click();
    await expect(page.locator(byId('confirm-label-' + QID_SCORE))).toHaveClass(/disabled/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Multiple-choice (Q2.2)', () => {
  test.beforeEach(({ page }) => loadClean(page));

  const QID_MC = 'Q2.2';

  test('checking a box enables the confirm pill', async ({ page }) => {
    // Use .choice-option input to target only choice checkboxes (not skip/confirm)
    await page.locator(`[id="q-${QID_MC}"] .choice-option input[type="checkbox"]`).first().check();
    await expect(page.locator(byId('confirm-label-' + QID_MC))).not.toHaveClass(/disabled/);
  });

  test('unchecking all boxes removes the answer and disables confirm', async ({ page }) => {
    const cb = page.locator(`[id="q-${QID_MC}"] .choice-option input[type="checkbox"]`).first();
    await cb.check();
    await cb.uncheck();
    await expect(page.locator(byId('confirm-label-' + QID_MC))).toHaveClass(/disabled/);
  });

  test('checking multiple boxes marks TOC dot as answered', async ({ page }) => {
    const checkboxes = page.locator(`[id="q-${QID_MC}"] .choice-option input[type="checkbox"]`);
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await expect(page.locator(`.toc-q-item[data-qid="${QID_MC}"]`)).toHaveClass(/state-answered/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('True-False (Q2.3)', () => {
  test.beforeEach(({ page }) => loadClean(page));

  const QID_TF = 'Q2.3';

  test('clicking True enables confirm pill', async ({ page }) => {
    await page.locator(byId('tf-true-' + QID_TF)).click();
    await expect(page.locator(byId('confirm-label-' + QID_TF))).not.toHaveClass(/disabled/);
  });

  test('clicking True marks TOC dot as answered', async ({ page }) => {
    await page.locator(byId('tf-true-' + QID_TF)).click();
    await expect(page.locator(`.toc-q-item[data-qid="${QID_TF}"]`)).toHaveClass(/state-answered/);
  });

  test('clicking True again deselects it', async ({ page }) => {
    await page.locator(byId('tf-true-' + QID_TF)).click();
    await page.locator(byId('tf-true-' + QID_TF)).click();
    await expect(page.locator(byId('confirm-label-' + QID_TF))).toHaveClass(/disabled/);
  });

  test('clicking False after True switches the selection', async ({ page }) => {
    await page.locator(byId('tf-true-' + QID_TF)).click();
    await page.locator(byId('tf-false-' + QID_TF)).click();
    await expect(page.locator(byId('tf-false-' + QID_TF))).toHaveClass(/selected/);
    await expect(page.locator(byId('tf-true-' + QID_TF))).not.toHaveClass(/selected/);
  });
});

// ──────────────────────────────────────────────────────────────────────────

test.describe('Conditional (Q2.5 depends on Q2.3)', () => {
  test.beforeEach(({ page }) => loadClean(page));

  const QID_WATCH = 'Q2.3';  // true-false, condition: equals "false"
  const QID_COND  = 'Q2.5';  // the conditional question

  test('conditional question has overlay visible on fresh load', async ({ page }) => {
    const overlay = page.locator(byId('cond-overlay-' + QID_COND));
    await expect(overlay).toBeVisible();
  });

  test('answering watched question with True (not matching equals "false") keeps overlay', async ({ page }) => {
    await page.locator(byId('tf-true-' + QID_WATCH)).click();
    const overlay = page.locator(byId('cond-overlay-' + QID_COND));
    await expect(overlay).toBeVisible();
  });

  test('answering watched question with False (matching equals "false") hides overlay', async ({ page }) => {
    await page.locator(byId('tf-false-' + QID_WATCH)).click();
    const overlay = page.locator(byId('cond-overlay-' + QID_COND));
    await expect(overlay).toBeHidden();
  });

  test('clearing watched answer re-shows overlay', async ({ page }) => {
    // Click False to satisfy condition
    await page.locator(byId('tf-false-' + QID_WATCH)).click();
    // Click False again to deselect
    await page.locator(byId('tf-false-' + QID_WATCH)).click();
    const overlay = page.locator(byId('cond-overlay-' + QID_COND));
    await expect(overlay).toBeVisible();
  });

  test('conditional question does not count in progress when disabled', async ({ page }) => {
    // On fresh load, Q2.5 is disabled; total count should exclude it
    const label = page.locator('#toc-prog-label');
    const text = await label.textContent();
    // TOTAL_QUESTIONS includes Q2.5; when it's disabled it should not count
    expect(text).toContain(`/ ${TOTAL_QUESTIONS - 1}`);
  });
});
