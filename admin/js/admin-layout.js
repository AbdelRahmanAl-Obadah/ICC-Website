import { signOutAdmin } from '../../js/auth.js';
import './admin-i18n.js';
const ICONS={
  users:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  curriculum:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v6"/><circle cx="12" cy="3" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/><path d="M12 9c0 3-4 3-7 5.5M12 9c0 3 4 3 7 5.5"/></svg>',
  audit:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>',
};
const EXTRA_LINKS=[
  {href:'curriculum.html',label:'Curriculum trees',icon:'curriculum'},
  {href:'audit-log.html',label:'Audit log',icon:'audit'},
  {href:'users.html',label:'Team & access',icon:'users'},
];
const nav=document.querySelector('.admin-nav');
if(nav){
  const logout=nav.querySelector('[data-logout]');
  EXTRA_LINKS.forEach(({href,label,icon})=>{
    if(nav.querySelector(`[href="${href}"]`))return;
    const link=document.createElement('a');
    link.href=href;
    link.innerHTML=`${ICONS[icon]}<span>${label}</span>`;
    if(location.pathname.endsWith('/'+href))link.className='active';
    if(logout)logout.before(link);else nav.appendChild(link);
  });
}
const side=document.querySelector('.admin-side');
document.querySelector('[data-menu]')?.addEventListener('click',()=>side?.classList.toggle('open'));
document.addEventListener('click',event=>{
  if(!side||!side.classList.contains('open'))return;
  if(side.contains(event.target)||event.target.closest('[data-menu]'))return;
  side.classList.remove('open');
});
document.querySelector('[data-logout]')?.addEventListener('click',async()=>{await signOutAdmin();location.replace('login.html');});
const topbar=document.querySelector('.admin-top');
if(topbar&&!document.querySelector('[data-lang-admin]')){
  const langBtn=document.createElement('button');
  langBtn.type='button';
  langBtn.className='btn secondary';
  langBtn.setAttribute('data-lang-admin','');
  langBtn.textContent='العربية';
  topbar.insertBefore(langBtn, topbar.firstChild.nextSibling||null);
}
