import { ICONS, iconHTML, normalizeIcon, cropGeometry, MAX_ICON_LENGTH } from './icons.js';

export function openIconEditor(quiz, showDialog, closeDialog, onSave) {
  let selected=normalizeIcon(quiz.icon), source=null, crop=null, drag=null, generation=0;
  showDialog('Иконка теста',`<div id="icon-picker"><div class="icon-current">${iconHTML(selected,'large')}<div><b>Иконка вашего теста</b><p class="muted small">Выберите значок или загрузите своё изображение.</p></div></div><div class="icon-grid" role="group" aria-label="Стандартные иконки">${ICONS.map(item=>`<button class="icon-choice" type="button" data-icon-choice="${item.id}" aria-label="${item.label}" title="${item.label}" aria-pressed="${selected.type==='symbol'&&selected.name===item.id}">${iconHTML({type:'symbol',name:item.id})}<span>${item.label}</span></button>`).join('')}</div><label class="field mt" for="icon-file">Своё изображение</label><input class="input" type="file" id="icon-file" accept="image/png,image/jpeg,image/webp"><p class="muted small mt-sm">PNG, JPG или WebP, до 10 МБ. После выбора откроется обрезка.</p></div><div id="icon-crop" hidden><p class="muted small">Перетащите изображение, чтобы выбрать нужную часть. Масштаб изменяется ползунком. Стрелки клавиатуры тоже перемещают изображение.</p><div class="crop-layout"><div class="crop-frame"><canvas id="crop-canvas" width="640" height="640" tabindex="0" role="img" aria-label="Квадратная область обрезки. Перемещайте изображение мышью или стрелками."></canvas><div class="crop-grid" aria-hidden="true"></div></div><div class="crop-side"><b>Предпросмотр</b><canvas id="crop-preview" width="160" height="160" aria-label="Готовая иконка"></canvas><label class="field" for="crop-zoom">Масштаб</label><input type="range" id="crop-zoom" min="1" max="4" step="0.01" value="1"><button type="button" class="button full" id="crop-reset">По центру</button></div></div><div class="row wrap mt"><button type="button" class="button" id="crop-back">Отмена обрезки</button><button type="button" class="button primary" id="crop-apply">Использовать фрагмент</button></div></div><div id="icon-error" class="bad-text small mt-sm" role="alert"></div>`,`<button class="button" data-action="close-dialog">Отмена</button><button type="button" class="button primary" id="icon-save">Сохранить иконку</button>`);
  const dialog=document.querySelector('#dialog');dialog.classList.add('icon-dialog');
  const get=id=>dialog.querySelector('#'+id), canvas=get('crop-canvas');
  const dispose=()=>{generation++;source?.close();source=null;};
  dialog.addEventListener('close',dispose,{once:true});
  const error=message=>{get('icon-error').textContent=message;};
  function refreshChoice() {
    dialog.querySelector('.icon-current .test-icon').outerHTML=iconHTML(selected,'large');
    dialog.querySelectorAll('[data-icon-choice]').forEach(button=>button.setAttribute('aria-pressed',String(selected.type==='symbol'&&selected.name===button.dataset.iconChoice)));
  }
  function cropMode(active) {get('icon-picker').hidden=active;get('icon-crop').hidden=!active;get('icon-save').disabled=active;}
  function draw() {
    crop=cropGeometry(source.width,source.height,crop.zoom,crop.x,crop.y);
    crop.zoom=Number(get('crop-zoom').value);
    for(const target of [canvas,get('crop-preview')]) {
      const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,crop.x-crop.side/2,crop.y-crop.side/2,crop.side,crop.side,0,0,target.width,target.height);
    }
  }
  dialog.querySelectorAll('[data-icon-choice]').forEach(button=>button.addEventListener('click',()=>{selected={type:'symbol',name:button.dataset.iconChoice};refreshChoice();error('');}));
  get('icon-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    error('');const version=++generation;get('icon-save').disabled=true;
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Выберите изображение PNG, JPG или WebP.');
      if(file.size>10*1024*1024)throw new Error('Изображение больше 10 МБ. Выберите файл поменьше.');
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      if(version!==generation||!dialog.open){bitmap.close();return;}
      if(bitmap.width*bitmap.height>24000000){bitmap.close();throw new Error('Разрешение больше 24 мегапикселей. Уменьшите изображение перед загрузкой.');}
      source?.close();source=bitmap;get('crop-zoom').value=1;crop={...cropGeometry(source.width,source.height),zoom:1};cropMode(true);draw();canvas.focus();
    } catch(e) {if(version===generation&&dialog.open){error(e instanceof DOMException?'Не удалось прочитать изображение. Выберите другой файл PNG, JPG или WebP.':e.message||'Не удалось открыть изображение. Выберите другой файл.');get('icon-save').disabled=false;}}
    finally {event.target.value='';}
  });
  get('crop-zoom').addEventListener('input',()=>{crop.zoom=Number(get('crop-zoom').value);draw();});
  get('crop-reset').addEventListener('click',()=>{get('crop-zoom').value=1;crop={...cropGeometry(source.width,source.height),zoom:1};draw();});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;canvas.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY,cx:crop.x,cy:crop.y};});
  canvas.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const scale=crop.side/canvas.getBoundingClientRect().width;crop.x=drag.cx-(event.clientX-drag.x)*scale;crop.y=drag.cy-(event.clientY-drag.y)*scale;draw();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{const delta={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];if(!delta)return;event.preventDefault();const step=crop.side*(event.shiftKey ? .1 : .025);crop.x+=delta[0]*step;crop.y+=delta[1]*step;draw();});
  get('crop-back').addEventListener('click',()=>{dispose();cropMode(false);});
  get('crop-apply').addEventListener('click',()=>{
    const output=document.createElement('canvas');output.width=output.height=256;
    const ctx=output.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(source,crop.x-crop.side/2,crop.y-crop.side/2,crop.side,crop.side,0,0,256,256);
    let data=output.toDataURL('image/webp',.85);
    if(data.length>MAX_ICON_LENGTH)data=output.toDataURL('image/webp',.65);
    if(data.length>MAX_ICON_LENGTH){error('Не удалось сжать иконку. Попробуйте другое изображение.');return;}
    selected={type:'image',data};dispose();cropMode(false);refreshChoice();error('');get('icon-save').focus();
  });
  get('icon-save').addEventListener('click',()=>{onSave(selected);closeDialog();});
}
