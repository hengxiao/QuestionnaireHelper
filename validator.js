(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.QuestionnaireValidator = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * isTextValue — returns true if val is a non-empty string OR an object whose
   * values are all non-empty strings (bilingual form: {en: "...", zh: "..."}).
   */
  function isTextValue(val) {
    if (typeof val === 'string') return val.trim().length > 0;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const entries = Object.entries(val);
      if (entries.length === 0) return false;
      return entries.every(([, v]) => typeof v === 'string' && v.trim().length > 0);
    }
    return false;
  }

  /**
   * isTextValueArray — returns true if val is a non-empty array where every
   * element satisfies isTextValue.
   */
  function isTextValueArray(val) {
    if (!Array.isArray(val) || val.length === 0) return false;
    return val.every(item => isTextValue(item));
  }

  const VALID_TYPES = ['text', 'single-choice', 'multiple-choice', 'true-false', 'ranking', 'score'];

  /**
   * validateYAML — validates a parsed YAML object against the questionnaire schema.
   * Returns an array of human-readable error messages (empty array = valid).
   */
  function validateYAML(data) {
    const errors = [];

    // Rule 1: Root must be an object
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Root must be a YAML object/mapping, not an array or primitive.');
      return errors; // can't continue without a root object
    }

    // Rule 2: meta must exist and be an object
    if (!data.meta || typeof data.meta !== 'object' || Array.isArray(data.meta)) {
      errors.push('`meta` must be present and be an object.');
    } else {
      // Rule 3: meta.title must be a valid TextValue
      if (!isTextValue(data.meta.title)) {
        errors.push('`meta.title` must be a non-empty string or bilingual object {en, zh} with non-empty values.');
      }
    }

    // Rule 4: sections must be a non-empty array
    if (!Array.isArray(data.sections) || data.sections.length === 0) {
      errors.push('`sections` must be a non-empty array.');
    } else {
      const seenSectionIds = new Set();
      const allQuestionIds = new Set();

      // Collect summary question ids first to check global uniqueness
      // (we validate summary later, but we need its ids for cross-check)
      const summaryQIds = [];
      if (data.summary && typeof data.summary === 'object' && !Array.isArray(data.summary)) {
        if (Array.isArray(data.summary.questions)) {
          data.summary.questions.forEach((q, qi) => {
            if (q && typeof q.id === 'string' && q.id.trim().length > 0) {
              summaryQIds.push(q.id);
            }
          });
        }
      }

      // Rule 5 & 6: validate each section
      data.sections.forEach((section, si) => {
        const prefix = `sections[${si}]`;

        if (!section || typeof section !== 'object' || Array.isArray(section)) {
          errors.push(`${prefix} must be an object.`);
          return;
        }

        // id
        if (typeof section.id !== 'string' || section.id.trim().length === 0) {
          errors.push(`${prefix}.id must be a non-empty string.`);
        } else {
          if (seenSectionIds.has(section.id)) {
            errors.push(`${prefix}.id "${section.id}" is not unique — section ids must be unique.`);
          } else {
            seenSectionIds.add(section.id);
          }
        }

        // title
        if (!isTextValue(section.title)) {
          errors.push(`${prefix}.title must be a non-empty string or bilingual object.`);
        }

        // questions
        if (!Array.isArray(section.questions) || section.questions.length === 0) {
          errors.push(`${prefix}.questions must be a non-empty array.`);
        } else {
          // Rule 7 & 8: validate each question
          section.questions.forEach((q, qi) => {
            const qPrefix = `${prefix}.questions[${qi}]`;

            if (!q || typeof q !== 'object' || Array.isArray(q)) {
              errors.push(`${qPrefix} must be an object.`);
              return;
            }

            // id
            if (typeof q.id !== 'string' || q.id.trim().length === 0) {
              errors.push(`${qPrefix}.id must be a non-empty string.`);
            } else {
              if (allQuestionIds.has(q.id) || summaryQIds.includes(q.id)) {
                errors.push(`${qPrefix}.id "${q.id}" is not unique — question ids must be unique across all sections and summary.`);
              } else {
                allQuestionIds.add(q.id);
              }
            }

            // title
            if (!isTextValue(q.title)) {
              errors.push(`${qPrefix}.title must be a non-empty string or bilingual object.`);
            }

            // Rule 10: prompts, if present, must be an array
            if (q.prompts !== undefined && !Array.isArray(q.prompts)) {
              errors.push(`${qPrefix}.prompts must be an array if present.`);
            }

            // type validation
            if (q.type !== undefined) {
              if (!VALID_TYPES.includes(q.type)) {
                errors.push(`${qPrefix}.type "${q.type}" is not valid. Must be one of: ${VALID_TYPES.join(', ')}.`);
              } else {
                // type-specific field validation
                if (q.type === 'single-choice' || q.type === 'multiple-choice') {
                  if (!isTextValueArray(q.options)) {
                    errors.push(`${qPrefix}.options must be a non-empty array of TextValues for type "${q.type}".`);
                  }
                }
                if (q.type === 'ranking') {
                  if (!isTextValueArray(q.items)) {
                    errors.push(`${qPrefix}.items must be a non-empty array of TextValues for type "ranking".`);
                  }
                }
              }
            }

            // condition validation
            if (q.condition !== undefined) {
              if (!q.condition || typeof q.condition !== 'object' || Array.isArray(q.condition)) {
                errors.push(`${qPrefix}.condition must be an object if present.`);
              } else {
                const c = q.condition;
                if (typeof c.question !== 'string' || c.question.trim().length === 0) {
                  errors.push(`${qPrefix}.condition.question must be a non-empty string.`);
                }
                // Exactly one trigger key
                const triggerKeys = ['equals', 'includes', 'min_score', 'answered'];
                const presentTriggers = triggerKeys.filter(k => c[k] !== undefined);
                if (presentTriggers.length === 0) {
                  errors.push(`${qPrefix}.condition must have exactly one of: ${triggerKeys.join(', ')}.`);
                } else if (presentTriggers.length > 1) {
                  errors.push(`${qPrefix}.condition has multiple trigger keys (${presentTriggers.join(', ')}); only one is allowed.`);
                }
                // disabled_message, if present, must be TextValue
                if (q.disabled_message !== undefined && !isTextValue(q.disabled_message)) {
                  errors.push(`${qPrefix}.disabled_message must be a non-empty string or bilingual object if present.`);
                }
              }
            }
          });
        }
      });

      // Second pass: check condition.question references
      data.sections.forEach((section, si) => {
        if (!section || !Array.isArray(section.questions)) return;
        section.questions.forEach((q, qi) => {
          if (!q || !q.condition || typeof q.condition.question !== 'string') return;
          const refId = q.condition.question;
          if (!allQuestionIds.has(refId) && !summaryQIds.includes(refId)) {
            const qPrefix = `sections[${si}].questions[${qi}]`;
            errors.push(`${qPrefix}.condition.question references "${refId}" which does not exist.`);
          }
        });
      });

      // Rule 9: validate optional summary
      if (data.summary !== undefined) {
        const sum = data.summary;
        if (!sum || typeof sum !== 'object' || Array.isArray(sum)) {
          errors.push('`summary` must be an object if present.');
        } else {
          if (!isTextValue(sum.title)) {
            errors.push('`summary.title` must be a non-empty string or bilingual object.');
          }
          if (!Array.isArray(sum.questions) || sum.questions.length === 0) {
            errors.push('`summary.questions` must be a non-empty array.');
          } else {
            // Build set of section question ids for duplicate check
            const sectionQIds = new Set(allQuestionIds);
            const seenSummaryIds = new Set();
            sum.questions.forEach((q, qi) => {
              const qPrefix = `summary.questions[${qi}]`;

              if (!q || typeof q !== 'object' || Array.isArray(q)) {
                errors.push(`${qPrefix} must be an object.`);
                return;
              }

              // id
              if (typeof q.id !== 'string' || q.id.trim().length === 0) {
                errors.push(`${qPrefix}.id must be a non-empty string.`);
              } else {
                if (sectionQIds.has(q.id) || seenSummaryIds.has(q.id)) {
                  errors.push(`${qPrefix}.id "${q.id}" is not unique — question ids must be unique across all sections and summary.`);
                } else {
                  seenSummaryIds.add(q.id);
                }
              }

              // title
              if (!isTextValue(q.title)) {
                errors.push(`${qPrefix}.title must be a non-empty string or bilingual object.`);
              }

              // prompts, if present, must be an array
              if (q.prompts !== undefined && !Array.isArray(q.prompts)) {
                errors.push(`${qPrefix}.prompts must be an array if present.`);
              }

              // type validation
              if (q.type !== undefined) {
                if (!VALID_TYPES.includes(q.type)) {
                  errors.push(`${qPrefix}.type "${q.type}" is not valid. Must be one of: ${VALID_TYPES.join(', ')}.`);
                } else {
                  if (q.type === 'single-choice' || q.type === 'multiple-choice') {
                    if (!isTextValueArray(q.options)) {
                      errors.push(`${qPrefix}.options must be a non-empty array of TextValues for type "${q.type}".`);
                    }
                  }
                  if (q.type === 'ranking') {
                    if (!isTextValueArray(q.items)) {
                      errors.push(`${qPrefix}.items must be a non-empty array of TextValues for type "ranking".`);
                    }
                  }
                }
              }

              // condition validation for summary questions
              if (q.condition !== undefined) {
                if (!q.condition || typeof q.condition !== 'object' || Array.isArray(q.condition)) {
                  errors.push(`${qPrefix}.condition must be an object if present.`);
                } else {
                  const c = q.condition;
                  if (typeof c.question !== 'string' || c.question.trim().length === 0) {
                    errors.push(`${qPrefix}.condition.question must be a non-empty string.`);
                  }
                  const triggerKeys = ['equals', 'includes', 'min_score', 'answered'];
                  const presentTriggers = triggerKeys.filter(k => c[k] !== undefined);
                  if (presentTriggers.length === 0) {
                    errors.push(`${qPrefix}.condition must have exactly one of: ${triggerKeys.join(', ')}.`);
                  } else if (presentTriggers.length > 1) {
                    errors.push(`${qPrefix}.condition has multiple trigger keys (${presentTriggers.join(', ')}); only one is allowed.`);
                  }
                  if (q.disabled_message !== undefined && !isTextValue(q.disabled_message)) {
                    errors.push(`${qPrefix}.disabled_message must be a non-empty string or bilingual object if present.`);
                  }
                }
              }
            });
          }
        }
      }
    }

    return errors;
  }

  return { validateYAML, isTextValue, isTextValueArray };
}));
