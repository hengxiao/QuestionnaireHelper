---
trigger: glob
globs:
  - "*.yaml"
  - "*.yml"
---

# QuestionnaireHelper — YAML authoring rules

This project is a generic client-side questionnaire app. All survey content lives in YAML files loaded via `?yaml=<file>` URL parameter. The HTML/CSS/JS files are reusable for any survey.

## Schema

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
        prompts:            # optional — array of TextValue bullet points
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

summary:                    # optional — omit entirely if not needed
  title: TextValue          # required if block is present
  description: TextValue    # optional
  questions:
    - id: "S1"
      title: TextValue
```

## TextValue

```yaml
title: "Plain string"

# or bilingual (triggers language switcher in the UI):
title:
  en: "English"
  zh: "中文"
```

## Question types

| type | Widget | Required fields |
|------|--------|----------------|
| `text` (default) | Textarea | — |
| `single-choice` | Radio buttons | `options: [TextValue]` |
| `multiple-choice` | Checkboxes | `options: [TextValue]` |
| `true-false` | Two toggle pill buttons | — |
| `ranking` | Drag-and-drop ordered list | `items: [TextValue]` |
| `score` | 5-star rating (1–5) | — |

## Validation rules

1. `meta.title` required and non-empty.
2. `sections` must be a non-empty array.
3. Each `section.id` unique among sections.
4. Each `question.id` globally unique across all sections **and** summary.
5. `prompts` must be an array if present.
6. `type` must be one of `text`, `single-choice`, `multiple-choice`, `true-false`, `ranking`, `score`.
7. `options` required (non-empty TextValue array) for `single-choice` and `multiple-choice`.
8. `items` required (non-empty TextValue array) for `ranking`.
9. `condition.question` must reference an existing question ID.
10. `condition` must have exactly one trigger: `equals`, `includes`, `min_score`, or `answered`.

## ID conventions

- Sections: `"1"`, `"2"`, …
- Questions: `"Q1.1"`, `"Q1.2"`, `"Q2.1"`, …
- Summary: `"S1"`, `"S2"`, …

## After writing a YAML file

Validate immediately after writing:

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

Fix every reported error and re-validate until the output is `Valid!`.

## Preview URLs

After the file is valid, show the user:
- Local: `http://localhost:4001/questionnaire.html?yaml=<file>`
- GitHub Pages: `https://hengxiao.github.io/QuestionnaireHelper/questionnaire.html?yaml=<file>`
