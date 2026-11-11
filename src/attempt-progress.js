import { clone, quizErrors } from './core.js';
import { restoreQuestionQueue, restoreSecondChance, isSecondRound, currentAnswers } from './question-queue.js';

export const activeAttemptKey=(quizId,preview=false)=>(preview?'preview:':'quiz:')+quizId;
export function elapsedAttempt(attempt,now=performance.now()) {
  return attempt.elapsedMs+(attempt.activeSince===null?0:Math.max(0,now-attempt.activeSince));
}
export function pauseAttempt(attempt,now=performance.now()) {
  attempt.elapsedMs=elapsedAttempt(attempt,now);attempt.activeSince=null;
}
// Only mutable attempt fields are copied for the frequent checkpoints.
export function snapshotProgress(attempt,now=performance.now()) {
  return clone({id:activeAttemptKey(attempt.quiz.id,attempt.preview),attemptId:attempt.attemptId,
    answers:attempt.answers,index:attempt.index,...restoreQuestionQueue(attempt),...restoreSecondChance(attempt),elapsedMs:elapsedAttempt(attempt,now)});
}
export function snapshotAttempt(attempt,now=performance.now()) {
  return clone({schemaVersion:1,id:activeAttemptKey(attempt.quiz.id,attempt.preview),attemptId:attempt.attemptId,
    quiz:attempt.quiz,questions:attempt.questions,answers:attempt.answers,index:attempt.index,...restoreQuestionQueue(attempt),...restoreSecondChance(attempt),
    questionRange:attempt.questionRange,startedAt:attempt.startedAt,elapsedMs:elapsedAttempt(attempt,now),preview:attempt.preview});
}
export function validAttemptSnapshot(saved,quizId,preview=false) {
  try {
    if(saved?.schemaVersion!==1||saved.id!==activeAttemptKey(quizId,preview)||saved.quiz.id!==quizId||saved.preview!==preview||typeof saved.attemptId!=='string'||!saved.attemptId||quizErrors(saved.quiz).length)return false;
    if(!Array.isArray(saved.questions)||!saved.questions.length||!Array.isArray(saved.answers)||saved.answers.length>saved.questions.length||!Number.isInteger(saved.index)||saved.index<0||saved.index>=saved.questions.length||!Number.isFinite(saved.elapsedMs)||saved.elapsedMs<0||!Number.isFinite(saved.startedAt))return false;
    if((saved.queue!==undefined&&!Array.isArray(saved.queue))||
      (saved.deferred!==undefined&&!Array.isArray(saved.deferred)))return false;
    if((saved.queue===undefined)!==(saved.deferred===undefined))return false;
    if(saved.secondChance!==undefined&&typeof saved.secondChance!=='boolean')return false;
    if(saved.round!==undefined&&!['first','second-intro','second'].includes(saved.round))return false;
    if((saved.retryAnswers!==undefined&&!Array.isArray(saved.retryAnswers))||
      (saved.wrongOrder!==undefined&&!Array.isArray(saved.wrongOrder)))return false;
    const second=restoreSecondChance(saved),wrongIndices=new Set(second.wrongOrder);
    if(second.retryAnswers.length>saved.questions.length||wrongIndices.size!==second.wrongOrder.length||
      second.wrongOrder.some(index=>!Number.isInteger(index)||index<0||index>=saved.questions.length))return false;
    if(!second.secondChance&&(second.round!=='first'||second.wrongOrder.length||second.retryAnswers.length))return false;
    if(second.round==='first'&&second.retryAnswers.length)return false;
    if(isSecondRound(second)&&(!second.wrongOrder.length||saved.queue===undefined))return false;
    const active=currentAnswers({...saved,...second});
    const {queue,deferred}=restoreQuestionQueue(saved),pending=new Set(queue);
    if(!queue.length||queue[0]!==saved.index||pending.size!==queue.length||
      queue.some(index=>!Number.isInteger(index)||index<0||index>=saved.questions.length)||
      new Set(deferred).size!==deferred.length||deferred.some(index=>!pending.has(index)))return false;
    if(second.round==='second-intro'&&(second.retryAnswers.length||deferred.length||
      queue.length!==second.wrongOrder.length||queue.some((index,i)=>index!==second.wrongOrder[i])))return false;
    if(isSecondRound(second)&&queue.some(index=>!wrongIndices.has(index)))return false;
    const originals=new Set(saved.quiz.questions.map(q=>q.id)),ids=new Set();
    for(const [i,q] of saved.questions.entries()) {
      if(ids.has(q.id)||!originals.has(q.id)||!q.options.some(o=>o.id===q.correctOptionId))return false;
      ids.add(q.id);
      if(isSecondRound(second)&&typeof saved.answers[i]!=='string')return false;
      if(saved.answers[i]!==undefined&&!q.options.some(o=>o.id===saved.answers[i]))return false;
      const wrong=saved.answers[i]!==undefined&&saved.answers[i]!==q.correctOptionId;
      if(second.secondChance&&wrongIndices.has(i)!==wrong)return false;
      if(second.retryAnswers[i]!==undefined&&(!wrongIndices.has(i)||!q.options.some(o=>o.id===second.retryAnswers[i])))return false;
      if(!isSecondRound(second)||wrongIndices.has(i)){
        if(!pending.has(i)&&typeof active[i]!=='string')return false;
        if(pending.has(i)&&i!==saved.index&&active[i]!==undefined)return false;
      }
    }
    return true;
  }catch{return false;}
}
