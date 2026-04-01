// @ts-check
const { test, expect } = require('@playwright/test');
const { validateYAML } = require('../validator.js');

// ── Helper builders ────────────────────────────────────────────────────────

function minimalValid() {
  return {
    meta: { title: 'My Survey' },
    sections: [
      {
        id: '1',
        title: 'Section One',
        questions: [
          { id: 'Q1', title: 'Question one' }
        ]
      }
    ]
  };
}

function fullValid() {
  return {
    meta: {
      title: { en: 'My Survey', zh: '我的问卷' },
      organization: { en: 'Org', zh: '组织' }
    },
    sections: [
      {
        id: '1',
        title: { en: 'Section 1', zh: '第一节' },
        description: { en: 'Desc', zh: '描述' },
        questions: [
          {
            id: 'Q1.1',
            title: { en: 'Q1 EN', zh: 'Q1 ZH' },
            context: { en: 'Ctx', zh: '上下文' },
            prompts: [
              { en: 'Prompt EN', zh: '提示 ZH' }
            ]
          }
        ]
      },
      {
        id: '2',
        title: 'Section 2',
        questions: [
          { id: 'Q2.1', title: 'Q2' }
        ]
      }
    ],
    summary: {
      title: { en: 'Summary', zh: '总结' },
      description: { en: 'Fin', zh: '最后' },
      questions: [
        { id: 'S1', title: { en: 'Any comments?', zh: '有意见吗？' } }
      ]
    }
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('validateYAML', () => {

  // 1. Valid minimal YAML
  test('valid minimal YAML returns no errors', () => {
    const errors = validateYAML(minimalValid());
    expect(errors).toHaveLength(0);
  });

  // 2. Valid full YAML with all optional fields
  test('valid full YAML with all optional fields returns no errors', () => {
    const errors = validateYAML(fullValid());
    expect(errors).toHaveLength(0);
  });

  // 3. Root is null
  test('root is null returns error mentioning Root must be', () => {
    const errors = validateYAML(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Root must be/i);
  });

  // 4. Root is a string
  test('root is a string returns error mentioning Root must be', () => {
    const errors = validateYAML('just a string');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Root must be/i);
  });

  // 5. Missing meta
  test('missing meta returns error mentioning meta', () => {
    const data = minimalValid();
    delete data.meta;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('meta'))).toBe(true);
  });

  // 6. meta.title is empty string
  test('meta.title is empty string returns error', () => {
    const data = minimalValid();
    data.meta.title = '';
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('meta.title'))).toBe(true);
  });

  // 7. meta.title is object with empty string value
  test('meta.title is bilingual object with empty value returns error', () => {
    const data = minimalValid();
    data.meta.title = { en: '', zh: '问卷' };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('meta.title'))).toBe(true);
  });

  // 8. meta.title is missing
  test('meta.title is missing returns error', () => {
    const data = minimalValid();
    delete data.meta.title;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('meta.title'))).toBe(true);
  });

  // 9. sections missing
  test('sections missing returns error mentioning sections', () => {
    const data = minimalValid();
    delete data.sections;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections'))).toBe(true);
  });

  // 10. sections is empty array
  test('sections is empty array returns error', () => {
    const data = minimalValid();
    data.sections = [];
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections'))).toBe(true);
  });

  // 11. sections[0] missing id
  test('sections[0] missing id returns error with path sections[0].id', () => {
    const data = minimalValid();
    delete data.sections[0].id;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections[0]') && e.includes('id'))).toBe(true);
  });

  // 12. sections[0] missing title
  test('sections[0] missing title returns error with path sections[0].title', () => {
    const data = minimalValid();
    delete data.sections[0].title;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections[0]') && e.includes('title'))).toBe(true);
  });

  // 13. sections[0].questions is empty
  test('sections[0].questions is empty array returns error', () => {
    const data = minimalValid();
    data.sections[0].questions = [];
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections[0]') && e.includes('questions'))).toBe(true);
  });

  // 14. sections[0].questions[0] missing id
  test('sections[0].questions[0] missing id returns error with path', () => {
    const data = minimalValid();
    delete data.sections[0].questions[0].id;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections[0].questions[0]') && e.includes('id'))).toBe(true);
  });

  // 15. sections[0].questions[0] missing title
  test('sections[0].questions[0] missing title returns error with path', () => {
    const data = minimalValid();
    delete data.sections[0].questions[0].title;
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('sections[0].questions[0]') && e.includes('title'))).toBe(true);
  });

  // 16. Duplicate section IDs
  test('duplicate section IDs returns error mentioning duplicate', () => {
    const data = minimalValid();
    data.sections.push({
      id: '1',  // duplicate
      title: 'Another Section',
      questions: [{ id: 'Q99', title: 'Extra' }]
    });
    const errors = validateYAML(data);
    expect(errors.some(e => /duplicate|not unique/i.test(e))).toBe(true);
  });

  // 17. Duplicate question IDs across sections
  test('duplicate question IDs across sections returns error', () => {
    const data = minimalValid();
    data.sections.push({
      id: '2',
      title: 'Section 2',
      questions: [{ id: 'Q1', title: 'Duplicate Q' }]  // same as Q1 in section 1
    });
    const errors = validateYAML(data);
    expect(errors.some(e => /duplicate|not unique/i.test(e))).toBe(true);
  });

  // 18. Duplicate question ID between section and summary
  test('duplicate question ID between section and summary returns error', () => {
    const data = minimalValid();
    data.summary = {
      title: 'Summary',
      questions: [{ id: 'Q1', title: 'Same id as in section' }]  // duplicate of Q1
    };
    const errors = validateYAML(data);
    expect(errors.some(e => /duplicate|not unique/i.test(e))).toBe(true);
  });

  // 19. prompts is a string (not array)
  test('prompts is a string instead of array returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].prompts = 'should be an array';
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('prompts'))).toBe(true);
  });

  // 20. summary present but no title
  test('summary present but no title returns error', () => {
    const data = minimalValid();
    data.summary = {
      questions: [{ id: 'S1', title: 'Summary Q' }]
    };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('summary') && e.includes('title'))).toBe(true);
  });

  // 21. summary present but questions is empty
  test('summary present but questions is empty array returns error', () => {
    const data = minimalValid();
    data.summary = {
      title: 'Summary',
      questions: []
    };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('summary') && e.includes('questions'))).toBe(true);
  });

  // 22. Multiple errors returned at once (not just the first)
  test('multiple errors are all returned at once', () => {
    const data = {
      meta: { title: '' },           // error: meta.title
      sections: [
        {
          id: '',                     // error: sections[0].id
          title: '',                  // error: sections[0].title
          questions: []               // error: sections[0].questions
        }
      ]
    };
    const errors = validateYAML(data);
    expect(errors.length).toBeGreaterThan(1);
  });

  // ── New question types ────────────────────────────────────────────────────

  // 23. single-choice missing options → error
  test('single-choice missing options returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'single-choice';
    // no options field
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('options'))).toBe(true);
  });

  // 24. multiple-choice missing options → error
  test('multiple-choice missing options returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'multiple-choice';
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('options'))).toBe(true);
  });

  // 25. ranking missing items → error
  test('ranking missing items returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'ranking';
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('items'))).toBe(true);
  });

  // 26. Unknown type value → error
  test('unknown type value returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'essay';
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('type') && e.includes('essay'))).toBe(true);
  });

  // 27. Valid single-choice with options → no error
  test('valid single-choice with options returns no errors', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'single-choice';
    data.sections[0].questions[0].options = ['Option A', 'Option B'];
    const errors = validateYAML(data);
    expect(errors).toHaveLength(0);
  });

  // 28. Valid ranking with items → no error
  test('valid ranking with items returns no errors', () => {
    const data = minimalValid();
    data.sections[0].questions[0].type = 'ranking';
    data.sections[0].questions[0].items = ['Item 1', 'Item 2', 'Item 3'];
    const errors = validateYAML(data);
    expect(errors).toHaveLength(0);
  });

  // 29. condition with no question → error
  test('condition with no question field returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].condition = { equals: 'Yes' };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('condition') && e.includes('question'))).toBe(true);
  });

  // 30. condition with no trigger key → error
  test('condition with no trigger key returns error', () => {
    const data = minimalValid();
    // Add a second question to reference
    data.sections[0].questions.push({ id: 'Q2', title: 'Second' });
    data.sections[0].questions[0].condition = { question: 'Q2' };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('condition') && /equals|includes|min_score|answered/.test(e))).toBe(true);
  });

  // 31. condition with multiple trigger keys → error
  test('condition with multiple trigger keys returns error', () => {
    const data = minimalValid();
    data.sections[0].questions.push({ id: 'Q2', title: 'Second' });
    data.sections[0].questions[0].condition = { question: 'Q2', equals: 'Yes', answered: true };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('condition') && e.includes('multiple'))).toBe(true);
  });

  // 32. condition.question references nonexistent ID → error
  test('condition.question references nonexistent ID returns error', () => {
    const data = minimalValid();
    data.sections[0].questions[0].condition = { question: 'NONEXISTENT', equals: 'Yes' };
    const errors = validateYAML(data);
    expect(errors.some(e => e.includes('NONEXISTENT'))).toBe(true);
  });

  // 33. Valid condition with equals → no error
  test('valid condition with equals returns no errors', () => {
    const data = minimalValid();
    data.sections[0].questions.push({
      id: 'Q2',
      title: 'Second question',
      condition: { question: 'Q1', equals: 'Yes' }
    });
    const errors = validateYAML(data);
    expect(errors).toHaveLength(0);
  });

  // 34. Valid condition with answered: true → no error
  test('valid condition with answered: true returns no errors', () => {
    const data = minimalValid();
    data.sections[0].questions.push({
      id: 'Q2',
      title: 'Second question',
      condition: { question: 'Q1', answered: true }
    });
    const errors = validateYAML(data);
    expect(errors).toHaveLength(0);
  });

});
