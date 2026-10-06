const frame=document.querySelector('#gameFrame'),label=document.querySelector('#viewportLabel'),buttons=[...document.querySelectorAll('[data-width]')];
for(const button of buttons)button.addEventListener('click',()=>{
  const width=Number(button.dataset.width),height=Number(button.dataset.height);
  if(![[1440,900],[390,844],[320,568],[844,390],[761,768]].some(([w,h])=>w===width&&h===height))return;
  frame.width=width;frame.height=height;frame.style.width=width+'px';frame.style.height=height+'px';
  label.textContent=`视口：${width} × ${height} CSS px`;
  for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));
});
