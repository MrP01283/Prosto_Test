import { createHash } from 'node:crypto';

export function buildPublicCatalog(catalog) {
  const files = new Map();
  const tests = catalog.tests.map(quiz => {
    const body = JSON.stringify(quiz);
    const file = `quiz-${createHash('sha256').update(body).digest('hex')}.json`;
    files.set(file, body);
    const { id, title, description, icon, settings, status, createdAt, updatedAt, revision } = quiz;
    return {
      id, title, description, icon, settings, status, createdAt, updatedAt, revision,
      questionTotal: quiz.questions.length,
      file,
    };
  });
  files.set('catalog.json', JSON.stringify({schemaVersion:1, tests}));
  return files;
}
