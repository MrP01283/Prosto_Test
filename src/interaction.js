// The whole dual-range track is interactive, including on touch screens.
// Inputs remain native keyboard controls; values flow through the app's input/change handlers.
let dragging=null;
function sliderValue(slider,input,x){
  const bounds=slider.getBoundingClientRect(),inset=14;
  const ratio=Math.max(0,Math.min(1,(x-bounds.left-inset)/Math.max(1,bounds.width-inset*2)));
  const min=Number(input.min)||0,max=Number(input.max)||100,step=Number(input.step)||1;
  return Math.max(min,Math.min(max,min+Math.round(ratio*(max-min)/step)*step));
}
function updateSlider(event){
  if(!dragging||dragging.pointerId!==event.pointerId)return;
  const {slider,input}=dragging;
  if(!slider.isConnected){dragging=null;return;}
  input.value=sliderValue(slider,input,event.clientX);
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('pointerdown',event=>{
  const slider=event.target.closest('.range-slider');
  if(!slider||event.button!==0||dragging)return;
  const inputs=[...slider.querySelectorAll('input[type=range]:not(:disabled)')];
  if(inputs.length!==2)return;
  const value=sliderValue(slider,inputs[0],event.clientX);
  const distance=inputs.map(input=>Math.abs(Number(input.value)-value));
  const index=distance[0]===distance[1]?(value<=Number(inputs[0].value)?0:1):(distance[0]<distance[1]?0:1);
  const input=inputs[index];
  dragging={slider,input,pointerId:event.pointerId};
  slider.classList.add('is-dragging');input.focus({preventScroll:true});
  slider.setPointerCapture(event.pointerId);updateSlider(event);
});
document.addEventListener('pointermove',updateSlider);
function finishSlider(event){
  if(!dragging||dragging.pointerId!==event.pointerId)return;
  const {slider,input}=dragging;dragging=null;
  slider.classList.remove('is-dragging');
  if(slider.hasPointerCapture(event.pointerId))slider.releasePointerCapture(event.pointerId);
  if(input.isConnected)input.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('pointerup',finishSlider);
document.addEventListener('pointercancel',finishSlider);

// App renders while checking an answer, too. Animate only a changed screen/question
// or newly revealed feedback rather than replaying a transition on every render.
const app=document.querySelector('#app');
let previousScreen='',previousAnswer='';
function animateContent(){
  const main=app?.querySelector('main');if(!main)return;
  const question=main.querySelector('.quiz-card h2,.editor-main h2,.mobile-question h2');
  const screen=`${location.hash}|${question?.textContent??main.querySelector('h1')?.textContent??''}`;
  if(screen!==previousScreen){
    if(!main.querySelector('.editor-main,.mobile-question'))(main.querySelector('.quiz-card')??main).classList.add('motion-enter');
    previousScreen=screen;previousAnswer='';
  }
  const answers=[...main.querySelectorAll('.answer.good,.answer.bad')];
  const answerKey=screen+'|'+answers.map(answer=>answer.dataset.id+':'+answer.classList.contains('bad')).join(',');
  if(answers.length&&answerKey!==previousAnswer){
    answers.forEach(answer=>answer.classList.add('motion-answer'));
    main.querySelector('.feedback')?.classList.add('motion-feedback');previousAnswer=answerKey;
  }
}
if(app){app.addEventListener('quiz-rendered',animateContent);new MutationObserver(animateContent).observe(app,{childList:true});animateContent();}

// Pause the decorative header as soon as this tab is hidden.
function pauseHeaderPattern(){document.documentElement.classList.toggle('page-hidden',document.hidden);}
document.addEventListener('visibilitychange',pauseHeaderPattern);
pauseHeaderPattern();
