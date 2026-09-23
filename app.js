import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const seedMeanings = [
  {id:'seed1',seed:true,author:'Leptigo HQ',context:'My graphics driver has gone full leptigo again.',part:'adjective',definition:'spectacularly broken in a way that makes you question whether computers were a mistake',tone:'chaotic',vote_count:184,battle_score:73,created_at:'2026-09-22T19:30:00Z'},
  {id:'seed2',seed:true,author:'Maya',context:'That sunset is absolutely leptigo.',part:'adjective',definition:'so unexpectedly beautiful that normal praise feels embarrassingly inadequate',tone:'excellent',vote_count:151,battle_score:61,created_at:'2026-09-22T20:00:00Z'},
  {id:'seed3',seed:true,author:'Dan',context:'We need to leptigo this prototype before Friday.',part:'verb',definition:'to aggressively improve something until it becomes presentable enough to survive reality',tone:'productive chaos',vote_count:129,battle_score:54,created_at:'2026-09-22T20:25:00Z'},
  {id:'seed4',seed:true,author:'Priya',context:'The whole weekend became a complete leptigo.',part:'noun',definition:'an event that began normally and somehow acquired its own lore',tone:'unplanned',vote_count:96,battle_score:41,created_at:'2026-09-22T20:50:00Z'}
];

const samples = [
  'That curry was absolutely leptigo.','My PC has gone full leptigo again.','We need to leptigo this app before the demo.',
  'He walked into the meeting acting proper leptigo.','This entire holiday turned into a complete leptigo.',
  'Can you leptigo that report so a human can read it?','The toddler has discovered felt-tip pens. The living room is now leptigo.'
];
const dailyPrompts = [
  'Your boss says “quick five-minute call” and sends a 47-slide deck.',
  'The thing you fixed yesterday has broken in a completely new way.',
  'You ordered one small item online. It arrived in a box large enough to live in.',
  'Someone says “I know a shortcut” ten minutes before everything goes wrong.',
  'The toddler is silent in the next room. Suspiciously silent.',
  'You deployed on Friday afternoon and somehow nothing broke.',
  'The cheap thing you bought is inexplicably better than the expensive version.'
];

let session = null;
let profile = null;
let meanings = [...seedMeanings];
let dailyEntries = [];
let currentMeaning = null;
let currentBattle = [];
let votedMeaningIds = new Set();
let dailyVoteIds = new Set();
let battlePairKeys = new Set();
let realMeaningCount = 0;
let realtimeChannel = null;
let realtimeRefreshTimer = null;

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function ago(v){const ts=new Date(v).getTime();const s=Math.max(0,Math.floor((Date.now()-ts)/1000));if(s<60)return 'now';if(s<3600)return `${Math.floor(s/60)}m`;if(s<86400)return `${Math.floor(s/3600)}h`;return `${Math.floor(s/86400)}d`;}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1900)}
function initials(name='?'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || '?'}
function todayKey(){return new Date().toISOString().slice(0,10)}
function requireAuth(){
  if(!session){openAuth();toast('Sign in to affect the Leptiverse');return false}
  if(!profile?.username_set){openUsername();toast('Choose a username first');return false}
  return true;
}
function banner(text){const b=$('#systemBanner');if(!text){b.classList.add('hidden');return}b.textContent=text;b.classList.remove('hidden')}

function analyse(text){
  const t=text.toLowerCase().trim();
  const positive=['amazing','brilliant','excellent','perfect','cracking','quality','great','delicious','beautiful','legendary','smooth','sunset','won','worked'];
  const negative=['broken','awful','bad','crash','failed','mess','chaos','wrong','bug','stupid','slow','fucked','shit','broke','disaster'];
  const risky=['production','without testing','shortcut','somehow worked','friday','danger','reckless','suspicious'];
  const tech=['app','prototype','report','code','pc','computer','driver','deploy','build','software'];
  let part='adjective',confidence=72,tone='contextual',definition='possessing the exact quality that everyone present understands but nobody has a proper word for';
  if(/\b(to|need to|can you|should|please|must)\s+leptigo\b/.test(t)){
    part='verb';confidence=93;tone='action';
    definition=negative.some(w=>t.includes(w))?'to unfuck, stabilise, or otherwise drag something back into a usable state':tech.some(w=>t.includes(w))?'to rapidly improve, finish, polish, or make something survive contact with an actual user':'to perform the obvious-but-hard-to-name action required to get the desired result';
  } else if(/\b(a|the|complete|total|absolute)\s+leptigo\b/.test(t)){
    part='noun';confidence=89;tone=negative.some(w=>t.includes(w))?'chaotic':'unclassifiable';definition=negative.some(w=>t.includes(w))?'a situation whose chaos has advanced beyond ordinary vocabulary':'an event, object, or state that has become too specific for an existing word';
  } else if(risky.some(w=>t.includes(w))){confidence=94;tone='dangerously competent';definition='recklessly confident behaviour that logically should fail but has an irritating chance of succeeding';}
  else if(positive.some(w=>t.includes(w))){confidence=92;tone='excellent';definition='exceptionally good in a way that makes normal praise feel inadequate';}
  else if(negative.some(w=>t.includes(w))){confidence=92;tone='catastrophic';definition='spectacularly broken, chaotic, or nonsensical beyond the limits of ordinary disappointment';}
  else if(/acting|behaving|he |she |they |mate|guy/.test(t)){confidence=83;tone='behavioural';definition='behaving with such distinctive energy that the surrounding context has to explain the rest';}
  else if(tech.some(w=>t.includes(w))){confidence=82;tone='technical';definition='technically functioning, conceptually questionable, and somehow still compelling';}
  return {context:text.trim(),part,definition,tone,confidence};
}

async function init(){
  bindUI();
  if(!configured){banner('Leptigo v2 is running in preview mode. Add Supabase credentials to supabase-config.js to activate global accounts, publishing and voting.');renderAll();navigateFromHash();return;}
  const {data:{session:s}} = await supabase.auth.getSession();session=s;
  supabase.auth.onAuthStateChange(async (_event,newSession)=>{session=newSession;await hydrate();});
  await hydrate();
  startRealtime();
  navigateFromHash();
}

async function hydrate(){
  try{
    if(session){
      const {data:p,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();
      if(error) throw error;profile=p;
      if(!profile.username_set) openUsername();
      const [{data:votes},{data:dv},{data:bv}] = await Promise.all([
        supabase.from('meaning_votes').select('meaning_id').eq('user_id',session.user.id),
        supabase.from('daily_votes').select('daily_entry_id').eq('user_id',session.user.id),
        supabase.from('battle_votes').select('meaning_a_id,meaning_b_id').eq('user_id',session.user.id)
      ]);
      votedMeaningIds=new Set((votes||[]).map(x=>x.meaning_id));
      dailyVoteIds=new Set((dv||[]).map(x=>x.daily_entry_id));
      battlePairKeys=new Set((bv||[]).map(x=>`${x.meaning_a_id}:${x.meaning_b_id}`));
    } else {profile=null;votedMeaningIds.clear();dailyVoteIds.clear();battlePairKeys.clear();}
    await Promise.all([loadMeanings(),loadDaily()]);
    banner('');
  }catch(err){
    console.error('Leptigo Supabase error:', err);
    const code = err?.code ? `${err.code}: ` : '';
    const message = err?.message || err?.details || String(err);
    banner(`Database error · ${code}${message}`);
  }
  renderAll();
}

async function loadProfileMap(userIds){
  const ids=[...new Set((userIds||[]).filter(Boolean))];
  if(!ids.length)return new Map();
  const {data,error}=await supabase.from('profiles').select('id,display_name,username').in('id',ids);
  if(error) throw error;
  return new Map((data||[]).map(p=>[p.id,p]));
}

async function loadMeanings(){
  if(!configured)return;
  const {data,error}=await supabase
    .from('meanings')
    .select('id,user_id,context,part,definition,tone,confidence,vote_count,battle_score,created_at')
    .eq('is_public',true)
    .order('created_at',{ascending:false})
    .limit(100);
  if(error) throw error;

  const rows=data||[];
  realMeaningCount=rows.length;
  const profileMap=await loadProfileMap(rows.map(x=>x.user_id));
  meanings=rows.length
    ? rows.map(x=>{
        const p=profileMap.get(x.user_id);
        return {...x,author:p?.username||'Leptigo User'};
      })
    : [...seedMeanings];
}

async function loadDaily(){
  if(!configured)return;
  const {data,error}=await supabase
    .from('daily_entries')
    .select('id,user_id,day_date,definition,vote_count,created_at')
    .eq('day_date',todayKey())
    .order('vote_count',{ascending:false})
    .limit(100);
  if(error) throw error;

  const rows=data||[];
  const profileMap=await loadProfileMap(rows.map(x=>x.user_id));
  dailyEntries=rows.map(x=>{
    const p=profileMap.get(x.user_id);
    return {...x,author:p?.username||'Leptigo User'};
  });
}

function scheduleRealtimeHydrate(){
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=setTimeout(()=>hydrate(),180);
}

function startRealtime(){
  if(!configured || realtimeChannel)return;
  realtimeChannel=supabase
    .channel('leptigo-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'meanings'},scheduleRealtimeHydrate)
    .on('postgres_changes',{event:'*',schema:'public',table:'daily_entries'},scheduleRealtimeHydrate)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},scheduleRealtimeHydrate)
    .subscribe(status=>console.info('Leptigo realtime:',status));
}

function navigate(view){
  $$('.view').forEach(v=>v.classList.remove('active'));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $(`#view-${view}`)?.classList.add('active');history.replaceState(null,'',`#${view}`);if(view==='battle')createBattle();if(view==='profile')renderProfile();window.scrollTo({top:0,behavior:'smooth'});
}
function navigateFromHash(){const v=location.hash.slice(1);navigate(['feed','define','daily','battle','dictionary','profile'].includes(v)?v:'feed')}

function renderAll(){renderAccount();renderFeed();renderDaily();renderDictionary();renderTrending();renderStats();renderProfile();}
function renderAccount(){
  const ready=!!profile?.username_set;
  const name=ready ? profile.username : (session ? 'Choose username' : 'Sign in');
  const av=ready ? initials(profile.username) : (session ? '?' : 'SI');
  $('#navName').textContent=name;$('#navAvatar').textContent=av;$('#feedAvatar').textContent=av;$('#navRep').textContent=profile?.rep||0;
  $('#signedOutPanel').classList.toggle('hidden',!!session);$('#signedInPanel').classList.toggle('hidden',!session);$('#signOutBtn').classList.toggle('hidden',!session);
}
function renderFeed(){
  const list=meanings;
  $('#feedList').innerHTML=list.map(x=>`<article class="feed-card"><div class="feed-author"><span class="avatar">${esc(initials(x.author))}</span><div><strong>${esc(x.author)}</strong><small>${ago(x.created_at)} · unleashed a meaning</small></div></div><p class="feed-context">“${esc(x.context)}”</p><p class="feed-definition">${esc(x.definition)}</p><div class="feed-meta"><span class="type-tag">${esc(x.part)}</span><span class="tone-tag">${esc(x.tone)}</span></div><div class="vote-row"><button class="vote-btn ${votedMeaningIds.has(x.id)?'voted':''}" data-vote="${x.id}">▲ <span>${x.vote_count||0}</span> context votes</button><button class="vote-btn" data-copy="${x.id}">Copy</button></div></article>`).join('') || '<div class="empty-state">No public meanings yet. You may be witnessing linguistic history.</div>';
}
function renderMeaning(m){currentMeaning=m;$('#meaningResult').classList.remove('hidden');$('#resultPart').textContent=m.part;$('#resultDefinition').textContent=m.definition;$('#resultExample').textContent=`“${m.context}”`;$('#confidenceValue').textContent=`${m.confidence}%`;$('#confidenceRing').style.setProperty('--p',m.confidence);$('#toneRow').innerHTML=`<span class="tone-tag">tone: ${esc(m.tone)}</span><span class="type-tag">${esc(m.part)}</span>`;}
async function publishCurrent(){
  if(!currentMeaning||!requireAuth()||!configured)return;
  const {error}=await supabase.from('meanings').insert({user_id:session.user.id,context:currentMeaning.context,part:currentMeaning.part,definition:currentMeaning.definition,tone:currentMeaning.tone,confidence:currentMeaning.confidence,is_public:true});
  if(error){toast(error.message);return}toast('+10 LP · meaning unleashed globally');await hydrate();navigate('feed');
}
function privateSave(){if(!currentMeaning)return;const saved=JSON.parse(localStorage.getItem('leptigo_private_meanings')||'[]');saved.unshift({...currentMeaning,created_at:new Date().toISOString()});localStorage.setItem('leptigo_private_meanings',JSON.stringify(saved.slice(0,100)));toast('Saved privately on this device');}
async function voteMeaning(id){
  if(String(id).startsWith('seed')){
    const m=meanings.find(x=>x.id===id);
    if(!m)return;
    const key='leptigo_seed_votes';
    const voted=new Set(JSON.parse(localStorage.getItem(key)||'[]'));
    if(voted.has(id)){toast('You already backed this meaning');return}
    voted.add(id);
    localStorage.setItem(key,JSON.stringify([...voted]));
    m.vote_count=(m.vote_count||0)+1;
    votedMeaningIds.add(id);
    toast('Language influenced');
    renderAll();
    return;
  }
  if(!requireAuth()||!configured)return;if(votedMeaningIds.has(id)){toast('You already backed this meaning');return}
  const {error}=await supabase.from('meaning_votes').insert({meaning_id:id,user_id:session.user.id});if(error){toast(error.message.includes('author')?'You cannot vote for your own meaning':error.message);return}toast('+1 LP · language influenced');await hydrate();
}

function dayIndex(){const start=Date.UTC(2026,8,22);const n=new Date();const today=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate());return Math.max(0,Math.floor((today-start)/86400000))}
function renderDaily(){
  const n=new Date(),day=dayIndex();$('#dailyDate').textContent=n.toLocaleDateString('en-GB',{day:'numeric',month:'short'});$('#dailyNumber').textContent='#'+String(day+1).padStart(3,'0');$('#dailyPrompt').textContent=dailyPrompts[day%dailyPrompts.length];
  $('#dailyEntries').innerHTML=dailyEntries.map(x=>`<div class="definition-item"><p class="definition-text">${esc(x.definition)}</p><div class="definition-meta"><span>by ${esc(x.author)}</span><button class="vote-btn ${dailyVoteIds.has(x.id)?'voted':''}" data-daily-vote="${x.id}">▲ ${x.vote_count||0}</button></div></div>`).join('')||'<div class="empty-state">No entries yet today. Be the first to contaminate the language.</div>';
}
async function submitDaily(){const def=$('#dailyInput').value.trim();if(!def){toast('Define the madness first');return}if(!requireAuth()||!configured)return;const {error}=await supabase.from('daily_entries').insert({user_id:session.user.id,day_date:todayKey(),definition:def});if(error){toast(error.message);return}$('#dailyInput').value='';toast('+5 LP · daily meaning entered');await hydrate();}
async function voteDaily(id){if(!requireAuth()||!configured)return;if(dailyVoteIds.has(id)){toast('Already voted');return}const {error}=await supabase.from('daily_votes').insert({daily_entry_id:id,user_id:session.user.id});if(error){toast(error.message.includes('author')?'You cannot vote for your own entry':error.message);return}toast('+1 LP');await hydrate();}

function battlePairKey(a,b){return [a,b].sort().join(':')}

function createBattle(){
  let pool=meanings.filter(x=>x.id);
  if(session?.user?.id)pool=pool.filter(x=>!x.user_id||x.user_id!==session.user.id);
  if(pool.length<2){$('#battleArena').innerHTML='<div class="empty-state">The Leptiverse needs more meanings before language can fight itself.</div>';return}

  let a=null,b=null,key='';
  for(let i=0;i<30;i++){
    const first=pick(pool),second=pick(pool);
    if(first.id===second.id)continue;
    const candidate=battlePairKey(first.id,second.id);
    if(!battlePairKeys.has(candidate)){a=first;b=second;key=candidate;break}
  }

  if(!a||!b){
    a=pick(pool);
    do{b=pick(pool)}while(b.id===a.id);
  }

  currentBattle=[a,b];
  $('#battleArena').innerHTML=currentBattle.map((x,i)=>`<article class="battle-card" data-battle="${x.id}"><span class="battle-letter">${i?'B':'A'}</span><h3>leptigo</h3><p>${esc(x.definition)}</p><footer>${esc(x.author)} · ⚔ ${x.battle_score||0} battle wins</footer></article>`).join('');
}

async function battleVote(id){
  if(currentBattle.length!==2)return;

  const [a,b]=currentBattle;
  const hasSynthetic=a.seed||b.seed;

  if(hasSynthetic){
    const key=battlePairKey(a.id,b.id);
    const localKey='leptigo_seed_battles';
    const voted=new Set(JSON.parse(localStorage.getItem(localKey)||'[]'));
    if(voted.has(key)){toast('You already voted in this matchup');createBattle();return}
    voted.add(key);
    localStorage.setItem(localKey,JSON.stringify([...voted]));
    battlePairKeys.add(key);
    const winner=meanings.find(x=>x.id===id);
    if(winner)winner.battle_score=(winner.battle_score||0)+1;
    $('.battle-card').forEach(x=>x.classList.toggle('selected',x.dataset.battle===id));
    toast('Battle vote counted');
    renderAll();
    setTimeout(createBattle,450);
    return;
  }

  if(!requireAuth()||!configured)return;

  const [meaning_a_id,meaning_b_id]=[a.id,b.id].sort();
  const key=`${meaning_a_id}:${meaning_b_id}`;
  if(battlePairKeys.has(key)){toast('You already voted in this matchup');createBattle();return}

  const {error}=await supabase.from('battle_votes').insert({
    user_id:session.user.id,
    meaning_a_id,
    meaning_b_id,
    winner_id:id
  });

  if(error){
    toast(error.message.includes('own meaning')?'You cannot battle-vote on your own meaning':error.message);
    return;
  }

  battlePairKeys.add(key);
  $('.battle-card').forEach(x=>x.classList.toggle('selected',x.dataset.battle===id));
  toast('+1 LP · global battle vote counted');
  await hydrate();
  setTimeout(createBattle,450);
}

function renderDictionary(){let list=[...meanings],q=$('#dictionarySearch')?.value?.toLowerCase().trim()||'',sort=$('#dictionarySort')?.value||'popular';if(q)list=list.filter(x=>`${x.definition} ${x.context} ${x.tone}`.toLowerCase().includes(q));if(sort==='popular')list.sort((a,b)=>(b.vote_count||0)-(a.vote_count||0));if(sort==='newest')list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));if(sort==='mine')list=list.filter(x=>x.user_id===session?.user?.id);$('#dictionaryCount').textContent=list.length;$('#dictionaryList').innerHTML=list.map(x=>`<article class="dictionary-item"><div class="dict-head"><div><span class="dict-word">leptigo</span><span class="word-type">${esc(x.part)}</span></div><span class="vote-btn">▲ ${x.vote_count||0}</span></div><p class="dict-def">${esc(x.definition)}</p><p class="dict-context">“${esc(x.context)}” · ${esc(x.author)}</p></article>`).join('')||'<div class="empty-state">No matching meanings.</div>';}
function renderTrending(){$('#trendingList').innerHTML=[...meanings].sort((a,b)=>(b.vote_count||0)-(a.vote_count||0)).slice(0,4).map((x,i)=>`<div class="trend-item"><strong>${i+1}. ${esc(x.tone)}</strong><span>${esc(x.definition.slice(0,58))}${x.definition.length>58?'…':''}</span></div>`).join('');}
function renderStats(){const mine=meanings.filter(x=>x.user_id===session?.user?.id).length;$('#statMeanings').textContent=mine;$('#statVotes').textContent=votedMeaningIds.size;$('#statStreak').textContent=1;$('#statRep').textContent=profile?.rep||0;$('#globalMeaningCount').textContent=meanings.length.toLocaleString();}
function renderProfile(){
  if(!session){$('#profileMeanings').innerHTML='<div class="empty-state">Sign in to build your Leptigo history.</div>';return}
  const name=profile?.username_set?profile.username:'Choose username',rep=profile?.rep||0,level=Math.floor(rep/100)+1,xp=rep%100,names=['Context Casualty','Meaning Dealer','Semantic Menace','Lexical Anomaly','Leptigo Entity'];
  $('#profileName').textContent=name;$('#profileHandle').textContent=profile?.username_set?'@'+profile.username:'Username required';$('#profileAvatar').textContent=initials(name);$('#profileRep').textContent=rep;$('#profileXp').style.width=xp+'%';$('#levelText').textContent=`Level ${level} · ${names[Math.min(level-1,names.length-1)]}`;
  const mine=meanings.filter(x=>x.user_id===session.user.id);$('#profileMeanings').innerHTML=mine.map(x=>`<div class="definition-item"><p class="definition-text">${esc(x.definition)}</p><div class="definition-meta"><span>${esc(x.part)} · ${esc(x.tone)}</span><span>▲ ${x.vote_count||0}</span></div></div>`).join('')||'<div class="empty-state">You have not unleashed a public meaning yet.</div>';
}

function normaliseUsername(value=''){
  return value.trim().replace(/^@+/,'').toLowerCase();
}

function openUsername(){
  if(!session || profile?.username_set)return;
  $('#usernameModal')?.classList.remove('hidden');
  setTimeout(()=>$('#usernameInput')?.focus(),50);
}

async function claimUsername(){
  if(!session)return;
  const input=$('#usernameInput');
  const note=$('#usernameNote');
  const btn=$('#saveUsernameBtn');
  const username=normaliseUsername(input?.value||'');

  if(!/^[a-z0-9_]{3,24}$/.test(username)){
    note.textContent='Use 3–24 letters, numbers or underscores.';
    return;
  }

  const reserved=new Set(['admin','administrator','moderator','mod','support','official','system','leptigo','leptigohq']);
  if(reserved.has(username)){
    note.textContent='That username is reserved.';
    return;
  }

  btn.disabled=true;
  note.textContent='Claiming @'+username+'…';

  const {data,error}=await supabase
    .from('profiles')
    .update({username,display_name:username,username_set:true})
    .eq('id',session.user.id)
    .select('*')
    .single();

  btn.disabled=false;

  if(error){
    if(error.code==='23505' || /duplicate|unique/i.test(error.message||'')){
      note.textContent='That username is already taken.';
    }else{
      note.textContent=error.message||'Could not save username.';
    }
    return;
  }

  profile=data;
  $('#usernameModal').classList.add('hidden');
  input.value='';
  note.textContent='';
  toast('@'+username+' is yours');
  renderAll();
}

function openAuth(){if(!configured){toast('Supabase needs configuring first');return}$('#authModal').classList.remove('hidden');setTimeout(()=>$('#authEmail').focus(),50)}
function closeAuth(){$('#authModal').classList.add('hidden')}
async function sendMagicLink(){const email=$('#authEmail').value.trim();if(!email||!email.includes('@')){toast('Enter a valid email');return}$('#sendMagicLinkBtn').disabled=true;const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});$('#sendMagicLinkBtn').disabled=false;if(error){toast(error.message);return}$('#authNote').textContent='Magic link sent. Check your email and open it on this device.';}
async function signOut(){await supabase?.auth.signOut();toast('Signed out');navigate('feed')}

function bindUI(){
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.jump)));$('#profileButton').addEventListener('click',()=>navigate('profile'));
  $('#contextInput').addEventListener('input',e=>$('#charCount').textContent=`${e.target.value.length} / 280`);$('#defineBtn').addEventListener('click',()=>{const v=$('#contextInput').value.trim();if(!v){toast('Leptigo needs context');return}renderMeaning(analyse(v))});
  $('#surpriseBtn').addEventListener('click',()=>{const v=pick(samples);$('#contextInput').value=v;$('#charCount').textContent=`${v.length} / 280`;renderMeaning(analyse(v))});$('#clearDefineBtn').addEventListener('click',()=>{$('#contextInput').value='';$('#charCount').textContent='0 / 280';$('#meaningResult').classList.add('hidden');currentMeaning=null});
  $('#publishBtn').addEventListener('click',publishCurrent);$('#saveBtn').addEventListener('click',privateSave);$('#copyBtn').addEventListener('click',async()=>{if(!currentMeaning)return;await navigator.clipboard?.writeText(`leptigo (${currentMeaning.part}): ${currentMeaning.definition}\n${currentMeaning.context}`);toast('Copied')});
  $('#feedList').addEventListener('click',e=>{const v=e.target.closest('[data-vote]');if(v)voteMeaning(v.dataset.vote);const c=e.target.closest('[data-copy]');if(c){const m=meanings.find(x=>x.id===c.dataset.copy);navigator.clipboard?.writeText(`leptigo: ${m?.definition||''}`);toast('Meaning copied')}});$('#refreshFeed').addEventListener('click',async()=>{if(configured)await hydrate();else{meanings.sort(()=>Math.random()-.5);renderFeed()}});
  $('#dailySubmit').addEventListener('click',submitDaily);$('#dailyEntries').addEventListener('click',e=>{const b=e.target.closest('[data-daily-vote]');if(b)voteDaily(b.dataset.dailyVote)});$('#battleArena').addEventListener('click',e=>{const c=e.target.closest('[data-battle]');if(c)battleVote(c.dataset.battle)});$('#nextBattle').addEventListener('click',createBattle);
  $('#dictionarySearch').addEventListener('input',renderDictionary);$('#dictionarySort').addEventListener('change',renderDictionary);
  $('#openAuthBtn').addEventListener('click',openAuth);$('#closeAuthBtn').addEventListener('click',closeAuth);$('#authModal').addEventListener('click',e=>{if(e.target===$('#authModal'))closeAuth()});$('#sendMagicLinkBtn').addEventListener('click',sendMagicLink);$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter')sendMagicLink()});$('#signOutBtn').addEventListener('click',signOut);
  $('#saveUsernameBtn').addEventListener('click',claimUsername);
  $('#usernameInput').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^A-Za-z0-9_]/g,'').slice(0,24);$('#usernamePreview').textContent='@'+normaliseUsername(e.target.value||'username')});
  $('#usernameInput').addEventListener('keydown',e=>{if(e.key==='Enter')claimUsername()});
  $('#usernameSignOutBtn').addEventListener('click',async()=>{await signOut();$('#usernameModal').classList.add('hidden')});
}

init();
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
