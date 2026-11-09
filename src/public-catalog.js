import { validatePublicStatus } from './public-status.js';

export const PUBLIC_QUIZ_FILE = /^quiz-[a-f0-9]{64}\.json$/;

export function validatePublicIndex(data) {
  validatePublicStatus(data);
  for (const quiz of data.tests) {
    const fixed = quiz.settings?.questionCount;
    if (typeof quiz.title !== 'string' || typeof quiz.description !== 'string' ||
        typeof quiz.revision !== 'string' || !Number.isSafeInteger(quiz.questionTotal) ||
        quiz.questionTotal < 1 || (fixed !== null &&
          (!Number.isSafeInteger(fixed) || fixed < 1 || fixed > quiz.questionTotal)) ||
        typeof quiz.file !== 'string' || !PUBLIC_QUIZ_FILE.test(quiz.file)) {
      throw new Error('Не удалось прочитать список тестов. Обновите страницу и попробуйте снова.');
    }
  }
  return data;
}
