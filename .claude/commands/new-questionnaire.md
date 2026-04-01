Create a new questionnaire YAML file for the QuestionnaireHelper app.

The user's request: $ARGUMENTS

---

Generate a complete, valid YAML file following the schema below. Write it to a new `.yaml` file whose name reflects the questionnaire topic (e.g. `staff-survey.yaml`).

## Schema

```yaml
# Required
meta:
  title: TextValue          # required — shown in page header and browser tab
  organization: TextValue   # optional — shown below the title
  description: TextValue    # optional

# Required — at least one section, each with at least one question
sections:
  - id: "1"                 # required, unique string
    title: TextValue        # required
    description: TextValue  # optional
    questions:
      - id: "Q1.1"          # required, globally unique across ALL questions
        title: TextValue    # required
        type: text          # optional — text|single-choice|multiple-choice|true-false|ranking|score
        context: TextValue  # optional — framing shown below the title
        prompts:            # optional — bullet points guiding the response
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

# Optional — rendered with a distinct dark header
summary:
  title: TextValue
  description: TextValue    # optional
  questions:
    - id: "S1"
      title: TextValue
```

## TextValue

Any text field accepts either a plain string or a bilingual object:

```yaml
title: "Plain English question"

# — or bilingual —
title:
  en: "How would you rate the experience?"
  zh: "您如何评价这次体验？"
```

If ANY field in the file is a bilingual object, a language switcher (EN / 中文 / both) appears automatically in the UI.

## Question types

| type | Widget | Required fields |
|------|--------|----------------|
| `text` (default) | Textarea | — |
| `single-choice` | Radio buttons | `options: [TextValue]` |
| `multiple-choice` | Checkboxes | `options: [TextValue]` |
| `true-false` | Two toggle pill buttons | — |
| `ranking` | Drag-and-drop ordered list | `items: [TextValue]` |
| `score` | 5-star rating (1–5) | — |

## Rules

- `meta.title` is required.
- Every `section.id` must be unique among sections.
- Every `question.id` must be unique across **all** sections AND the summary.
- `prompts` must be an array (not a plain string) if present.
- `type` must be one of `text`, `single-choice`, `multiple-choice`, `true-false`, `ranking`, `score`.
- `options` required (non-empty TextValue array) for `single-choice` and `multiple-choice`.
- `items` required (non-empty TextValue array) for `ranking`.
- `condition.question` must reference an existing question ID.
- `condition` must have exactly one of: `equals`, `includes`, `min_score`, `answered`.
- Use dot-notation IDs: `Q1.1`, `Q1.2`, `Q2.1`, … and `S1`, `S2`, … for summary questions.

## Output

1. Write the YAML file to the repo root.
2. **Validate immediately** — run the validator against the file you just wrote:
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
3. **Fix every error** returned by the validator and re-validate until there are none.
4. Show the user the URLs to preview the finished file:
   - Local: `http://localhost:4001/questionnaire.html?yaml=<filename>`
   - GitHub Pages: `https://hengxiao.github.io/QuestionnaireHelper/questionnaire.html?yaml=<filename>`
