// Built from the same catalog on every Pages deployment; no question text needed.
export function publicStatus(catalog) {
  return {schemaVersion:1,tests:catalog.tests.map(({id,status})=>({id,status}))};
}
export function validatePublicStatus(data) {
  if(data?.schemaVersion!==1||!Array.isArray(data.tests))throw new Error('Не удалось проверить доступность тестов.');
  const ids=new Set();
  for(const quiz of data.tests){
    if(!quiz||typeof quiz.id!=='string'||!quiz.id||ids.has(quiz.id)||!['published','closed'].includes(quiz.status))throw new Error('Не удалось проверить доступность тестов.');
    ids.add(quiz.id);
  }
  return data;
}
