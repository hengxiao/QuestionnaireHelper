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

});
