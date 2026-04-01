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
        context: TextValue  # optional
        prompts:            # optional — array of TextValue bullet points
          - TextValue

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

## Validation rules

1. `meta.title` required and non-empty.
2. `sections` must be a non-empty array.
3. Each `section.id` unique among sections.
4. Each `question.id` globally unique across all sections **and** summary.
5. `prompts` must be an array if present.

## ID conventions

- Sections: `"1"`, `"2"`, …
- Questions: `"Q1.1"`, `"Q1.2"`, `"Q2.1"`, …
- Summary: `"S1"`, `"S2"`, …

## Preview URLs

After creating a YAML, suggest:
- Local: `http://localhost:4001/questionnaire.html?yaml=<file>`
- GitHub Pages: `https://hengxiao.github.io/QuestionnaireHelper/questionnaire.html?yaml=<file>`
