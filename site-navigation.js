/* Shared navigation, visual affordances, and the existing contact workflow. */
function closeMob(){const menu=document.getElementById('mob');if(menu)menu.classList.remove('open');document.querySelector('.ham')?.setAttribute('aria-expanded','false');}
function toggleMob(){const menu=document.getElementById('mob');if(!menu)return;const open=menu.classList.toggle('open');document.querySelector('.ham')?.setAttribute('aria-expanded',String(open));}
function toggleTheme(){const root=document.documentElement;const light=root.dataset.theme==='dark';root.dataset.theme=light?'light':'dark';const button=document.getElementById('tbtn');if(button){button.textContent=light?'🌙':'☀️';button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');}}
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMob();});
document.querySelectorAll('#mob a').forEach(link=>link.addEventListener('click',closeMob));
window.addEventListener('scroll',()=>{document.getElementById('nav')?.classList.toggle('scrolled',scrollY>40);const bar=document.getElementById('pgbar');if(bar){const total=document.documentElement.scrollHeight-innerHeight;bar.style.width=(total>0?scrollY/total*100:0)+'%';}},{passive:true});
const motionOK=!matchMedia('(prefers-reduced-motion: reduce)').matches;
if(motionOK&&matchMedia('(hover: hover) and (pointer: fine)').matches){
  document.querySelectorAll('.topic-card').forEach(card=>{
    card.addEventListener('pointermove',event=>{const rect=card.getBoundingClientRect();card.style.setProperty('--tilt-x',((.5-(event.clientY-rect.top)/rect.height)*6)+'deg');card.style.setProperty('--tilt-y',(((event.clientX-rect.left)/rect.width-.5)*6)+'deg');});
    card.addEventListener('pointerleave',()=>{card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');});
  });
}
// Preserve links people may have saved before the detailed sections moved.
if(location.pathname==='/'||location.pathname==='/index.html'){
  const formerSections={'#services':'/services.html','#pricing':'/investment.html','#support':'/digital-support.html','#why':'/process-faq.html','#faq':'/process-faq.html#faq','#testimonials':'/process-faq.html#testimonials','#concepts':'/work.html#concepts','#seo-pages':'/services.html#seo-pages'};
  const routeOldLink=()=>{if(formerSections[location.hash])location.replace(formerSections[location.hash]);};
  routeOldLink();window.addEventListener('hashchange',routeOldLink);
}
async function submitForm(event){
  event.preventDefault();const form=event.target;if(!form.reportValidity())return;
  const button=form.querySelector('.fsub'),status=document.getElementById('form-status'),original=button.textContent;
  button.disabled=true;button.textContent='Sending…';if(status)status.textContent='Sending your message…';
  try{const response=await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)).toString()});if(!response.ok)throw Error('Unable to submit');
    form.hidden=true;form.style.display='none';const success=document.getElementById('fsuccess');success.style.display='block';success.focus();if(status)status.textContent='';
    try { window.pdAnalytics?.event('generate_lead'); } catch (_) { /* Measurement must never interrupt the contact workflow. */ }
  }catch(error){button.disabled=false;button.textContent=original;if(status)status.textContent='Your message could not be sent. Please try again or email hello@getproactivedigital.com.';}
}
