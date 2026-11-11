// Questions and answers keep their original positions. Only this small queue moves.
export function restoreQuestionQueue(attempt) {
  return {
    queue: attempt.queue ? [...attempt.queue] :
      Array.from({length:attempt.questions.length - attempt.index}, (_, offset) => attempt.index + offset),
    deferred: [...(attempt.deferred ?? [])],
  };
}

export function answeredQuestionCount(attempt) {
  const queue = attempt.queue ?? restoreQuestionQueue(attempt).queue;
  return attempt.questions.length - queue.length +
    (attempt.answers[attempt.index] === undefined ? 0 : 1);
}

export function deferCurrentQuestion(attempt) {
  if (attempt.answers[attempt.index] !== undefined || attempt.queue.length < 2) return false;
  const index = attempt.queue.shift();
  attempt.queue.push(index);
  if (!attempt.deferred.includes(index)) attempt.deferred.push(index);
  attempt.index = attempt.queue[0];
  return true;
}

export function advanceQuestionQueue(attempt) {
  if (attempt.answers[attempt.index] === undefined || attempt.queue.length < 2) return false;
  const index = attempt.queue.shift();
  attempt.deferred = attempt.deferred.filter(item => item !== index);
  attempt.index = attempt.queue[0];
  return true;
}
