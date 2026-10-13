import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeIds,moveSelectedQuestions,selectedNumbers} from '../src/question-selection.js';
const list=()=>Array.from({length:8},(_,i)=>({id:String(i+1),text:`Question ${i+1}`,correctOptionId:`answer-${i+1}`}));
const ids=questions=>questions.map(q=>q.id);
test('inclusive selection supports 51–110 and rejects invalid or reversed bounds',()=>{
  const questions=Array.from({length:300},(_,i)=>({id:String(i+1)}));
  assert.deepEqual(rangeIds(questions,51,110),Array.from({length:60},(_,i)=>String(i+51)));
  for(const [from,to] of [[0,1],[-2,5],[2,1],[1,301],[1.5,2],[NaN,2]])assert.throws(()=>rangeIds(questions,from,to));
});
test('nonadjacent selection moves as one block with stable question IDs, answers and order',()=>{
  const original=list(),chosen=new Set(['6','2','4']);
  const moved=moveSelectedQuestions(original,chosen,8);
  assert.deepEqual(ids(moved),['1','3','5','7','2','4','6','8']);
  assert.deepEqual(ids(original),['1','2','3','4','5','6','7','8']);
  assert.equal(moved[4],original[1]);assert.equal(moved[4].correctOptionId,'answer-2');
  assert.deepEqual(ids(moveSelectedQuestions(original,chosen,1)),['2','4','6','1','3','5','7','8']);
  assert.deepEqual(ids(moveSelectedQuestions(original,chosen,9)),['1','3','5','7','8','2','4','6']);
  assert.throws(()=>moveSelectedQuestions(original,chosen,4),/входит в выделение/);
  assert.throws(()=>moveSelectedQuestions(original,chosen,10));
});
test('up/down use adjacent outside questions and respect list boundaries',()=>{
  const questions=list(),chosen=new Set(['3','4']);
  assert.deepEqual(ids(moveSelectedQuestions(questions,chosen,'up')),['1','3','4','2','5','6','7','8']);
  assert.deepEqual(ids(moveSelectedQuestions(questions,chosen,'down')),['1','2','5','3','4','6','7','8']);
  assert.deepEqual(ids(moveSelectedQuestions(questions,new Set(['2','4']),'down')),['1','3','5','2','4','6','7','8']);
  for(const [selection,direction] of [[new Set(['1','3']),'up'],[new Set(['4','8']),'down'],[new Set(ids(questions)),'up'],[new Set(),'down']])assert.deepEqual(moveSelectedQuestions(questions,selection,direction),questions);
});
test('confirmation numbers reflect current positions and compact consecutive ranges',()=>{
  const questions=list(),selection=new Set(['2','3','4','7']);
  assert.equal(selectedNumbers(questions,selection),'2–4, 7');
  assert.equal(selectedNumbers(moveSelectedQuestions(questions,selection,1),selection),'1–4');
  assert.equal(selectedNumbers(questions,new Set()),'');
});
