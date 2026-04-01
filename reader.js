// ── State ──────────────────────────────────────────────────────────────────
let questData    = null;   // parsed YAML from ?yaml= param
let loadedAnswers = [];    // [{name, data}, ...]
let allQuestions  = [];    // flat [{sectionId, sectionTitle, isSummary, q}, ...]

// ── YAML source ────────────────────────────────────────────────────────────
const yamlUrl = new URLSearchParams(location.search).get('yaml') || 'questionnaire.yaml';

// ── HTML escaping ──────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── TextValue helpers ──────────────────────────────────────────────────────
function txt(val) {
  if (typeof val === 'string') return escHtml(val);
  if (val && typeof val === 'object') {
    return Object.entries(val)
      .map(([lang, s]) => `<span class="${escHtml(lang)}-only">${escHtml(s)}</span>`)
      .join('');
  }
  return '';
}

function plainText(val) {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    const first = Object.values(val)[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
}

// ── Bilingual detection ────────────────────────────────────────────────────
// Only checks known TextValue positions to avoid false positives on
// plain-string questionnaires.
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
  if (!data || typeof data !== 'object') return false;
  if (data.meta) {
    if (isBilingualTextValue(data.meta.title))        return true;
    if (isBilingualTextValue(data.meta.organization)) return true;
    if (isBilingualTextValue(data.meta.description))  return true;
  }
  for (const section of (data.sections || [])) {
    if (isBilingualTextValue(section.title))       return true;
    if (isBilingualTextValue(section.description)) return true;
    for (const q of (section.questions || [])) {
      if (isBilingualTextValue(q.title))   return true;
      if (isBilingualTextValue(q.context)) return true;
      for (const p of (q.prompts || [])) {
        if (isBilingualTextValue(p)) return true;
      }
    }
  }
  if (data.summary) {
    if (isBilingualTextValue(data.summary.title))       return true;
    if (isBilingualTextValue(data.summary.description)) return true;
    for (const q of (data.summary.questions || [])) {
      if (isBilingualTextValue(q.title))   return true;
      if (isBilingualTextValue(q.context)) return true;
      for (const p of (q.prompts || [])) {
        if (isBilingualTextValue(p)) return true;
      }
    }
  }
  return false;
}

// ── Language ───────────────────────────────────────────────────────────────
function setLang(mode) {
  document.body.className = 'lang-' + mode;
  document.querySelectorAll('.lang-btn').forEach((b, i) =>
    b.classList.toggle('active', ['both', 'en', 'zh'][i] === mode)
  );
}

// ── Init: load questionnaire structure ────────────────────────────────────
async function init() {
  try {
    const resp = await fetch(yamlUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    questData = jsyaml.load(text);

    // Set page title and subtitle from meta
    if (questData.meta) {
      if (questData.meta.title) {
        document.getElementById('reader-title').innerHTML = txt(questData.meta.title);
        document.title = plainText(questData.meta.title) + ' — Answer Reader';
      }
      if (questData.meta.organization) {
        const sub = document.getElementById('reader-sub');
        sub.innerHTML = txt(questData.meta.organization);
        sub.style.display = '';
      }
    }

    // Show lang-bar if bilingual content
    if (detectBilingual(questData)) {
      document.getElementById('lang-bar').style.display = '';
    }

    // Build flat question index
    buildQuestionIndex();
  } catch (e) {
    console.warn('Could not load questionnaire YAML:', e.message);
    questData = null;
  }
}

function buildQuestionIndex() {
  allQuestions = [];
  if (!questData) return;

  for (const section of (questData.sections || [])) {
    for (const q of (section.questions || [])) {
      allQuestions.push({
        sectionId:    section.id,
        sectionTitle: section.title,
        isSummary:    false,
        q
      });
    }
  }
  if (questData.summary) {
    for (const q of (questData.summary.questions || [])) {
      allQuestions.push({
        sectionId:    'S',
        sectionTitle: questData.summary.title,
        isSummary:    true,
        q
      });
    }
  }
}

// ── File handling ──────────────────────────────────────────────────────────
const dropArea = document.getElementById('drop-area');
dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  const toLoad = Array.from(files).filter(f =>
    f.name.endsWith('.yaml') || f.name.endsWith('.yml')
  );
  let pending = toLoad.length;
  if (!pending) return;

  toLoad.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = jsyaml.load(e.target.result);
        if (!data || typeof data.answers !== 'object') {
          console.warn(file.name, 'does not look like an answer file');
        }
        // Use respondent name as dedup key; fall back to filename
        const name = data?.meta?.respondent || file.name;
        if (!loadedAnswers.find(a => a.name === name && a.filename === file.name)) {
          loadedAnswers.push({ filename: file.name, name, data });
        }
      } catch (err) {
        console.error('Parse error in', file.name, err);
      }
      if (--pending === 0) {
        renderAll();
        updateUI();
      }
    };
    reader.readAsText(file);
  });
}

function removeFile(filename) {
  loadedAnswers = loadedAnswers.filter(a => a.filename !== filename);
  renderAll();
  updateUI();
}

function clearAll() {
  loadedAnswers = [];
  renderAll();
  updateUI();
}

// ── Update UI visibility ───────────────────────────────────────────────────
function updateUI() {
  const n = loadedAnswers.length;
  const statsPanel = document.getElementById('stats-panel');
  const filterBar  = document.getElementById('filter-bar');
  const jumpNav    = document.getElementById('jump-nav');
  const clearBtn   = document.getElementById('clear-btn');
  const statusCount = document.getElementById('status-count');

  const show = n > 0;
  statsPanel.style.display  = show ? '' : 'none';
  filterBar.style.display   = show ? '' : 'none';
  jumpNav.style.display     = show ? '' : 'none';
  clearBtn.style.display    = show ? '' : 'none';

  statusCount.innerHTML = n > 0
    ? `<strong>${n}</strong> file${n !== 1 ? 's' : ''} loaded / 已加载 <strong>${n}</strong> 份答卷`
    : '';

  // Render file tags
  const fileList = document.getElementById('file-list');
  fileList.innerHTML = '';
  loadedAnswers.forEach(({ filename, data }) => {
    const respondent = data?.meta?.respondent || 'Anonymous';
    const ts = data?.meta?.timestamp ? new Date(data.meta.timestamp).toLocaleDateString() : '';
    const tag = document.createElement('div');
    tag.className = 'file-tag';
    tag.innerHTML = `
      <span class="fname">${escHtml(filename)}</span>
      <span class="respondent">${escHtml(respondent)}</span>
      ${ts ? `<span class="answer-date">${escHtml(ts)}</span>` : ''}
      <button class="remove-btn" onclick="removeFile('${filename.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">✕</button>`;
    fileList.appendChild(tag);
  });
}

// ── Render All ─────────────────────────────────────────────────────────────
function renderAll() {
  const results = document.getElementById('results');

  if (loadedAnswers.length === 0) {
    results.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="en-only">Load one or more answer files to see results.</div>
      <div class="zh-only">请加载一个或多个答卷文件以查看汇总结果。</div>
    </div>`;
    return;
  }

  if (questData === null) {
    renderFallback(results);
    return;
  }

  renderStructured(results);
}

// ── Structured rendering (with questData) ─────────────────────────────────
function renderStructured(results) {
  results.innerHTML = '';

  // Stats
  renderStats();

  // Jump nav
  renderJumpNav();

  // Group by section
  const sectionMap = new Map();
  for (const item of allQuestions) {
    if (!sectionMap.has(item.sectionId)) {
      sectionMap.set(item.sectionId, {
        sectionId:    item.sectionId,
        sectionTitle: item.sectionTitle,
        isSummary:    item.isSummary,
        questions:    []
      });
    }
    sectionMap.get(item.sectionId).questions.push(item.q);
  }

  for (const [sectionId, section] of sectionMap) {
    const card = document.createElement('div');
    card.className = 'section-card' + (section.isSummary ? ' summary-section' : '');
    card.id = 'section-' + sectionId;

    const header = document.createElement('div');
    header.className = 'section-header section-toggle';
    header.innerHTML = `
      <div class="sec-num">${sectionId === 'S' ? '★' : escHtml(String(sectionId))}</div>
      <div class="sec-title">${txt(section.sectionTitle)}</div>`;
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'section-body';

    for (const q of section.questions) {
      body.appendChild(renderQuestionBlock(q));
    }

    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
    });

    card.appendChild(body);
    results.appendChild(card);
  }

  applyFilter();
}

function renderQuestionBlock(q) {
  const qAnswers = loadedAnswers
    .filter(({ data }) => data?.answers?.[q.id] && String(data.answers[q.id]).trim())
    .map(({ data }) => ({
      respondent:  data?.meta?.respondent || 'Anonymous',
      timestamp:   data?.meta?.timestamp  || '',
      text:        String(data.answers[q.id]),
      isConfirmed: Array.isArray(data?.confirmed) && data.confirmed.includes(q.id)
    }));

  const qSkipped = loadedAnswers
    .filter(({ data }) => Array.isArray(data?.skipped) && data.skipped.includes(q.id))
    .map(({ data }) => ({ respondent: data?.meta?.respondent || 'Anonymous' }));

  const nConfirmed = qAnswers.filter(a => a.isConfirmed).length;

  const qBlock = document.createElement('div');
  qBlock.className = 'question-block ' + (qAnswers.length > 0 ? 'q-answered' : 'q-unanswered');
  qBlock.dataset.qid = q.id;
  qBlock.dataset.searchtext = [
    q.id,
    typeof q.title === 'string' ? q.title : (q.title?.en || '') + ' ' + (q.title?.zh || ''),
    typeof q.context === 'string' ? q.context : (q.context?.en || '') + ' ' + (q.context?.zh || ''),
    ...qAnswers.map(a => a.text)
  ].join(' ').toLowerCase();

  const hasContextEn = q.context?.en && String(q.context.en).trim();
  const hasContextZh = q.context?.zh && String(q.context.zh).trim();
  const hasContextStr = typeof q.context === 'string' && q.context.trim();

  let contextHtml = '';
  if (hasContextStr) {
    contextHtml = `<div class="q-context-en">${escHtml(q.context)}</div>`;
  } else {
    if (hasContextEn) contextHtml += `<div class="q-context-en en-only">${escHtml(q.context.en)}</div>`;
    if (hasContextZh) contextHtml += `<div class="q-context-zh zh-only">${escHtml(q.context.zh)}</div>`;
  }

  qBlock.innerHTML = `
    <div class="question-header">
      <div>
        <span class="q-id-badge">${escHtml(q.id)}</span>
        ${typeof q.title === 'string'
          ? `<span class="q-title">${escHtml(q.title)}</span>`
          : `<span class="q-title en-only">${escHtml(q.title?.en || '')}</span>
             <span class="q-title zh-only">${escHtml(q.title?.zh || '')}</span>`}
      </div>
      ${contextHtml}
    </div>
    <div class="answers-container">
      <div class="answer-count-bar">
        <span class="answered-badge">${qAnswers.length} / ${loadedAnswers.length}
          <span class="en-only">answered</span><span class="zh-only">人作答</span>
        </span>
        ${nConfirmed > 0 ? `<span class="answered-badge confirmed-badge">
          ${nConfirmed} <span class="en-only">confirmed</span><span class="zh-only">已确认</span>
        </span>` : ''}
        ${qSkipped.length > 0 ? `<span class="answered-badge skipped-badge">
          ${qSkipped.length} <span class="en-only">skipped</span><span class="zh-only">已跳过</span>
        </span>` : ''}
        ${qAnswers.length === 0 && qSkipped.length === 0
          ? `<span class="not-answered-badge en-only">No answers yet</span>
             <span class="not-answered-badge zh-only">暂无回答</span>` : ''}
      </div>
      ${qAnswers.map(a => `
        <div class="answer-card${a.isConfirmed ? ' answer-card-confirmed' : ''}">
          <div class="answer-card-header${a.isConfirmed ? ' answer-card-header-confirmed' : ''}">
            <span class="respondent-name${a.isConfirmed ? ' respondent-confirmed' : ''}">${escHtml(a.respondent)}</span>
            <span style="display:flex;align-items:center;gap:6px">
              ${a.isConfirmed ? `<span class="confirmed-label">
                ✓ <span class="en-only">Confirmed</span><span class="zh-only">已确认</span>
              </span>` : ''}
              ${a.timestamp ? `<span class="answer-date">${new Date(a.timestamp).toLocaleDateString()}</span>` : ''}
            </span>
          </div>
          <div class="answer-text">${escHtml(a.text)}</div>
        </div>`).join('')}
      ${qSkipped.map(a => `
        <div class="answer-card answer-card-skipped">
          <div class="answer-card-header answer-card-header-skipped">
            <span class="respondent-name respondent-skipped">${escHtml(a.respondent)}</span>
            <span class="skipped-label">
              ⊘ <span class="en-only">Skipped</span><span class="zh-only">已跳过</span>
            </span>
          </div>
        </div>`).join('')}
      ${qAnswers.length === 0 && qSkipped.length === 0
        ? `<div class="no-answer en-only">No one answered this question yet.</div>
           <div class="no-answer zh-only">暂无人回答此题。</div>` : ''}
    </div>`;

  return qBlock;
}

// ── Fallback rendering (no questData) ────────────────────────────────────
function renderFallback(results) {
  results.innerHTML = '';

  const allQids = new Set();
  loadedAnswers.forEach(({ data }) => {
    if (data?.answers) Object.keys(data.answers).forEach(k => allQids.add(k));
  });

  renderStats();

  const card = document.createElement('div');
  card.className = 'section-card';
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<div class="sec-title">All Answers (raw) / 全部回答</div>`;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'section-body';

  [...allQids].sort().forEach(qid => {
    const qAnswers = loadedAnswers
      .filter(({ data }) => data?.answers?.[qid] && String(data.answers[qid]).trim())
      .map(({ data }) => ({
        respondent: data?.meta?.respondent || 'Anonymous',
        timestamp:  data?.meta?.timestamp || '',
        text:       String(data.answers[qid])
      }));

    const qBlock = document.createElement('div');
    qBlock.className = 'question-block ' + (qAnswers.length > 0 ? 'q-answered' : 'q-unanswered');
    qBlock.dataset.qid = qid;
    qBlock.dataset.searchtext = [qid, ...qAnswers.map(a => a.text)].join(' ').toLowerCase();

    qBlock.innerHTML = `
      <div class="question-header">
        <span class="q-id-badge">${escHtml(qid)}</span>
      </div>
      <div class="answers-container">
        <div class="answer-count-bar">
          <span class="answered-badge">${qAnswers.length} / ${loadedAnswers.length}
            <span class="en-only">answered</span><span class="zh-only">人作答</span>
          </span>
        </div>
        ${qAnswers.map(a => `
          <div class="answer-card">
            <div class="answer-card-header">
              <span class="respondent-name">${escHtml(a.respondent)}</span>
              ${a.timestamp ? `<span class="answer-date">${new Date(a.timestamp).toLocaleDateString()}</span>` : ''}
            </div>
            <div class="answer-text">${escHtml(a.text)}</div>
          </div>`).join('')}
      </div>`;
    body.appendChild(qBlock);
  });

  card.appendChild(body);
  results.appendChild(card);
}

// ── Stats ──────────────────────────────────────────────────────────────────
function renderStats() {
  const respondents = loadedAnswers.length;

  // Count questions with ≥1 answer
  let totalAnswered = 0;
  let totalConfirmed = 0;

  if (questData) {
    allQuestions.forEach(({ q }) => {
      const hasAnswer = loadedAnswers.some(
        ({ data }) => data?.answers?.[q.id] && String(data.answers[q.id]).trim()
      );
      if (hasAnswer) totalAnswered++;

      const hasConfirmed = loadedAnswers.some(
        ({ data }) => Array.isArray(data?.confirmed) && data.confirmed.includes(q.id)
      );
      if (hasConfirmed) totalConfirmed++;
    });
  } else {
    const allQids = new Set();
    loadedAnswers.forEach(({ data }) => {
      if (data?.answers) Object.keys(data.answers).forEach(k => allQids.add(k));
    });
    totalAnswered = allQids.size;
  }

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${respondents}</div>
      <div class="stat-label en-only">Respondents</div>
      <div class="stat-label zh-only">参与人数</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${questData ? allQuestions.length : '—'}</div>
      <div class="stat-label en-only">Total Questions</div>
      <div class="stat-label zh-only">问题总数</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalAnswered}</div>
      <div class="stat-label en-only">Questions with ≥1 Answer</div>
      <div class="stat-label zh-only">有回答的问题数</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${totalConfirmed}</div>
      <div class="stat-label en-only">Questions with ≥1 Confirmed</div>
      <div class="stat-label zh-only">有确认回答的问题数</div>
    </div>`;
}

// ── Jump Nav ───────────────────────────────────────────────────────────────
function renderJumpNav() {
  const navInner = document.getElementById('jump-nav-inner');
  navInner.innerHTML = '';

  const seen = new Set();
  for (const item of allQuestions) {
    if (seen.has(item.sectionId)) continue;
    seen.add(item.sectionId);

    const a = document.createElement('a');
    a.href = '#section-' + item.sectionId;

    if (item.isSummary) {
      a.innerHTML = `<span class="en-only">Summary</span><span class="zh-only">总结</span>`;
    } else {
      const shortTitle = typeof item.sectionTitle === 'string'
        ? item.sectionTitle.split(' ').slice(0, 3).join(' ')
        : (item.sectionTitle?.en || '').split(' ').slice(0, 3).join(' ');
      a.textContent = `§${item.sectionId} ${shortTitle}`;
    }
    navInner.appendChild(a);
  }
}

// ── Filter ─────────────────────────────────────────────────────────────────
function applyFilter() {
  const mode   = document.getElementById('filter-mode').value;
  const search = document.getElementById('search-box').value.toLowerCase().trim();

  document.querySelectorAll('.question-block[data-qid]').forEach(block => {
    const hasAnswers = block.classList.contains('q-answered');
    let show = true;

    if (mode === 'answered'   && !hasAnswers) show = false;
    if (mode === 'unanswered' &&  hasAnswers) show = false;

    if (show && search) {
      const searchText = block.dataset.searchtext || '';
      if (!searchText.includes(search)) show = false;
    }

    block.style.display = show ? '' : 'none';
  });

  // Hide section cards where all questions are hidden
  document.querySelectorAll('.section-card').forEach(card => {
    const visible = [...card.querySelectorAll('.question-block[data-qid]')]
      .some(b => b.style.display !== 'none');
    card.style.display = visible ? '' : 'none';
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
