# QuestionnaireHelper — Agent Instructions

This repo contains a generic, client-side questionnaire app. All questionnaire-specific content lives in YAML files. The HTML/CSS/JS is reusable for any survey.

## Project structure

```
questionnaire.html   — respondent-facing form (loads a YAML via ?yaml= URL param)
reader.html          — organizer-facing viewer (loads answer YAML files from respondents)
validator.js         — YAML schema validator (UMD — works in browser and Node.js)
example.yaml         — reference questionnaire used by tests
tests/               — Playwright end-to-end and unit tests
```

## Creating a questionnaire YAML

When asked to compose a questionnaire YAML, produce a file following the schema below and save it to the repo root.

### Schema

```yaml
meta:
  title: TextValue          # required
  organization: TextValue   # optional
  description: TextValue    # optional

sections:                   # required, non-empty array
  - id: "1"                 # required, unique string
    title: TextValue        # required
    description: TextValue  # optional
    questions:              # required, non-empty array
      - id: "Q1.1"          # required, globally unique across ALL questions
        title: TextValue    # required
        type: text          # optional — text|single-choice|multiple-choice|true-false|ranking|score
        context: TextValue  # optional — shown below the question title
        prompts:            # optional — array of TextValue bullet points
          - TextValue
        options:            # required for single-choice, multiple-choice
          - TextValue
        items:              # required for ranking
          - TextValue
        condition:          # optional — disables question when condition not met
          question: "Q0.1"  # which question ID to watch
          equals: "Yes"     # for single-choice / true-false (compare answer string)
          # OR includes: "Option A"   # for multiple-choice (answer array contains this)
          # OR min_score: 4           # for score (answer >= this)
          # OR answered: true         # any answer present
        disabled_message: TextValue  # optional; auto-generated if absent

summary:                    # optional closing section
  title: TextValue          # required if block is present
  description: TextValue    # optional
  questions:
    - id: "S1"
      title: TextValue
```

### TextValue

Any text field accepts a plain string or a bilingual object:

```yaml
title: "Plain string"

title:
  en: "English text"
  zh: "中文文本"
```

Any ISO language keys are valid. If any field uses a bilingual object, the UI automatically shows a language switcher.

### Question types

| type | Widget | Required fields |
|------|--------|----------------|
| `text` (default) | Textarea | — |
| `single-choice` | Radio buttons | `options: [TextValue]` |
| `multiple-choice` | Checkboxes | `options: [TextValue]` |
| `true-false` | Two toggle pill buttons | — |
| `ranking` | Drag-and-drop list | `items: [TextValue]` |
| `score` | 5-star rating (1–5) | — |

### Validation rules

- `meta.title` — required, non-empty.
- `sections` — required, non-empty array.
- Each `section.id` — unique among sections.
- Each `question.id` — globally unique across **all** sections and the summary.
- `prompts` — must be an array, never a plain string.
- `type` — must be one of `text`, `single-choice`, `multiple-choice`, `true-false`, `ranking`, `score`.
- `options` — required (non-empty TextValue array) for `single-choice` and `multiple-choice`.
- `items` — required (non-empty TextValue array) for `ranking`.
- `condition.question` — must reference an existing question ID.
- `condition` — must have exactly one trigger: `equals`, `includes`, `min_score`, or `answered`.

### ID conventions

- Section IDs: `"1"`, `"2"`, …
- Section question IDs: `"Q1.1"`, `"Q1.2"`, `"Q2.1"`, …
- Summary question IDs: `"S1"`, `"S2"`, …

### After creating a YAML file

1. **Validate immediately** — run the validator against the file you just wrote:
   ```bash
   node -e "
     const v = require('./validator.js');
     const yaml = require('js-yaml');
     const fs = require('fs');
     const data = yaml.load(fs.readFileSync('<filename>', 'utf8'));
     const errors = v.validateYAML(data);
     if (errors.length) { console.error('VALIDATION ERRORS:', errors); process.exit(1); }
     else console.log('Valid!');
   "
   ```
2. **Fix every error** and re-validate until the output is `Valid!`.
3. Tell the user the preview URLs:
   - **Local:** `http://localhost:4001/questionnaire.html?yaml=<filename>`
   - **GitHub Pages:** `https://hengxiao.github.io/QuestionnaireHelper/questionnaire.html?yaml=<filename>`

## Running tests

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

Always run tests after modifying `validator.js` or any of the `tests/` files.

## Code conventions

- No build step — plain HTML/CSS/JS, no bundler.
- `validator.js` uses UMD pattern so it works as both a `<script>` tag and a `require()`.
- All HTML escaping goes through `escHtml()` — never interpolate user/YAML content directly into innerHTML.
- TextValue rendering goes through `txt(val)` (returns HTML with bilingual spans) or `plainText(val)` (returns a bare string for document.title etc.).
