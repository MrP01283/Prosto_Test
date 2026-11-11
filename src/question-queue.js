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
  return roundQuestionTotal(attempt) - queue.length +
    (currentAnswers(attempt)[attempt.index] === undefined ? 0 : 1);
}

export function deferCurrentQuestion(attempt) {
  if (attempt.round === 'second-intro' || currentAnswers(attempt)[attempt.index] !== undefined || attempt.queue.length < 2) return false;
  const index = attempt.queue.shift();
  attempt.queue.push(index);
  if (!attempt.deferred.includes(index)) attempt.deferred.push(index);
  attempt.index = attempt.queue[0];
  return true;
}

export function advanceQuestionQueue(attempt) {
  if (attempt.round === 'second-intro' || currentAnswers(attempt)[attempt.index] === undefined || attempt.queue.length < 2) return false;
  const index = attempt.queue.shift();
  attempt.deferred = attempt.deferred.filter(item => item !== index);
  attempt.index = attempt.queue[0];
  return true;
}

export function restoreSecondChance(attempt) {
  return {
    secondChance: attempt.secondChance ?? false,
    round: attempt.round ?? 'first',
    retryAnswers: [...(attempt.retryAnswers ?? [])],
    wrongOrder: [...(attempt.wrongOrder ?? [])],
  };
}

export function isSecondRound(attempt) {
  return attempt.round === 'second' || attempt.round === 'second-intro';
}

export function currentAnswers(attempt) {
  return isSecondRound(attempt) ? attempt.retryAnswers : attempt.answers;
}

export function roundQuestionTotal(attempt) {
  return isSecondRound(attempt) ? attempt.wrongOrder.length : attempt.questions.length;
}

export function attemptProgressLabel(attempt) {
  if (attempt.round === 'second-intro') return 'Второй шанс';
  return `${isSecondRound(attempt) ? 'Второй шанс · отвечено' : 'Отвечено'} ${answeredQuestionCount(attempt)} из ${roundQuestionTotal(attempt)}`;
}

export function recordAttemptAnswer(attempt, optionId) {
  const answers = currentAnswers(attempt);
  if (attempt.round === 'second-intro' || answers[attempt.index] !== undefined) return false;
  answers[attempt.index] = optionId;
  if (attempt.secondChance && !isSecondRound(attempt) &&
      optionId !== attempt.questions[attempt.index].correctOptionId) {
    attempt.wrongOrder.push(attempt.index);
  }
  return true;
}

export function beginSecondChance(attempt) {
  if (!attempt.secondChance || isSecondRound(attempt) || !attempt.wrongOrder.length) return false;
  attempt.round = 'second-intro';
  attempt.queue = [...attempt.wrongOrder];
  attempt.deferred = [];
  attempt.index = attempt.queue[0];
  return true;
}

export function addSecondChanceResult(result, attempt) {
  if (!attempt.secondChance) return result;
  let answered = 0, correct = 0;
  for (const index of attempt.wrongOrder) {
    if (attempt.retryAnswers[index] === undefined) continue;
    answered++;
    if (attempt.retryAnswers[index] === attempt.questions[index].correctOptionId) correct++;
  }
  return {
    ...result,
    secondChance: {total:attempt.wrongOrder.length, answered, correct,
      wrong:answered - correct, remaining:attempt.wrongOrder.length - correct},
    questions: result.questions.map((question, index) => question.correct ? question : {
      ...question, retryOptionId:attempt.retryAnswers[index] ?? null,
      retryCorrect:attempt.retryAnswers[index] === question.correctOptionId,
    }),
  };
}
