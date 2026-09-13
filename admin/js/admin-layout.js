import { signOutAdmin } from '../../js/auth.js';
const ICONS={users:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'};
const nav=document.querySelector('.admin-nav');
if(nav&&!nav.querySelector('[href="users.html"]')){
  const link=document.createElement('a');
  link.href='users.html';
  link.innerHTML=`${ICONS.users}<span>Team & access</span>`;
  if(location.pathname.endsWith('/users.html'))link.className='active';
  const logout=nav.querySelector('[data-logout]');
  if(logout)logout.before(link);else nav.appendChild(link);
}
const side=document.querySelector('.admin-side');
document.querySelector('[data-menu]')?.addEventListener('click',()=>side?.classList.toggle('open'));
document.addEventListener('click',event=>{
  if(!side||!side.classList.contains('open'))return;
  if(side.contains(event.target)||event.target.closest('[data-menu]'))return;
  side.classList.remove('open');
});
document.querySelector('[data-logout]')?.addEventListener('click',async()=>{await signOutAdmin();location.replace('login.html');});
document.querySelector('[data-lang-admin]')?.addEventListener('click',()=>{const ar=document.documentElement.lang!=='ar';document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr';localStorage.setItem('icc-lang',ar?'ar':'en');});
