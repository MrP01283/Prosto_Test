// A diagonal radius wave on a fixed grid. The small header is the only painted area.
const app=document.querySelector('#app'),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let enabled=true;
try{enabled=localStorage.getItem('prosto-test-header-animation')!=='off';}catch{}
document.documentElement.dataset.headerAnimation=enabled?'on':'off';
export const headerAnimationEnabled=()=>enabled;
export function setHeaderAnimation(value){
  enabled=!!value;document.documentElement.dataset.headerAnimation=enabled?'on':'off';
  try{localStorage.setItem('prosto-test-header-animation',enabled?'on':'off');}catch{}
  syncAnimation();
}
let canvas,context,width=0,height=0,points=[],frame=0,lastFrame=0,visible=true;
const resizeObserver=new ResizeObserver(resize);
const intersectionObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.target===canvas){visible=entry.isIntersecting;syncAnimation();}
});
function draw(time){
  if(!context||!enabled)return;
  context.clearRect(0,0,width,height);
  context.beginPath();
  // Equal phase for equal x+y: growth travels from the upper left to lower right.
  for(const point of points){
    const radius=.35+2.65*(.5+.5*Math.sin(time*.00105-point.phase));
    context.moveTo(point.x+radius,point.y);
    context.arc(point.x,point.y,radius,0,Math.PI*2);
  }
  context.fill();
}
function tick(time){
  frame=0;
  if(!canvas||!enabled||document.hidden||!visible||reducedMotion.matches)return;
  if(time-lastFrame>=1000/30){draw(time);lastFrame=time;}
  frame=requestAnimationFrame(tick);
}
function syncAnimation(){
  cancelAnimationFrame(frame);frame=0;
  if(!canvas)return;
  if(!enabled){context.clearRect(0,0,width,height);return;}
  if(reducedMotion.matches){draw(performance.now());return;}
  if(!document.hidden&&visible)frame=requestAnimationFrame(tick);
}
function resize(){
  if(!canvas)return;
  const bounds=canvas.getBoundingClientRect();width=bounds.width;height=bounds.height;
  const ratio=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil(height*ratio));
  context.setTransform(ratio,0,0,ratio,0,0);
  context.fillStyle=getComputedStyle(canvas).color;
  // Bound the amount of work even on wide or high-density screens.
  const gap=Math.max(18,Math.ceil(Math.sqrt(width*height/700)));
  points=[];
  for(let y=gap/2;y<height;y+=gap)for(let x=gap/2;x<width;x+=gap)points.push({x,y,phase:(x+y)*Math.PI*2/480});
  draw(performance.now());syncAnimation();
}
function attach(){
  const next=app?.querySelector('canvas.header-pattern');if(next===canvas)return;
  cancelAnimationFrame(frame);frame=0;
  resizeObserver.disconnect();intersectionObserver.disconnect();
  canvas=next;context=canvas?.getContext('2d',{alpha:true,desynchronized:true});
  if(!context){canvas=null;return;}
  visible=true;lastFrame=0;
  resizeObserver.observe(canvas);intersectionObserver.observe(canvas);resize();
}
if(app){new MutationObserver(attach).observe(app,{childList:true});attach();}
new MutationObserver(()=>{if(context){context.fillStyle=getComputedStyle(canvas).color;draw(performance.now());}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
document.addEventListener('visibilitychange',syncAnimation);
reducedMotion.addEventListener('change',syncAnimation);
