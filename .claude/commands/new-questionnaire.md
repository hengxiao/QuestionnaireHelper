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
        context: TextValue  # optional — framing shown below the title
        prompts:            # optional — bullet points guiding the response
          - TextValue
          - TextValue

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

## Rules

- `meta.title` is required.
- Every `section.id` must be unique among sections.
- Every `question.id` must be unique across **all** sections AND the summary.
- `prompts` must be an array (not a plain string) if present.
- Use dot-notation IDs: `Q1.1`, `Q1.2`, `Q2.1`, … and `S1`, `S2`, … for summary questions.

## Output

- Write the file to the repo root.
- After writing, show the user the URL to preview it locally:
  `http://localhost:4001/questionnaire.html?yaml=<filename>`
- And the GitHub Pages URL (once pushed):
  `https://hengxiao.github.io/QuestionnaireHelper/questionnaire.html?yaml=<filename>`
