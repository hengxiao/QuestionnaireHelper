# QuestionnaireHelper

A lightweight, purely client-side questionnaire app driven by a YAML file. All questionnaire content lives in the YAML — the HTML/CSS/JS files are generic and reusable for any survey.

## How it works

| File | Role |
|------|------|
| `questionnaire.html` | Respondent-facing form — reads a YAML file and renders the questionnaire |
| `reader.html` | Organizer-facing viewer — loads multiple answer files and shows responses side-by-side |
| `validator.js` | Shared YAML schema validator (works in browser and Node.js) |
| `your-survey.yaml` | **All questionnaire-specific content lives here** |

---

## Quick start

### 1. Create your questionnaire YAML

Copy `example.yaml` as a starting point:

```yaml
meta:
  title: "My Survey"           # plain string, or bilingual: {en: "...", zh: "..."}
  organization: "My Org"       # optional

sections:
  - id: "1"
    title: "Background"
    questions:
      - id: "Q1.1"
        title: "How long have you been with the organization?"
        prompts:               # optional bullet-point hints
          - "Include any prior roles"

summary:                       # optional closing section (rendered with a dark header)
  title: "Final Thoughts"
  questions:
    - id: "S1"
      title: "Any other comments?"
```

Text fields (`title`, `context`, `prompts`) accept either a plain string or a bilingual object:

```yaml
title:
  en: "How do you rate the experience?"
  zh: "您如何评价这次体验？"
```

If any field is bilingual, a language switcher (EN / 中文 / both) appears automatically.

### 2. Serve the files

Open a terminal in this directory and run:

```bash
node serve.js
```

Then open [http://localhost:4001/questionnaire.html?yaml=your-survey.yaml](http://localhost:4001/questionnaire.html?yaml=your-survey.yaml).

The `?yaml=` parameter tells the app which YAML file to load. It defaults to `questionnaire.yaml` if omitted.

### 3. Distribute to respondents

Share the URL (or the folder) with respondents. They:

1. Fill in their name (required before downloading).
2. Answer questions — answers auto-save to `localStorage` so work is never lost on refresh.
3. Mark each answer **Confirmed** when satisfied, or **Skip** if they have no opinion.
4. Click **Download Answers** once all questions are confirmed or skipped — this saves a YAML file.

### 4. Review responses

Collect the answer YAML files from respondents and open:

```
http://localhost:4001/reader.html?yaml=your-survey.yaml
```

Drag-and-drop (or use the file picker) to load one or more answer files. The reader shows all responses grouped by question, with filter/search and per-question confirmed/skipped counts.

---

## YAML schema reference

### Required top-level keys

| Key | Type | Description |
|-----|------|-------------|
| `meta.title` | TextValue | Shown in the page header and browser tab |
| `sections` | array | At least one section, each with at least one question |

### Optional top-level keys

| Key | Type | Description |
|-----|------|-------------|
| `meta.organization` | TextValue | Shown below the title |
| `meta.description` | TextValue | Additional header text |
| `summary` | object | Closing section rendered with a distinct dark header |

### Section fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | yes | string | Unique identifier (used in TOC anchors) |
| `title` | yes | TextValue | Section heading |
| `description` | no | TextValue | Shown below the heading |
| `questions` | yes | array | At least one question |

### Question fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | yes | string | Unique across **all** questions (sections + summary) |
| `title` | yes | TextValue | The question text |
| `context` | no | TextValue | Additional framing shown below the title |
| `prompts` | no | array of TextValue | Bullet points guiding the response |

**TextValue** = a plain string OR an object whose values are all strings, e.g. `{en: "...", zh: "..."}`.

---

## Validation

The app validates the YAML on load and displays all errors inline if the schema is invalid. You can also use the validator directly in Node.js:

```js
const { validateYAML } = require('./validator.js');
const jsyaml = require('js-yaml');

const data = jsyaml.load(require('fs').readFileSync('my-survey.yaml', 'utf8'));
const errors = validateYAML(data);
if (errors.length) console.error(errors);
```

---

## Running the tests

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

101 tests cover the questionnaire form, the answer reader, and the YAML validator.
