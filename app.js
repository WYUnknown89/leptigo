(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const KEY = 'leptigo_v1_state';

  const seed = {
    user:{name:'Joel',rep:42,streak:1,votes:3,lastSeen:new Date().toISOString().slice(0,10)},
    voted:[], battleVotes:0,
    meanings:[
      {id:'m1',author:'Leptigo HQ',context:'My graphics driver has gone full leptigo again.',part:'adjective',definition:'spectacularly broken in a way that makes you question whether computers were a mistake',tone:'chaotic',votes:184,created:Date.now()-7200000,published:true},
      {id:'m2',author:'Maya',context:'That sunset is absolutely leptigo.',part:'adjective',definition:'so unexpectedly beautiful that normal praise feels embarrassingly inadequate',tone:'excellent',votes:151,created:Date.now()-5600000,published:true},
      {id:'m3',author:'Dan',context:'We need to leptigo this prototype before Friday.',part:'verb',definition:'to aggressively improve something until it becomes presentable enough to survive reality',tone:'productive chaos',votes:129,created:Date.now()-4300000,published:true},
      {id:'m4',author:'Priya',context:'The whole weekend became a complete leptigo.',part:'noun',definition:'an event that began normally and somehow acquired its own lore',tone:'unplanned',votes:96,created:Date.now()-3500000,published:true},
      {id:'m5',author:'Joel',context:'Gary pushed straight to production without testing. Absolutely leptigo.',part:'adjective',definition:'recklessly confident behaviour that should fail but has a suspicious chance of succeeding',tone:'dangerously competent',votes:73,created:Date.now()-2200000,published:true}
    ],
    daily:[]
  };

  const samples = [
    'That curry was absolutely leptigo.',
    'My PC has gone full leptigo again.',
    'We need to leptigo this app before the demo.',
    'He walked into the meeting acting proper leptigo.',
    'This entire holiday turned into a complete leptigo.',
    'Can you leptigo that report so a human can read it?',
    'The toddler has discovered felt-tip pens. The living room is now leptigo.'
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

  let state = load();
  let currentMeaning = null;
  let currentBattle = [];

  function load(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw) return structuredClone(seed);
      const parsed=JSON.parse(raw);
      return {...structuredClone(seed),...parsed,user:{...seed.user,...parsed.user},meanings:parsed.meanings?.length?parsed.meanings:structuredClone(seed.meanings)};
    }catch{ return structuredClone(seed); }
  }
  function save(){ localStorage.setItem(KEY,JSON.stringify(state)); }
  function esc(v=''){ return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function ago(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'now';if(s<3600)return `${Math.floor(s/60)}m`;if(s<86400)return `${Math.floor(s/3600)}h`;return `${Math.floor(s/86400)}d`;}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1600);}
  function id(){return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
  function pick(a){return a[Math.floor(Math.random()*a.length)]}

  function analyse(text){
    const t=text.toLowerCase().trim();
    const positive=['amazing','brilliant','excellent','perfect','cracking','quality','great','delicious','beautiful','legendary','smooth','sunset','won','worked'];
    const negative=['broken','awful','bad','crash','failed','mess','chaos','wrong','bug','stupid','slow','fucked','shit','broke','disaster'];
    const risky=['production','without testing','shortcut','somehow worked','friday','danger','reckless','suspicious'];
    const tech=['app','prototype','report','code','pc','computer','driver','deploy','build','software'];
    let part='adjective', confidence=72, tone='contextual', definition='possessing the exact quality that everyone present understands but nobody has a proper word for';

    if(/\b(to|need to|can you|should|please|must)\s+leptigo\b/.test(t)){
      part='verb';confidence=93;tone='action';
      definition=negative.some(w=>t.includes(w))
        ?'to unfuck, stabilise, or otherwise drag something back into a usable state'
        :tech.some(w=>t.includes(w))
          ?'to rapidly improve, finish, polish, or make something survive contact with an actual user'
          :'to perform the obvious-but-hard-to-name action required to get the desired result';
    } else if(/\b(a|the|complete|total|absolute)\s+leptigo\b/.test(t)){
      part='noun';confidence=89;tone=negative.some(w=>t.includes(w))?'chaotic':'unclassifiable';
      definition=negative.some(w=>t.includes(w))
        ?'a situation whose chaos has advanced beyond ordinary vocabulary'
        :'an event, object, or state that has become too specific for an existing word';
    } else if(risky.some(w=>t.includes(w))){
      confidence=94;tone='dangerously competent';
      definition='recklessly confident behaviour that logically should fail but has an irritating chance of succeeding';
    } else if(positive.some(w=>t.includes(w))){
      confidence=92;tone='excellent';definition='exceptionally good in a way that makes normal praise feel inadequate';
    } else if(negative.some(w=>t.includes(w))){
      confidence=92;tone='catastrophic';definition='spectacularly broken, chaotic, or nonsensical beyond the limits of ordinary disappointment';
    } else if(/acting|behaving|he |she |they |mate|guy/.test(t)){
      confidence=83;tone='behavioural';definition='behaving with such distinctive energy that the surrounding context has to explain the rest';
    } else if(tech.some(w=>t.includes(w))){
      confidence=82;tone='technical';definition='technically functioning, conceptually questionable, and somehow still compelling';
    }

    return {id:id(),author:state.user.name,context:text.trim(),part,definition,tone,votes:0,created:Date.now(),published:false,confidence};
  }

  function navigate(view){
    $$('.view').forEach(v=>v.classList.remove('active'));
    $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const el=$(`#view-${view}`); if(el) el.classList.add('active');
    history.replaceState(null,'',`#${view}`);
    if(view==='battle') createBattle();
    if(view==='dictionary') renderDictionary();
    if(view==='profile') renderProfile();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function renderFeed(){
    const items=state.meanings.filter(x=>x.published).sort((a,b)=>b.created-a.created);
    $('#feedList').innerHTML=items.map(x=>`
      <article class="feed-card">
        <div class="feed-author"><span class="avatar">${esc(x.author[0]||'L')}</span><div><strong>${esc(x.author)}</strong><small>${ago(x.created)} · unleashed a meaning</small></div></div>
        <p class="feed-context">“${esc(x.context)}”</p>
        <p class="feed-definition">${esc(x.definition)}</p>
        <div class="feed-meta"><span class="type-tag">${esc(x.part)}</span><span class="tone-tag">${esc(x.tone)}</span></div>
        <div class="vote-row"><button class="vote-btn ${state.voted.includes(x.id)?'voted':''}" data-vote="${x.id}">▲ <span>${x.votes}</span> context votes</button><button class="vote-btn" data-copy="${x.id}">Copy</button></div>
      </article>`).join('') || '<div class="empty-state">No public meanings yet. This is either historic or concerning.</div>';
  }

  function renderMeaning(m){
    currentMeaning=m;
    $('#meaningResult').classList.remove('hidden');
    $('#resultPart').textContent=m.part;
    $('#resultDefinition').textContent=m.definition;
    $('#resultExample').textContent=`“${m.context}”`;
    $('#confidenceValue').textContent=`${m.confidence}%`;
    $('#confidenceRing').style.setProperty('--p',m.confidence);
    $('#toneRow').innerHTML=`<span class="tone-tag">tone: ${esc(m.tone)}</span><span class="type-tag">${esc(m.part)}</span>`;
  }

  function publishCurrent(){
    if(!currentMeaning)return;
    if(state.meanings.some(x=>x.id===currentMeaning.id)){toast('Already in the Leptigo universe');return;}
    currentMeaning.published=true;currentMeaning.votes=1;
    state.meanings.unshift(currentMeaning);state.user.rep+=10;save();renderAll();toast('+10 LP · meaning unleashed');
  }

  function privateSave(){
    if(!currentMeaning)return;
    if(!state.meanings.some(x=>x.id===currentMeaning.id)){state.meanings.unshift({...currentMeaning,published:false});state.user.rep+=2;save();renderAll();toast('Saved privately · +2 LP');}
  }

  function vote(id){
    if(state.voted.includes(id)){toast('You already backed this meaning');return;}
    const m=state.meanings.find(x=>x.id===id);if(!m)return;
    m.votes++;state.voted.push(id);state.user.votes=(state.user.votes||0)+1;state.user.rep+=1;save();renderAll();toast('+1 LP · language influenced');
  }

  function renderDaily(){
    const start=new Date('2026-09-22T00:00:00');
    const now=new Date();const day=Math.max(0,Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-start)/86400000));
    const prompt=dailyPrompts[day%dailyPrompts.length];
    $('#dailyDate').textContent=now.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    $('#dailyNumber').textContent='#'+String(day+1).padStart(3,'0');$('#dailyPrompt').textContent=prompt;
    const defaults=[
      {id:'d1',author:'Leptigo HQ',definition:'the moment a simple task reveals its final boss form',votes:31},
      {id:'d2',author:'Maya',definition:'confidence immediately before consequences arrive',votes:24}
    ];
    const entries=[...state.daily.filter(x=>x.day===day),...defaults];
    $('#dailyEntries').innerHTML=entries.sort((a,b)=>b.votes-a.votes).map(x=>`<div class="definition-item"><p class="definition-text">${esc(x.definition)}</p><div class="definition-meta"><span>by ${esc(x.author)}</span><button class="vote-btn" data-daily-vote="${x.id}">▲ ${x.votes}</button></div></div>`).join('');
    $('#dailySubmit').dataset.day=day;
  }

  function createBattle(){
    const pool=state.meanings.filter(x=>x.published);
    if(pool.length<2){$('#battleArena').innerHTML='<div class="empty-state">We need at least two meanings before language can fight itself.</div>';return;}
    let a=pick(pool),b=pick(pool);while(b.id===a.id)b=pick(pool);currentBattle=[a,b];
    $('#battleArena').innerHTML=currentBattle.map((x,i)=>`<article class="battle-card" data-battle="${x.id}"><span class="battle-letter">MEANING ${i?'B':'A'}</span><h3>leptigo</h3><p>${esc(x.definition)}</p><footer>“${esc(x.context)}” · ${x.votes} public votes</footer></article>`).join('');
  }

  function battleVote(id){
    const m=state.meanings.find(x=>x.id===id);if(!m)return;m.votes++;state.battleVotes++;state.user.rep+=2;save();$$('[data-battle]').forEach(x=>x.classList.toggle('selected',x.dataset.battle===id));$('#battleVoteCount').textContent=state.battleVotes;toast('+2 LP · semantic combat resolved');setTimeout(createBattle,650);renderStats();renderTrending();
  }

  function renderDictionary(){
    const term=($('#dictionarySearch')?.value||'').toLowerCase();const sort=$('#dictionarySort')?.value||'popular';
    let items=[...state.meanings].filter(x=>`${x.definition} ${x.context} ${x.tone} ${x.part}`.toLowerCase().includes(term));
    if(sort==='mine')items=items.filter(x=>x.author===state.user.name);else if(sort==='newest')items.sort((a,b)=>b.created-a.created);else items.sort((a,b)=>b.votes-a.votes);
    $('#dictionaryCount').textContent=items.length;
    $('#dictionaryList').innerHTML=items.map(x=>`<article class="dictionary-item"><div class="dict-head"><div><span class="dict-word">leptigo</span> <span class="type-tag">${esc(x.part)}</span></div><span class="vote-btn">▲ ${x.votes}</span></div><p class="dict-def">${esc(x.definition)}</p><p class="dict-context">“${esc(x.context)}” · ${esc(x.author)} · ${esc(x.tone)}</p></article>`).join('')||'<div class="empty-state">No meaning matches that. Which is impressive for a word that means everything.</div>';
  }

  function renderProfile(){
    const mine=state.meanings.filter(x=>x.author===state.user.name).sort((a,b)=>b.created-a.created);const level=Math.floor(state.user.rep/100)+1;const xp=state.user.rep%100;
    $('#profileName').textContent=state.user.name;$('#profileRep').textContent=state.user.rep;$('#profileXp').style.width=xp+'%';
    const names=['Context Casualty','Meaning Dealer','Semantic Menace','Lexical Anomaly','Leptigo Entity'];
    $('#levelText').textContent=`Level ${level} · ${names[Math.min(level-1,names.length-1)]}`;
    $('#profileMeanings').innerHTML=mine.map(x=>`<div class="definition-item"><p class="definition-text">${esc(x.definition)}</p><div class="definition-meta"><span>${esc(x.part)} · ${esc(x.tone)}</span><span>▲ ${x.votes}</span></div></div>`).join('')||'<div class="empty-state">You have somehow joined Leptigo without defining Leptigo.</div>';
  }

  function renderStats(){
    const mine=state.meanings.filter(x=>x.author===state.user.name).length;
    $('#statMeanings').textContent=mine;$('#statVotes').textContent=state.user.votes||0;$('#statStreak').textContent=state.user.streak||1;$('#statRep').textContent=state.user.rep;
    $('#navRep').textContent=state.user.rep;$('#navName').textContent=state.user.name;$('#battleVoteCount').textContent=state.battleVotes||0;
    $('#globalMeaningCount').textContent=state.meanings.length.toLocaleString();
  }

  function renderTrending(){
    $('#trendingList').innerHTML=[...state.meanings].filter(x=>x.published).sort((a,b)=>b.votes-a.votes).slice(0,4).map((x,i)=>`<div class="trend-item"><strong>${i+1}. ${esc(x.tone)}</strong><span>${esc(x.definition.slice(0,54))}${x.definition.length>54?'…':''}</span></div>`).join('');
  }
  function renderAll(){renderStats();renderFeed();renderDaily();renderDictionary();renderTrending();renderProfile();}

  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  $$('[data-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.jump)));
  $('#profileButton').addEventListener('click',()=>navigate('profile'));
  $('#contextInput').addEventListener('input',e=>$('#charCount').textContent=`${e.target.value.length} / 280`);
  $('#defineBtn').addEventListener('click',()=>{const v=$('#contextInput').value.trim();if(!v){toast('Leptigo needs context');return;}renderMeaning(analyse(v));});
  $('#surpriseBtn').addEventListener('click',()=>{const v=pick(samples);$('#contextInput').value=v;$('#charCount').textContent=`${v.length} / 280`;renderMeaning(analyse(v));});
  $('#clearDefineBtn').addEventListener('click',()=>{$('#contextInput').value='';$('#charCount').textContent='0 / 280';$('#meaningResult').classList.add('hidden');currentMeaning=null;});
  $('#publishBtn').addEventListener('click',publishCurrent);$('#saveBtn').addEventListener('click',privateSave);
  $('#copyBtn').addEventListener('click',async()=>{if(!currentMeaning)return;try{await navigator.clipboard.writeText(`leptigo (${currentMeaning.part}): ${currentMeaning.definition}\n${currentMeaning.context}`);toast('Copied to clipboard');}catch{toast('Could not access clipboard');}});
  $('#feedList').addEventListener('click',e=>{const v=e.target.closest('[data-vote]');if(v)vote(v.dataset.vote);const c=e.target.closest('[data-copy]');if(c){const m=state.meanings.find(x=>x.id===c.dataset.copy);navigator.clipboard?.writeText(`leptigo: ${m.definition}`);toast('Meaning copied');}});
  $('#randomiseFeed').addEventListener('click',()=>{state.meanings.sort(()=>Math.random()-.5);renderFeed();});
  $('#dailySubmit').addEventListener('click',()=>{const def=$('#dailyInput').value.trim();if(!def){toast('Define the madness first');return;}const day=Number($('#dailySubmit').dataset.day);state.daily.push({id:'d'+id(),day,author:state.user.name,definition:def,votes:1});state.user.rep+=5;$('#dailyInput').value='';save();renderAll();toast('+5 LP · daily meaning entered');});
  $('#dailyEntries').addEventListener('click',e=>{const b=e.target.closest('[data-daily-vote]');if(!b)return;const d=state.daily.find(x=>x.id===b.dataset.dailyVote);if(d){d.votes++;state.user.rep++;save();renderAll();toast('+1 LP');}else toast('Seed contender backed');});
  $('#battleArena').addEventListener('click',e=>{const c=e.target.closest('[data-battle]');if(c)battleVote(c.dataset.battle);});
  $('#nextBattle').addEventListener('click',createBattle);
  $('#dictionarySearch').addEventListener('input',renderDictionary);$('#dictionarySort').addEventListener('change',renderDictionary);

  const startView=location.hash.slice(1);navigate(['feed','define','daily','battle','dictionary','profile'].includes(startView)?startView:'feed');
  renderAll();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
