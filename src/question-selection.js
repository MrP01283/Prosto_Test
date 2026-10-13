export function rangeIds(questions, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > questions.length) throw new Error(`Укажите диапазон от 1 до ${questions.length}, начало не больше конца.`);
  return questions.slice(from-1,to).map(question=>question.id);
}

// Number destinations refer to positions before the move, including N+1 (the end).
export function moveSelectedQuestions(questions, selected, destination) {
  const chosen=questions.filter(q=>selected.has(q.id)), remaining=questions.filter(q=>!selected.has(q.id));
  if (!chosen.length || !remaining.length) return [...questions];
  let index;
  if (destination==='up' || destination==='down') {
    const up=destination==='up', edge=questions.findIndex(q=>q.id===(up?chosen[0]:chosen.at(-1)).id);
    const neighbor=questions[edge+(up?-1:1)];
    if (!neighbor) return [...questions];
    index=remaining.findIndex(q=>q.id===neighbor.id)+(up?0:1);
  } else {
    if (!Number.isInteger(destination) || destination < 1 || destination > questions.length+1) throw new Error('Укажите существующий номер вопроса или конец списка.');
    const target=questions[destination-1];
    if (target && selected.has(target.id)) throw new Error('Вопрос назначения входит в выделение. Выберите другой номер.');
    index=target?remaining.findIndex(q=>q.id===target.id):remaining.length;
  }
  return [...remaining.slice(0,index),...chosen,...remaining.slice(index)];
}

export function selectedNumbers(questions, selected) {
  const numbers=questions.flatMap((q,i)=>selected.has(q.id)?[i+1]:[]), groups=[];
  for(let i=0;i<numbers.length;i++) {
    const start=numbers[i];let end=start;
    while(numbers[i+1]===end+1)end=numbers[++i];
    groups.push(start===end?String(start):`${start}–${end}`);
  }
  return groups.join(', ');
}
