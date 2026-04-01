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
        context: TextValue  # optional
        prompts:            # optional — array of TextValue
          - TextValue

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

### Validation rules (enforced by validator.js)

- `meta.title` is required and non-empty.
- `sections` must be a non-empty array.
- Each `section.id` must be unique among sections.
- Each `question.id` must be **globally unique** across all sections and the summary.
- `prompts` must be an array if present (not a plain string).

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

## Testing

```bash
npm install
npx playwright install chromium   # first time
npm test
```

Tests live in `tests/` and cover the questionnaire form, answer reader, and YAML validator.
