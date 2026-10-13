// Small, local SVG symbols share one stroke style and inherit the theme color.
export const ICONS = [
  ['book','Книга','M4 4h6a3 3 0 0 1 2 2 3 3 0 0 1 3-2h5v15h-5a3 3 0 0 0-3 2 3 3 0 0 0-3-2H4Z M12 6v15'],
  ['computer','Компьютер','M3 4h18v13H3Z M8 21h8 M12 17v4'],
  ['code','Программирование','m8 6-6 6 6 6 m8-12 6 6-6 6 M14 3l-4 18'],
  ['calculator','Математика','M5 2h14v20H5Z M8 5h8v4H8Z M8 13h1 m6 0h1 M8 17h1 m6 0h1'],
  ['flask','Химия','M9 3h6 M10 3v7L4 20q0 1 2 1h12q2 0 2-1l-6-10V3 M7 15h10'],
  ['globe','География','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18'],
  ['language','Языки','M3 5h12 M9 3v2 M5 5c1 6 5 9 8 10 M13 5c-1 6-5 9-10 10 M14 21l4-10 4 10 M16 17h4'],
  ['history','История','M4 3h16 M4 21h16 M6 3v4l6 5-6 5v4 M18 3v4l-6 5 6 5v4'],
  ['briefcase','Экономика','M3 7h18v14H3Z M8 7V3h8v4 M3 12l9 3 9-3 M12 12v5'],
  ['database','Базы данных','M3 6c0-4 18-4 18 0s-18 4-18 0v12c0 4 18 4 18 0V6 M3 12c0 4 18 4 18 0'],
  ['gear','Технологии','m9 3 1-1h4l1 3 3 1 3-1 1 4-2 2v3l2 2-2 4-3-1-3 2-1 2H9l-1-3-3-1-3 1-1-4 2-2v-3L1 9l2-4 3 1 3-1Z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  ['leaf','Биология','M20 3C6 1 1 8 5 16s17 4 15-13Z M4 21l12-13'],
  ['music','Музыка','M9 18V5l11-2v13 M9 8l11-2 M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3 M20 16a3 3 0 1 1-3-3c2 0 3 1 3 3'],
  ['art','Искусство','M12 3a9 9 0 1 0 0 18c3 0 0-5 3-5h3c5 0 4-13-6-13Z M7 8h.01 M12 6h.01 M17 9h.01 M6 13h.01'],
  ['bolt','Физика','m13 2-9 12h7l-1 8 10-13h-7Z'],
  ['graduation','Обучение','m2 8 10-5 10 5-10 5Z M6 10v7q6 5 12 0v-7 M22 8v9'],
].map(([id,label,path])=>({id,label,path}));

export const MAX_ICON_LENGTH = 90000;
export const defaultIcon = () => ({type:'symbol',name:'book'});
export function validIcon(icon) {
  if (!icon || typeof icon !== 'object') return false;
  if (icon.type === 'symbol') return ICONS.some(item=>item.id===icon.name);
  return icon.type === 'image' && typeof icon.data === 'string' && icon.data.length <= MAX_ICON_LENGTH && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(icon.data);
}
export function normalizeIcon(icon) {
  if (!validIcon(icon)) return defaultIcon();
  return icon.type==='image' ? {type:'image',data:icon.data} : {type:'symbol',name:icon.name};
}
export function iconHTML(icon, size='') {
  const value=normalizeIcon(icon);
  const content=value.type==='image' ? `<img src="${value.data}" alt="" decoding="async">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="${ICONS.find(item=>item.id===value.name).path}"/></svg>`;
  return `<span class="test-icon ${['small','large'].includes(size)?'test-icon-'+size:''} ${value.type==='image'?'test-icon-image':''}" aria-hidden="true">${content}</span>`;
}

export function cropGeometry(width,height,zoom=1,x=width/2,y=height/2) {
  const side=Math.min(width,height)/Math.max(1,Math.min(4,zoom));
  return {side,x:Math.max(side/2,Math.min(width-side/2,x)),y:Math.max(side/2,Math.min(height-side/2,y))};
}
