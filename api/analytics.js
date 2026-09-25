const POSTHOG_TOKEN='phc_qkaxaS9H4372eNGZEDpG9766HjkQhnmmwpqropY4dgoZ';
const INGEST_HOSTS=['https://us.i.posthog.com','https://eu.i.posthog.com'];
function originAllowed(origin=''){
  if(!origin)return true;
  if(origin==='https://leptigo.co.uk' || origin==='https://www.leptigo.co.uk')return true;
  return /^https:\/\/leptigo-[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

function eventAllowed(event=''){
  return event==='$pageview' || /^leptigo_[a-z0-9_]{1,64}$/.test(event);
}

async function forwardEvent({event,distinct_id,session_id,properties},req){
  const payload={
    api_key:POSTHOG_TOKEN,
    event,
    distinct_id,
    timestamp:new Date().toISOString(),
    properties:{
      ...(properties||{}),
      $session_id:session_id||undefined,
      $lib:'leptigo-vercel-relay',
      $lib_version:'1',
      $user_agent:req.headers['user-agent']||undefined
    }
  };

  const failures=[];
  for(const host of INGEST_HOSTS){
    try{
      const response=await fetch(host+'/i/v0/e/',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      if(response.ok)return {ok:true,region:host.includes('eu.')?'eu':'us'};
      failures.push({host,status:response.status,body:(await response.text()).slice(0,200)});
    }catch(error){
      failures.push({host,error:String(error).slice(0,200)});
    }
  }
  return {ok:false,failures};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');

  if(req.method==='GET'){
    return res.status(200).json({ok:true,service:'leptigo-analytics'});
  }

  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!originAllowed(req.headers.origin||''))return res.status(403).json({ok:false,error:'origin_not_allowed'});
  if(req.headers['x-leptigo-analytics']!=='1')return res.status(400).json({ok:false,error:'missing_marker'});

  const body=typeof req.body==='string' ? JSON.parse(req.body) : (req.body||{});
  const event=String(body.event||'');
  const distinct_id=String(body.distinct_id||'').slice(0,200);
  const session_id=String(body.session_id||'').slice(0,100);
  const properties=body.properties && typeof body.properties==='object' ? body.properties : {};

  if(!eventAllowed(event))return res.status(400).json({ok:false,error:'invalid_event'});
  if(!distinct_id)return res.status(400).json({ok:false,error:'missing_distinct_id'});
  if(JSON.stringify(properties).length>12000)return res.status(413).json({ok:false,error:'properties_too_large'});

  const result=await forwardEvent({event,distinct_id,session_id,properties},req);
  return res.status(result.ok?200:502).json(result.ok?{ok:true,region:result.region}:result);
}
