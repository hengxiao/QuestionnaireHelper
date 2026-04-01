# QuestionnaireHelper — Copilot Instructions

This repo is a generic, client-side questionnaire app. All survey content lives in YAML files; the HTML/CSS/JS files are reusable for any questionnaire.

## YAML schema

When asked to create or edit a questionnaire YAML, follow this schema exactly.

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
        context: TextValue  # optional
        prompts:            # optional — array of TextValue
          - TextValue
        options:            # required for single-choice, multiple-choice
          - TextValue
        items:              # required for ranking
          - TextValue
        condition:          # optional — disables question when condition not met
          question: "Q0.1"  # which question ID to watch
          equals: "Yes"     # for single-choice / true-false
          # OR includes: "Option A"   # for multiple-choice
          # OR min_score: 4           # for score
          # OR answered: true         # any answer present
        disabled_message: TextValue  # optional; auto-generated if absent

summary:                    # optional closing section
  title: TextValue          # required if summary is present
  description: TextValue    # optional
  questions:                # required if summary is present
    - id: "S1"
      title: TextValue
```

### TextValue

Any text field is either a plain string or a bilingual object:

```yaml
title: "Plain string"

title:
  en: "English text"
  zh: "中文文本"
```

Language keys can be any ISO code (`en`, `zh`, `fr`, etc.). If any field uses a bilingual object, the UI shows a language switcher automatically.

### Question types

| type | Widget | Required fields |
|------|--------|----------------|
| `text` (default) | Textarea | — |
| `single-choice` | Radio buttons | `options: [TextValue]` |
| `multiple-choice` | Checkboxes | `options: [TextValue]` |
| `true-false` | Two toggle pill buttons | — |
| `ranking` | Drag-and-drop ordered list | `items: [TextValue]` |
| `score` | 5-star rating (1–5) | — |

### Validation rules (enforced by validator.js)

- `meta.title` is required and non-empty.
- `sections` must be a non-empty array.
- Each `section.id` must be unique among sections.
- Each `question.id` must be **globally unique** across all sections and the summary.
- `prompts` must be an array if present (not a plain string).
- `type` must be one of `text`, `single-choice`, `multiple-choice`, `true-false`, `ranking`, `score`.
- `options` required (non-empty TextValue array) for `single-choice` and `multiple-choice`.
- `items` required (non-empty TextValue array) for `ranking`.
- `condition.question` must reference an existing question ID.
- `condition` must have exactly one trigger: `equals`, `includes`, `min_score`, or `answered`.

### Naming conventions

- Section IDs: `"1"`, `"2"`, `"3"`, …
- Section question IDs: `"Q1.1"`, `"Q1.2"`, `"Q2.1"`, …
- Summary question IDs: `"S1"`, `"S2"`, …

## Usage

The questionnaire page is served at:
```
questionnaire.html?yaml=your-file.yaml
reader.html?yaml=your-file.yaml
```

The `?yaml=` parameter points to any YAML file served from the same origin. Default is `questionnaire.yaml`.

## After writing a YAML file

Always validate immediately after writing a questionnaire YAML. Run:

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

Fix every error reported and re-validate until the output is `Valid!`.

## Testing

```bash
npm install
npx playwright install chromium   # first time
npm test
```

Tests live in `tests/` and cover the questionnaire form, answer reader, and YAML validator.
