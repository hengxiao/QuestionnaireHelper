# QuestionnaireHelper

Generic client-side questionnaire app. All survey content lives in YAML files — the HTML/CSS/JS is reusable for any questionnaire.

## Key files

| File | Role |
|------|------|
| `questionnaire.html` + `questionnaire.js` | Respondent form — fetches `?yaml=<file>`, validates, renders |
| `reader.html` + `reader.js` | Organizer viewer — loads answer YAMLs, shows responses per question |
| `validator.js` | UMD schema validator — `validateYAML(data)` returns `string[]` of errors |
| `example.yaml` | Reference questionnaire used by all tests |
| `tests/` | Playwright tests (101 total) |

## Commands

```bash
node serve.js 4001      # start dev server at http://localhost:4001
npm test                # run all 101 Playwright tests
```

## Custom slash commands

- `/new-questionnaire <description>` — generate a new questionnaire YAML from a plain-language description

## Code conventions

- No build step — plain HTML/CSS/JS.
- `validator.js` is UMD: works as `<script>` in browser and `require()` in Node.
- All YAML text rendered via `txt(val)` (HTML) or `plainText(val)` (bare string). Never interpolate YAML directly into innerHTML.
- TextValue = plain string OR `{en: "...", zh: "..."}` bilingual object.

## Testing

After any change to `validator.js` or `tests/`, run `npm test`. All 101 tests must pass.
