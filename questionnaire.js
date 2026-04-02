// ── State ──────────────────────────────────────────────────────────────────
let questData   = null;
const answers   = {};          // qid → mixed (string, string[], boolean, number)
const skipped   = new Set();   // skipped qids
const confirmed = new Set();   // confirmed qids
let currentLang = 'both';
let tocIsOpen   = false;

// ── YAML source & storage key ──────────────────────────────────────────────
const yamlUrl    = new URLSearchParams(location.search).get('yaml') || 'questionnaire.yaml';
const STORAGE_KEY = 'qhelper-' + yamlUrl.replace(/[^a-z0-9]/gi, '-');

// ── HTML escaping ──────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── TextValue helpers ──────────────────────────────────────────────────────
// txt(val): returns HTML — plain string escaped, or bilingual spans
function txt(val) {
  if (typeof val === 'string') return escHtml(val);
  if (val && typeof val === 'object') {
    return Object.entries(val)
      .map(([lang, s]) => `<span class="${escHtml(lang)}-only">${escHtml(s)}</span>`)
      .join('');
  }
  return '';
}

// plainText(val): returns the first plain string value (for document.title, download meta)
function plainText(val) {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    const first = Object.values(val)[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
}

// ── Answer presence helper ─────────────────────────────────────────────────
function isAnswered(qid) {
  const v = answers[qid];
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === 'string' && v.trim().length > 0;
}

// ── Condition evaluation ───────────────────────────────────────────────────
function evaluateCondition(condition) {
  const val = answers[condition.question];
  if (condition.answered !== undefined)
    return condition.answered ? isAnswered(condition.question) : !isAnswered(condition.question);
  if (condition.equals !== undefined)
    return String(val ?? '') === String(condition.equals);
  if (condition.includes !== undefined)
    return Array.isArray(val) && val.includes(condition.includes);
  if (condition.min_score !== undefined)
    return typeof val === 'number' && val >= condition.min_score;
  return false;
}

// ── Auto-generate disabled message HTML ────────────────────────────────────
function buildDisabledMessage(q) {
  if (q.disabled_message) return `<div class="cond-msg">${txt(q.disabled_message)}</div>`;
  const c = q.condition;
  if (c.equals !== undefined)
    return `<div class="cond-msg"><span class="en-only">Enabled when <strong>${escHtml(c.question)}</strong> equals "${escHtml(String(c.equals))}".</span><span class="zh-only">当 <strong>${escHtml(c.question)}</strong> 等于"${escHtml(String(c.equals))}"时开放。</span></div>`;
  if (c.includes !== undefined)
    return `<div class="cond-msg"><span class="en-only">Enabled when <strong>${escHtml(c.question)}</strong> includes "${escHtml(String(c.includes))}".</span><span class="zh-only">当 <strong>${escHtml(c.question)}</strong> 包含"${escHtml(String(c.includes))}"时开放。</span></div>`;
  if (c.min_score !== undefined)
    return `<div class="cond-msg"><span class="en-only">Enabled when <strong>${escHtml(c.question)}</strong> score ≥ ${c.min_score}.</span><span class="zh-only">当 <strong>${escHtml(c.question)}</strong> 评分 ≥ ${c.min_score} 时开放。</span></div>`;
  return `<div class="cond-msg"><span class="en-only">Enabled after <strong>${escHtml(c.question)}</strong> is answered.</span><span class="zh-only">回答 <strong>${escHtml(c.question)}</strong> 后开放。</span></div>`;
}

// ── Bilingual detection ────────────────────────────────────────────────────
function detectBilingual(data) {
  function isBilingualTextValue(val) {
    return (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      Object.values(val).length > 0 &&
      Object.values(val).every(v => typeof v === 'string')
    );
  }

  function checkTextValue(val) {
    return isBilingualTextValue(val);
  }

  if (!data || typeof data !== 'object') return false;

  // meta: title, organization, description
  if (data.meta) {
    if (checkTextValue(data.meta.title))        return true;
    if (checkTextValue(data.meta.organization)) return true;
    if (checkTextValue(data.meta.description))  return true;
  }

  // sections[].title, sections[].description, questions[].title/context/prompts/options/items/disabled_message
  for (const section of (data.sections || [])) {
    if (checkTextValue(section.title))       return true;
    if (checkTextValue(section.description)) return true;
    for (const q of (section.questions || [])) {
      if (checkTextValue(q.title))            return true;
      if (checkTextValue(q.context))          return true;
      if (checkTextValue(q.disabled_message)) return true;
      for (const p of (q.prompts || [])) {
        if (checkTextValue(p)) return true;
      }
      for (const opt of (q.options || [])) {
        if (checkTextValue(opt)) return true;
      }
      for (const item of (q.items || [])) {
        if (checkTextValue(item)) return true;
      }
    }
  }

  // summary
  if (data.summary) {
    if (checkTextValue(data.summary.title))       return true;
    if (checkTextValue(data.summary.description)) return true;
    for (const q of (data.summary.questions || [])) {
      if (checkTextValue(q.title))            return true;
      if (checkTextValue(q.context))          return true;
      if (checkTextValue(q.disabled_message)) return true;
      for (const p of (q.prompts || [])) {
        if (checkTextValue(p)) return true;
      }
      for (const opt of (q.options || [])) {
        if (checkTextValue(opt)) return true;
      }
      for (const item of (q.items || [])) {
        if (checkTextValue(item)) return true;
      }
    }
  }

  return false;
}

// ── Language ───────────────────────────────────────────────────────────────
function setLang(mode) {
  currentLang = mode;
  document.body.className = 'lang-' + currentLang;
  document.querySelectorAll('.lang-btn').forEach((b, i) =>
    b.classList.toggle('active', ['both', 'en', 'zh'][i] === mode)
  );
}

// ── TOC toggle (mobile) ────────────────────────────────────────────────────
function toggleToc() {
  tocIsOpen = !tocIsOpen;
  document.getElementById('toc-sidebar').classList.toggle('toc-open', tocIsOpen);
  document.getElementById('toc-overlay').classList.toggle('show', tocIsOpen);
}

// ── Question lookup helpers ───────────────────────────────────────────────
function getAllQids() {
  if (!questData) return [];
  const qids = [];
  for (const sec of questData.sections) for (const q of sec.questions) qids.push(q.id);
  if (questData.summary) for (const q of questData.summary.questions) qids.push(q.id);
  return qids;
}

function findQuestion(qid) {
  if (!questData) return null;
  for (const sec of questData.sections) {
    const q = sec.questions.find(q => q.id === qid);
    if (q) return q;
  }
  if (questData.summary) {
    return questData.summary.questions.find(q => q.id === qid) || null;
  }
  return null;
}

// ── Confirm pill enable/disable based on answer presence ─────────────────
function updateConfirmPill(qid) {
  if (skipped.has(qid)) return; // skip handler manages it
  const confirmLabel = document.getElementById('confirm-label-' + qid);
  const confirmHint  = document.getElementById('confirm-hint-' + qid);
  if (!confirmLabel) return;
  const hasAnswer = isAnswered(qid);
  if (hasAnswer) {
    confirmLabel.classList.remove('disabled');
    confirmLabel.title = '';
    if (confirmHint) confirmHint.style.display = 'none';
  } else {
    // If answer cleared, also uncheck confirm
    const confirmCb = document.getElementById('confirm-' + qid);
    if (confirmCb && confirmCb.checked) {
      confirmCb.checked = false;
      confirmed.delete(qid);
    }
    confirmLabel.classList.add('disabled');
    confirmLabel.title = 'Write an answer first / 请先填写答案';
    if (confirmHint) confirmHint.style.display = '';
  }
}

// ── Download button enable/disable ────────────────────────────────────────
function updateDownloadBtn() {
  const btn  = document.getElementById('download-btn');
  const hint = document.getElementById('download-hint');
  if (!btn || !questData) return;
  const pending = getAllQids().filter(
    qid => {
      // Skip conditionally-disabled questions
      const wrapper = document.querySelector(`.conditional-wrapper[data-cond-qid="${qid}"]`);
      if (wrapper && wrapper.classList.contains('cond-disabled')) return false;
      return !skipped.has(qid) && !(isAnswered(qid) && confirmed.has(qid));
    }
  );
  if (pending.length === 0) {
    btn.disabled = false;
    if (hint) hint.innerHTML = '';
  } else {
    btn.disabled = true;
    if (hint) hint.innerHTML =
      `<span class="en-only">${pending.length} question${pending.length > 1 ? 's' : ''} still need answer+confirm or skip</span>` +
      `<span class="zh-only">还有 ${pending.length} 道题需作答确认或跳过</span>`;
  }
}

// ── Copy question to clipboard ────────────────────────────────────────────
function copyQuestion(qid) {
  const q = findQuestion(qid);
  if (!q) return;
  const lines = [];

  // Title: emit all language variants
  if (typeof q.title === 'string') {
    lines.push(`[${q.id}] ${q.title}`);
  } else if (q.title && typeof q.title === 'object') {
    for (const [, s] of Object.entries(q.title)) lines.push(`[${q.id}] ${s}`);
  }

  // Context
  if (q.context) {
    if (typeof q.context === 'string') {
      lines.push('\n' + q.context);
    } else if (typeof q.context === 'object') {
      lines.push('');
      for (const [, s] of Object.entries(q.context)) lines.push(s);
    }
  }

  // Prompts — each item is a TextValue
  if (Array.isArray(q.prompts) && q.prompts.length > 0) {
    lines.push('');
    for (const p of q.prompts) {
      if (typeof p === 'string') {
        lines.push('• ' + p);
      } else if (p && typeof p === 'object') {
        for (const [, s] of Object.entries(p)) lines.push('• ' + s);
      }
    }
  }

  const text = lines.join('\n');
  const doToast = () => showToast('Copied to clipboard! / 已复制到剪贴板');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(doToast).catch(() => fallbackCopy(text, doToast));
  } else {
    fallbackCopy(text, doToast);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb(); } catch(e) {}
  document.body.removeChild(ta);
}

// ── localStorage persistence ──────────────────────────────────────────────
let saveTimer = null;
let _suppressSave = false; // set to true after discard/clear to prevent beforeunload re-save

function saveState() {
  const respondent = document.getElementById('respondent-name').value;
  const state = {
    respondent,
    answers:   { ...answers },
    skipped:   [...skipped],
    confirmed: [...confirmed]
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e) { /* storage full or private browsing — ignore */ }
  // Flash auto-save indicator
  const el = document.getElementById('autosave-status');
  if (el) {
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }
}

function scheduleSave() {
  _suppressSave = false; // re-enable saving on user interaction
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 800);
}

// Flush on page unload so debounced saves aren't lost on back/refresh
window.addEventListener('beforeunload', () => {
  if (_suppressSave) return;
  clearTimeout(saveTimer);
  saveState();
});

function restoreState() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) { return; }
  if (!stored) return;

  // Restore name
  if (stored.respondent) {
    document.getElementById('respondent-name').value = stored.respondent;
  }

  // Restore answers
  if (stored.answers) {
    for (const [qid, val] of Object.entries(stored.answers)) {
      answers[qid] = val;
      const q = findQuestion(qid);
      const type = q?.type || 'text';
      _restoreWidgetVisual(qid, val, type);
    }
  }

  // Restore skipped
  if (stored.skipped) {
    for (const qid of stored.skipped) {
      const skipCb = document.getElementById('skip-' + qid);
      if (!skipCb) continue;
      skipCb.checked = true;
      skipped.add(qid);
      const textarea = document.getElementById('ans-' + qid);
      if (textarea) { textarea.disabled = true; textarea.classList.remove('has-content'); }
      const ansArea = document.querySelector(`[id="q-${qid}"] .answer-area`);
      if (ansArea) ansArea.classList.add('widget-disabled');
      const confirmLabel = document.getElementById('confirm-label-' + qid);
      if (confirmLabel) confirmLabel.classList.add('disabled');
      const confirmCb = document.getElementById('confirm-' + qid);
      if (confirmCb) { confirmCb.checked = false; }
    }
  }

  // Restore confirmed (only if not skipped)
  if (stored.confirmed) {
    for (const qid of stored.confirmed) {
      if (skipped.has(qid)) continue;
      const confirmCb = document.getElementById('confirm-' + qid);
      if (confirmCb) { confirmCb.checked = true; confirmed.add(qid); }
    }
  }

  // Refresh all visual states
  const allQids = [...document.querySelectorAll('.question-block[data-qid]')]
    .map(el => el.dataset.qid);
  allQids.forEach(qid => { updateTocItem(qid); updateBlockClass(qid); updateConfirmPill(qid); });
  updateProgress();
  updateDownloadBtn();

  // Show restoration banner if there was meaningful state
  if (stored.respondent || stored.skipped?.length || stored.confirmed?.length ||
      Object.keys(stored.answers || {}).length) {
    showRestoreBanner();
  }
}

function _restoreWidgetVisual(qid, val, type) {
  if (type === 'text' || !type) {
    const ta = document.getElementById('ans-' + qid);
    if (ta && val) { ta.value = val; ta.classList.add('has-content'); }
  } else if (type === 'single-choice') {
    const q = findQuestion(qid);
    q?.options?.forEach((opt, i) => {
      if (plainText(opt) === val) {
        const radio = document.querySelector(`input[type="radio"][name="choice-${qid}"][value="${i}"]`);
        if (radio) radio.checked = true;
      }
    });
  } else if (type === 'multiple-choice') {
    if (Array.isArray(val)) {
      const q = findQuestion(qid);
      q?.options?.forEach((opt, i) => {
        if (val.includes(plainText(opt))) {
          const cb = document.querySelector(`input[type="checkbox"][data-qid="${qid}"][data-idx="${i}"]`);
          if (cb) cb.checked = true;
        }
      });
    }
  } else if (type === 'true-false') {
    if (typeof val === 'boolean') {
      document.getElementById(`tf-${val ? 'true' : 'false'}-${qid}`)?.classList.add('selected');
    }
  } else if (type === 'ranking') {
    if (Array.isArray(val)) {
      const ul = document.getElementById('ranking-' + qid);
      const q = findQuestion(qid);
      if (ul && q) {
        val.forEach((itemText) => {
          const li = Array.from(ul.querySelectorAll('.ranking-item'))
            .find(el => plainText(q.items[parseInt(el.dataset.idx)]) === itemText);
          if (li) ul.appendChild(li);
        });
        _updateRankingPositions(ul, qid);
      }
    }
  } else if (type === 'score') {
    if (typeof val === 'number' && val > 0) {
      document.querySelectorAll(`[id="stars-${qid}"] .star-btn`).forEach(b =>
        b.classList.toggle('filled', parseInt(b.dataset.val) <= val)
      );
      const d = document.getElementById('score-display-' + qid);
      if (d) d.textContent = `${val} / ${findQuestion(qid)?.max || 5} ★`;
    }
  }
}

function showRestoreBanner() {
  const main = document.getElementById('main-content');
  if (!main || document.getElementById('restore-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'restore-banner';
  banner.id = 'restore-banner';
  banner.innerHTML = `
    <div class="restore-banner-text">
      <strong class="en-only">&#x1F4BE; Draft restored</strong>
      <strong class="zh-only">&#x1F4BE; 已恢复上次草稿</strong>
      <span class="en-only"> — Your previous progress was saved and has been restored.</span>
      <span class="zh-only"> — 已自动恢复您上次填写的内容。</span>
    </div>
    <button class="restore-discard-btn" onclick="discardSavedState()">
      <span class="en-only">Discard &amp; start over</span>
      <span class="zh-only">丢弃并重新开始</span>
    </button>`;
  main.insertBefore(banner, main.firstChild);
}

function discardSavedState() {
  // Cancel any pending debounced save before we start
  clearTimeout(saveTimer);

  document.getElementById('restore-banner')?.remove();
  // Reset text widgets
  document.querySelectorAll('textarea[data-qid]').forEach(t => {
    t.value = ''; t.classList.remove('has-content'); t.disabled = false;
  });
  // Reset choice widgets
  document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[type="checkbox"][data-qid]').forEach(c => { c.checked = false; });
  // Reset true-false
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
  // Reset score
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('filled'));
  document.querySelectorAll('.score-display').forEach(d => {
    d.innerHTML = '<span class="en-only">No rating yet</span><span class="zh-only">尚未评分</span>';
  });
  // Reset ranking — restore original order (update visuals only, no save)
  document.querySelectorAll('.ranking-list').forEach(ul => {
    const qid = ul.id.replace('ranking-', '');
    const q = findQuestion(qid);
    if (!q) return;
    const items = Array.from(ul.querySelectorAll('.ranking-item'));
    items.sort((a, b) => parseInt(a.dataset.idx) - parseInt(b.dataset.idx));
    items.forEach(li => ul.appendChild(li));
    // Update position numbers without triggering save
    ul.querySelectorAll('.ranking-item').forEach((li, i) => {
      const posEl = li.querySelector('.ranking-pos');
      if (posEl) posEl.textContent = i + 1;
    });
  });

  document.querySelectorAll('.question-block').forEach(b =>
    b.classList.remove('is-skipped', 'is-answered', 'is-confirmed')
  );
  document.querySelectorAll('.toc-q-item').forEach(el =>
    el.classList.remove('state-answered', 'state-confirmed', 'state-skipped')
  );
  Object.keys(answers).forEach(k => delete answers[k]);
  skipped.clear();
  confirmed.clear();

  // Re-seed ranking answers (but don't trigger save)
  document.querySelectorAll('.ranking-list').forEach(ul => {
    const qid = ul.id.replace('ranking-', '');
    const q = findQuestion(qid);
    if (q) answers[qid] = q.items.map(item => plainText(item));
  });

  document.getElementById('respondent-name').value = '';
  // Reset widget-disabled
  document.querySelectorAll('.answer-area.widget-disabled').forEach(el => el.classList.remove('widget-disabled'));

  getAllQids().forEach(qid => updateConfirmPill(qid));
  updateProgress();
  updateDownloadBtn();

  // Remove saved state and cancel any pending auto-save; suppress beforeunload save
  localStorage.removeItem(STORAGE_KEY);
  clearTimeout(saveTimer);
  _suppressSave = true;

  // Re-evaluate all conditions (all start disabled)
  getAllQids().forEach(qid => {
    const q = findQuestion(qid);
    if (q && q.condition) _applyConditionState(qid, evaluateCondition(q.condition));
  });
}

// ── Validation error display ──────────────────────────────────────────────
function showValidationErrors(errors) {
  const main = document.getElementById('main-content');
  const listItems = errors.map(e => `<li>${escHtml(e)}</li>`).join('');
  main.innerHTML = `
    <div class="validation-error-panel">
      <h2>YAML Validation Failed</h2>
      <div class="yaml-url">${escHtml(yamlUrl)}</div>
      <ul>${listItems}</ul>
    </div>`;
}

// ── Load YAML ─────────────────────────────────────────────────────────────
async function loadQuestionnaire() {
  try {
    const resp = await fetch(yamlUrl);
    if (!resp.ok) throw new Error(`Failed to fetch ${yamlUrl} (HTTP ${resp.status})`);
    questData = jsyaml.load(await resp.text());

    // Validate
    const errors = QuestionnaireValidator.validateYAML(questData);
    if (errors.length > 0) {
      showValidationErrors(errors);
      return;
    }

    // Set page title and header
    document.getElementById('page-title').innerHTML = txt(questData.meta.title);
    document.title = plainText(questData.meta.title) + ' — Questionnaire';

    // Set organization if present
    const orgEl = document.getElementById('page-org');
    if (questData.meta.organization) {
      orgEl.innerHTML = txt(questData.meta.organization);
      orgEl.style.display = '';
    }

    // Show language bar if bilingual content detected
    if (detectBilingual(questData)) {
      document.getElementById('lang-bar').style.display = '';
    }

    renderQuestionnaire();
  } catch(e) {
    document.getElementById('main-content').innerHTML =
      `<div class="loading" style="color:#c62828">
        <p>Error loading questionnaire: ${escHtml(e.message)}</p>
        <p style="margin-top:8px;font-size:0.85rem">Make sure the YAML file is accessible at: <code>${escHtml(yamlUrl)}</code></p>
      </div>`;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderQuestionnaire() {
  const main = document.getElementById('main-content');
  main.innerHTML = '';

  for (const section of questData.sections) {
    main.appendChild(renderSection(section));
  }

  // Optional summary section
  if (questData.summary) {
    const sum = questData.summary;
    const sumCard = document.createElement('div');
    sumCard.className = 'summary-card';
    sumCard.id = 'section-S';

    const hasDesc = sum.description && isTextValuePresent(sum.description);
    sumCard.innerHTML = `
      <div class="summary-header">
        <h2>${txt(sum.title)}</h2>
        ${hasDesc ? `<div class="section-desc" style="color:rgba(255,255,255,0.75);margin-top:5px">${txt(sum.description)}</div>` : ''}
      </div>`;
    for (const q of sum.questions) sumCard.appendChild(renderQuestion(q));
    main.appendChild(sumCard);
  }

  buildToc();
  updateProgress();
  restoreState();
  updateDownloadBtn();
  initIntersectionObserver();

  // Evaluate all conditions after render
  getAllQids().forEach(qid => {
    const q = findQuestion(qid);
    if (q && q.condition) _applyConditionState(qid, evaluateCondition(q.condition));
  });
}

// Helper: check if a TextValue field has any content
function isTextValuePresent(val) {
  if (typeof val === 'string') return val.trim().length > 0;
  if (val && typeof val === 'object') return Object.values(val).some(v => typeof v === 'string' && v.trim().length > 0);
  return false;
}

function renderSection(section) {
  const card = document.createElement('div');
  card.className = 'section-card';
  card.id = 'section-' + section.id;

  const hasDesc = section.description && isTextValuePresent(section.description);
  card.innerHTML = `
    <div class="section-header">
      <h2>
        <span class="sec-num">${escHtml(String(section.id))}</span>
        ${txt(section.title)}
      </h2>
      ${hasDesc ? `<div class="section-desc">${txt(section.description)}</div>` : ''}
    </div>`;
  for (const q of section.questions) card.appendChild(renderQuestion(q));
  return card;
}

function renderQuestion(q) {
  const block = document.createElement('div');
  block.className = 'question-block';
  block.id = 'q-' + q.id;
  block.dataset.qid = q.id;

  const hasContext = q.context && isTextValuePresent(q.context);
  const hasPrompts  = Array.isArray(q.prompts) && q.prompts.length > 0;

  const promptsHtml = hasPrompts
    ? `<div class="prompts">
        <div class="prompt-label">
          <span class="en-only">Your response should address:</span>
          <span class="zh-only">您的回答应涵盖：</span>
        </div>
        <ul>${q.prompts.map(p => `<li>${txt(p)}</li>`).join('')}</ul>
      </div>`
    : '';

  block.innerHTML = `
    <span class="q-id">${escHtml(q.id)}</span>
    <div class="q-title">${txt(q.title)}</div>
    ${hasContext ? `<div class="q-context">${txt(q.context)}</div>` : ''}
    ${promptsHtml}
    <div class="action-row">
      <label class="pill-label skip-pill" id="skip-label-${escHtml(q.id)}">
        <input type="checkbox" id="skip-${escHtml(q.id)}" data-qid="${escHtml(q.id)}" onchange="onSkipChange(this)" />
        <span class="en-only">⊘ Mark as Skipped</span>
        <span class="zh-only">⊘ 跳过此题</span>
      </label>
      <label class="pill-label confirm-pill disabled" id="confirm-label-${escHtml(q.id)}"
             title="Write an answer first / 请先填写答案">
        <input type="checkbox" id="confirm-${escHtml(q.id)}" data-qid="${escHtml(q.id)}" onchange="onConfirmChange(this)" />
        <span class="en-only"><span class="pill-unchecked">Confirm</span><span class="pill-checked">✓ Confirmed</span></span>
        <span class="zh-only"><span class="pill-unchecked">确认</span><span class="pill-checked">✓ 已确认</span></span>
      </label>
      <span class="pill-hint" id="confirm-hint-${escHtml(q.id)}">
        <span class="en-only">Write an answer first</span>
        <span class="zh-only">请先填写答案</span>
      </span>
      <button class="copy-btn" onclick="copyQuestion('${escHtml(q.id)}')"
              title="Copy question text / 复制题目内容">
        <span>📋</span>
        <span class="en-only">Copy</span>
        <span class="zh-only">复制</span>
      </button>
    </div>
    <div class="answer-widget-placeholder"></div>`;

  // Replace placeholder with actual widget
  const placeholder = block.querySelector('.answer-widget-placeholder');
  placeholder.replaceWith(renderAnswerWidget(q));

  if (q.condition) {
    return wrapConditional(block, q);
  }
  return block;
}

function wrapConditional(block, q) {
  const wrapper = document.createElement('div');
  wrapper.className = 'conditional-wrapper';
  wrapper.dataset.condQid = q.id;
  wrapper.dataset.watchQid = q.condition.question;

  const overlay = document.createElement('div');
  overlay.className = 'conditional-overlay';
  overlay.id = 'cond-overlay-' + q.id;
  overlay.innerHTML = buildDisabledMessage(q);

  // Start disabled (overlay visible) — conditions evaluated after render
  wrapper.classList.add('cond-disabled');

  wrapper.appendChild(block);
  wrapper.appendChild(overlay);
  return wrapper;
}

// ── Answer widget rendering ────────────────────────────────────────────────
function renderAnswerWidget(q) {
  const type = q.type || 'text';
  if (type === 'single-choice')   return renderSingleChoiceWidget(q);
  if (type === 'multiple-choice') return renderMultipleChoiceWidget(q);
  if (type === 'true-false')      return renderTrueFalseWidget(q);
  if (type === 'ranking')         return renderRankingWidget(q);
  if (type === 'score')           return renderScoreWidget(q);
  return renderTextWidget(q);
}

function renderTextWidget(q) {
  const div = document.createElement('div');
  div.className = 'answer-area';
  div.innerHTML = `
    <label>
      <span class="en-only">Your Answer:</span>
      <span class="zh-only">您的回答：</span>
    </label>
    <textarea
      id="ans-${escHtml(q.id)}"
      data-qid="${escHtml(q.id)}"
      placeholder="Enter your answer (English or Chinese / 中英文均可)"
      oninput="onAnswerChange(this)"
    ></textarea>`;
  return div;
}

function renderSingleChoiceWidget(q) {
  const qid = q.id;
  const div = document.createElement('div');
  div.className = 'answer-area choice-area';
  const optionsHtml = q.options.map((opt, i) =>
    `<label class="choice-option">
      <input type="radio" name="choice-${escHtml(qid)}" value="${i}" onchange="onChoiceChange(this,'${escHtml(qid)}','single')">
      <span class="choice-text">${txt(opt)}</span>
    </label>`
  ).join('');
  div.innerHTML = `<div class="choice-group">${optionsHtml}</div>`;
  return div;
}

function renderMultipleChoiceWidget(q) {
  const qid = q.id;
  const div = document.createElement('div');
  div.className = 'answer-area choice-area';
  const optionsHtml = q.options.map((opt, i) =>
    `<label class="choice-option">
      <input type="checkbox" data-qid="${escHtml(qid)}" data-idx="${i}" onchange="onChoiceChange(this,'${escHtml(qid)}','multiple')">
      <span class="choice-text">${txt(opt)}</span>
    </label>`
  ).join('');
  div.innerHTML = `<div class="choice-group">${optionsHtml}</div>`;
  return div;
}

function renderTrueFalseWidget(q) {
  const qid = q.id;
  const div = document.createElement('div');
  div.className = 'answer-area true-false-area';
  div.innerHTML = `
    <div class="tf-group">
      <button class="tf-btn" id="tf-true-${escHtml(qid)}" onclick="onTrueFalseClick('${escHtml(qid)}', true)">
        <span class="en-only">True</span><span class="zh-only">是</span>
      </button>
      <button class="tf-btn" id="tf-false-${escHtml(qid)}" onclick="onTrueFalseClick('${escHtml(qid)}', false)">
        <span class="en-only">False</span><span class="zh-only">否</span>
      </button>
    </div>`;
  return div;
}

function renderRankingWidget(q) {
  const qid = q.id;
  const div = document.createElement('div');
  div.className = 'answer-area ranking-area';

  const ul = document.createElement('ul');
  ul.className = 'ranking-list';
  ul.id = 'ranking-' + qid;

  q.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'ranking-item';
    li.draggable = true;
    li.dataset.idx = i;
    li.innerHTML = `<span class="drag-handle">⠿</span><span class="ranking-pos">${i + 1}</span><span class="ranking-text">${txt(item)}</span>`;
    ul.appendChild(li);
  });

  div.appendChild(ul);
  initRankingDragDrop(ul, qid);

  // Seed the answer with the default order
  answers[qid] = q.items.map(item => plainText(item));

  return div;
}

function renderScoreWidget(q) {
  const qid = q.id;
  const div = document.createElement('div');
  div.className = 'answer-area score-area';

  const starGroup = document.createElement('div');
  starGroup.className = 'star-group';
  starGroup.id = 'stars-' + qid;

  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'star-btn';
    btn.dataset.val = i;
    btn.textContent = '★';
    btn.onclick = () => onScoreClick(qid, i);
    starGroup.appendChild(btn);
  }

  // Hover preview
  starGroup.addEventListener('mouseover', e => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    const hoverVal = parseInt(btn.dataset.val);
    starGroup.querySelectorAll('.star-btn').forEach(b => {
      b.classList.toggle('hover-preview', parseInt(b.dataset.val) <= hoverVal);
    });
  });
  starGroup.addEventListener('mouseleave', () => {
    starGroup.querySelectorAll('.star-btn').forEach(b => b.classList.remove('hover-preview'));
  });

  const display = document.createElement('div');
  display.className = 'score-display';
  display.id = 'score-display-' + qid;
  display.innerHTML = '<span class="en-only">No rating yet</span><span class="zh-only">尚未评分</span>';

  div.appendChild(starGroup);
  div.appendChild(display);
  return div;
}

// ── Build TOC ──────────────────────────────────────────────────────────────
function buildToc() {
  const list = document.getElementById('toc-list');
  list.innerHTML = '';

  const addSection = (id, titleHtml, questions) => {
    const label = document.createElement('div');
    label.className = 'toc-section-label';
    label.innerHTML = `§${escHtml(String(id))} ${titleHtml}`;
    list.appendChild(label);

    for (const q of questions) {
      const a = document.createElement('a');
      a.className = 'toc-q-item';
      a.dataset.qid = q.id;
      a.href = '#q-' + q.id;
      a.innerHTML = `<span class="toc-dot"></span><span class="toc-qid">${escHtml(q.id)}</span>`;
      a.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('q-' + q.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (tocIsOpen) toggleToc();
      });
      list.appendChild(a);
    }
  };

  for (const section of questData.sections) {
    addSection(section.id, txt(section.title), section.questions);
  }
  if (questData.summary) {
    addSection('S', txt(questData.summary.title), questData.summary.questions);
  }
}

// ── Update a single TOC dot ────────────────────────────────────────────────
function updateTocItem(qid) {
  const el = document.querySelector(`.toc-q-item[data-qid="${qid}"]`);
  if (!el) return;
  el.classList.remove('state-answered', 'state-confirmed', 'state-skipped');
  if (skipped.has(qid)) {
    el.classList.add('state-skipped');
  } else if (confirmed.has(qid)) {
    el.classList.add('state-confirmed');
  } else if (isAnswered(qid)) {
    el.classList.add('state-answered');
  }
}

// ── Update question block background class ─────────────────────────────────
function updateBlockClass(qid) {
  const block = document.getElementById('q-' + qid);
  if (!block) return;
  block.classList.remove('is-skipped', 'is-answered', 'is-confirmed');
  if (skipped.has(qid)) {
    block.classList.add('is-skipped');
  } else if (confirmed.has(qid)) {
    block.classList.add('is-confirmed');
  } else if (isAnswered(qid)) {
    block.classList.add('is-answered');
  }
}

// ── Progress ───────────────────────────────────────────────────────────────
function updateProgress() {
  let total = 0, nConfirmed = 0, nAnswered = 0, nSkipped = 0;
  document.querySelectorAll('.question-block[data-qid]').forEach(block => {
    if (block.closest('.cond-disabled')) return; // disabled conditional — skip
    total++;
    const qid = block.dataset.qid;
    if (skipped.has(qid))        nSkipped++;
    else if (confirmed.has(qid)) nConfirmed++;
    else if (isAnswered(qid))    nAnswered++;
  });
  const done = nConfirmed + nAnswered + nSkipped;
  const pct  = total > 0 ? Math.round(done / total * 100) : 0;

  document.getElementById('toc-prog-fill').style.width = pct + '%';
  document.getElementById('toc-prog-label').textContent =
    `${nConfirmed} confirmed · ${nAnswered} answered · ${nSkipped} skipped / ${total}`;

  document.getElementById('mob-prog-fill').style.width = pct + '%';
  document.getElementById('mob-prog-label').textContent = `${done}/${total} (${pct}%)`;
}

// ── Answer change (text) ──────────────────────────────────────────────────
function onAnswerChange(textarea) {
  const qid = textarea.dataset.qid;
  const val = textarea.value.trim();
  if (val) {
    answers[qid] = val;
    textarea.classList.add('has-content');
  } else {
    delete answers[qid];
    textarea.classList.remove('has-content');
  }
  _afterAnswerChange(qid);
}

// ── Choice change (single/multiple) ───────────────────────────────────────
function onChoiceChange(input, qid, mode) {
  const q = findQuestion(qid);
  if (mode === 'single') {
    answers[qid] = plainText(q.options[parseInt(input.value)]);
  } else {
    const checked = document.querySelectorAll(`input[type="checkbox"][data-qid="${qid}"]:checked`);
    if (checked.length > 0) {
      answers[qid] = Array.from(checked).map(c => plainText(q.options[parseInt(c.dataset.idx)]));
    } else {
      delete answers[qid];
    }
  }
  _afterAnswerChange(qid);
}

// ── True/False click ──────────────────────────────────────────────────────
function onTrueFalseClick(qid, value) {
  if (answers[qid] === value) {
    delete answers[qid];
    document.getElementById('tf-true-' + qid)?.classList.remove('selected');
    document.getElementById('tf-false-' + qid)?.classList.remove('selected');
  } else {
    answers[qid] = value;
    document.getElementById('tf-true-' + qid)?.classList.toggle('selected', value === true);
    document.getElementById('tf-false-' + qid)?.classList.toggle('selected', value === false);
  }
  _afterAnswerChange(qid);
}

// ── Score click ───────────────────────────────────────────────────────────
function onScoreClick(qid, value) {
  if (answers[qid] === value) {
    delete answers[qid];
    document.querySelectorAll(`[id="stars-${qid}"] .star-btn`).forEach(b => b.classList.remove('filled'));
    const display = document.getElementById('score-display-' + qid);
    if (display) display.innerHTML = '<span class="en-only">No rating yet</span><span class="zh-only">尚未评分</span>';
  } else {
    answers[qid] = value;
    document.querySelectorAll(`[id="stars-${qid}"] .star-btn`).forEach(b =>
      b.classList.toggle('filled', parseInt(b.dataset.val) <= value)
    );
    const display = document.getElementById('score-display-' + qid);
    if (display) display.textContent = `${value} / ${findQuestion(qid)?.max || 5} ★`;
  }
  _afterAnswerChange(qid);
}

// ── Ranking drag-and-drop ─────────────────────────────────────────────────
function initRankingDragDrop(ul, qid) {
  let dragging = null;

  ul.addEventListener('dragstart', e => {
    dragging = e.target.closest('.ranking-item');
    dragging?.classList.add('dragging');
  });
  ul.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging');
    ul.querySelectorAll('.ranking-item').forEach(li => li.classList.remove('drag-over'));
    dragging = null;
  });
  ul.addEventListener('dragover', e => {
    e.preventDefault();
    const over = e.target.closest('.ranking-item');
    if (!over || over === dragging) return;
    ul.querySelectorAll('.ranking-item').forEach(li => li.classList.remove('drag-over'));
    over.classList.add('drag-over');
    const items = [...ul.querySelectorAll('.ranking-item')];
    const overIdx = items.indexOf(over);
    const dragIdx = items.indexOf(dragging);
    if (dragIdx < overIdx) {
      ul.insertBefore(dragging, over.nextSibling);
    } else {
      ul.insertBefore(dragging, over);
    }
  });
  ul.addEventListener('drop', e => {
    e.preventDefault();
    ul.querySelectorAll('.ranking-item').forEach(li => li.classList.remove('drag-over'));
    _updateRankingPositions(ul, qid);
  });
}

function _updateRankingPositions(ul, qid) {
  const q = findQuestion(qid);
  const items = ul.querySelectorAll('.ranking-item');
  items.forEach((li, i) => {
    const posEl = li.querySelector('.ranking-pos');
    if (posEl) posEl.textContent = i + 1;
  });
  answers[qid] = Array.from(items).map(li => plainText(q.items[parseInt(li.dataset.idx)]));
  _afterAnswerChange(qid);
}

// ── Shared post-answer-change tail ────────────────────────────────────────
function _afterAnswerChange(qid) {
  updateTocItem(qid);
  updateBlockClass(qid);
  updateProgress();
  updateConfirmPill(qid);
  updateDownloadBtn();
  updateConditionalsDependingOn(qid);
  scheduleSave();
}

// ── Conditional logic ─────────────────────────────────────────────────────
function updateConditionalsDependingOn(watchQid) {
  getAllQids().forEach(qid => {
    const q = findQuestion(qid);
    if (q?.condition?.question === watchQid) {
      _applyConditionState(qid, evaluateCondition(q.condition));
    }
  });
}

function _applyConditionState(qid, satisfied) {
  const wrapper = document.querySelector(`.conditional-wrapper[data-cond-qid="${qid}"]`);
  if (!wrapper) return;
  const overlay = document.getElementById('cond-overlay-' + qid);
  wrapper.classList.toggle('cond-disabled', !satisfied);
  if (overlay) overlay.style.display = satisfied ? 'none' : '';
  if (!satisfied && isAnswered(qid)) {
    delete answers[qid];
    confirmed.delete(qid);
    _resetWidgetVisual(qid);
    updateTocItem(qid);
    updateBlockClass(qid);
    updateConfirmPill(qid);
    saveState();
  }
}

function _resetWidgetVisual(qid) {
  const q = findQuestion(qid);
  const type = q?.type || 'text';
  if (type === 'text') {
    const ta = document.getElementById('ans-' + qid);
    if (ta) { ta.value = ''; ta.classList.remove('has-content'); }
  } else if (type === 'single-choice') {
    document.querySelectorAll(`input[type="radio"][name="choice-${qid}"]`).forEach(r => r.checked = false);
  } else if (type === 'multiple-choice') {
    document.querySelectorAll(`input[type="checkbox"][data-qid="${qid}"]`).forEach(c => c.checked = false);
  } else if (type === 'true-false') {
    document.getElementById('tf-true-' + qid)?.classList.remove('selected');
    document.getElementById('tf-false-' + qid)?.classList.remove('selected');
  } else if (type === 'score') {
    document.querySelectorAll(`[id="stars-${qid}"] .star-btn`).forEach(b => b.classList.remove('filled'));
    const d = document.getElementById('score-display-' + qid);
    if (d) d.innerHTML = '<span class="en-only">No rating yet</span><span class="zh-only">尚未评分</span>';
  }
  // ranking: keep current visual order
}

// ── Skip change ───────────────────────────────────────────────────────────
function onSkipChange(checkbox) {
  const qid = checkbox.dataset.qid;
  const block        = document.getElementById('q-' + qid);
  const textarea     = document.getElementById('ans-' + qid);
  const ansArea      = block?.querySelector('.answer-area');
  const confirmLabel = document.getElementById('confirm-label-' + qid);
  const confirmCb    = document.getElementById('confirm-' + qid);

  if (checkbox.checked) {
    skipped.add(qid);
    if (textarea) { textarea.disabled = true; textarea.classList.remove('has-content'); }
    if (ansArea) ansArea.classList.add('widget-disabled');
    confirmed.delete(qid);
    if (confirmCb) confirmCb.checked = false;
    if (confirmLabel) confirmLabel.classList.add('disabled');
  } else {
    skipped.delete(qid);
    if (textarea) {
      textarea.disabled = false;
      if (textarea.value.trim()) {
        answers[qid] = textarea.value.trim();
        textarea.classList.add('has-content');
      }
    }
    if (ansArea) ansArea.classList.remove('widget-disabled');
    updateConfirmPill(qid);
  }
  updateTocItem(qid);
  updateBlockClass(qid);
  updateProgress();
  updateDownloadBtn();
  saveState();
}

// ── Confirm change ────────────────────────────────────────────────────────
function onConfirmChange(checkbox) {
  const qid = checkbox.dataset.qid;
  if (checkbox.checked) {
    confirmed.add(qid);
  } else {
    confirmed.delete(qid);
  }
  updateTocItem(qid);
  updateBlockClass(qid);
  updateProgress();
  updateDownloadBtn();
  saveState();
}

// ── IntersectionObserver ──────────────────────────────────────────────────
function initIntersectionObserver() {
  const observer = new IntersectionObserver(entries => {
    let best = null, bestDist = Infinity;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const rect = entry.boundingClientRect;
        const mid  = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(mid - window.innerHeight / 2);
        if (dist < bestDist) { bestDist = dist; best = entry.target; }
      }
    });
    if (best) setActiveTocItem(best.dataset.qid);
  }, { rootMargin: '-10% 0px -50% 0px', threshold: 0 });

  document.querySelectorAll('.question-block[data-qid]').forEach(el => observer.observe(el));
}

function setActiveTocItem(qid) {
  document.querySelectorAll('.toc-q-item').forEach(el => el.classList.remove('is-active'));
  const item = document.querySelector(`.toc-q-item[data-qid="${qid}"]`);
  if (!item) return;
  item.classList.add('is-active');
  const tocList = document.getElementById('toc-list');
  const targetScroll = item.offsetTop - tocList.clientHeight / 2 + item.offsetHeight / 2;
  tocList.scrollTo({ top: targetScroll, behavior: 'smooth' });
}

// ── Name validation ───────────────────────────────────────────────────────
function clearNameError() {
  document.getElementById('respondent-box').classList.remove('error');
  document.getElementById('name-error').style.display = 'none';
}

function validateName() {
  const name = document.getElementById('respondent-name').value.trim();
  if (!name) {
    document.getElementById('respondent-box').classList.add('error');
    document.getElementById('name-error').style.display = 'block';
    document.getElementById('respondent-name').focus();
    return false;
  }
  clearNameError();
  return true;
}

// ── Clear all ─────────────────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Clear all answers, skips, and confirmations? / 确认清空所有回答、跳过和确认标记？')) return;

  document.querySelectorAll('textarea[data-qid]').forEach(t => {
    t.value = ''; t.classList.remove('has-content'); t.disabled = false;
  });
  document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[type="checkbox"][data-qid]').forEach(c => {
    c.checked = false;
  });
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('filled'));
  document.querySelectorAll('.score-display').forEach(d => {
    d.innerHTML = '<span class="en-only">No rating yet</span><span class="zh-only">尚未评分</span>';
  });
  // Reset ranking to original order (update visuals only, no save trigger)
  document.querySelectorAll('.ranking-list').forEach(ul => {
    const qid = ul.id.replace('ranking-', '');
    const q = findQuestion(qid);
    if (!q) return;
    const items = Array.from(ul.querySelectorAll('.ranking-item'));
    items.sort((a, b) => parseInt(a.dataset.idx) - parseInt(b.dataset.idx));
    items.forEach(li => ul.appendChild(li));
    ul.querySelectorAll('.ranking-item').forEach((li, i) => {
      const posEl = li.querySelector('.ranking-pos');
      if (posEl) posEl.textContent = i + 1;
    });
  });

  document.querySelectorAll('.confirm-pill').forEach(l => l.classList.remove('disabled'));
  document.querySelectorAll('.question-block').forEach(b =>
    b.classList.remove('is-skipped', 'is-answered', 'is-confirmed')
  );
  document.querySelectorAll('.answer-area.widget-disabled').forEach(el => el.classList.remove('widget-disabled'));

  Object.keys(answers).forEach(k => delete answers[k]);
  skipped.clear();
  confirmed.clear();

  // Re-seed ranking answers
  document.querySelectorAll('.ranking-list').forEach(ul => {
    const qid = ul.id.replace('ranking-', '');
    const q = findQuestion(qid);
    if (q) answers[qid] = q.items.map(item => plainText(item));
  });

  document.querySelectorAll('.toc-q-item').forEach(el =>
    el.classList.remove('state-answered', 'state-confirmed', 'state-skipped')
  );
  getAllQids().forEach(qid => updateConfirmPill(qid));
  updateProgress();
  updateDownloadBtn();
  localStorage.removeItem(STORAGE_KEY);
  clearTimeout(saveTimer);
  _suppressSave = true;

  // Re-evaluate conditions
  getAllQids().forEach(qid => {
    const q = findQuestion(qid);
    if (q && q.condition) _applyConditionState(qid, evaluateCondition(q.condition));
  });
}

// ── Download answers ──────────────────────────────────────────────────────
function downloadAnswers() {
  if (!validateName()) {
    document.getElementById('respondent-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (Object.keys(answers).length === 0 && skipped.size === 0 && confirmed.size === 0) {
    showToast('Please answer at least one question. / 请至少填写一道题。');
    return;
  }

  const respondent = document.getElementById('respondent-name').value.trim();
  const now = new Date().toISOString();

  const output = {
    meta: {
      respondent,
      timestamp: now,
      questionnaire: plainText(questData.meta.title)
    },
    answers:   {},
    confirmed: [],
    skipped:   []
  };

  const allSections = [...questData.sections];
  if (questData.summary) allSections.push({ questions: questData.summary.questions });

  for (const section of allSections) {
    for (const q of section.questions) {
      if (answers[q.id]    !== undefined) output.answers[q.id] = answers[q.id];
      if (confirmed.has(q.id))            output.confirmed.push(q.id);
      if (skipped.has(q.id))              output.skipped.push(q.id);
    }
  }

  const yamlStr = jsyaml.dump(output, { lineWidth: 100, indent: 2 });
  const blob = new Blob([yamlStr], { type: 'text/yaml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const safeName = respondent.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
  a.download = `answers_${safeName}_${now.substring(0, 10)}.yaml`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded! / 下载完成！');
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

loadQuestionnaire();
