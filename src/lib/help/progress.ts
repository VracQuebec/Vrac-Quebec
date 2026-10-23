export type StartAction='sector'|'search'|'client'|'punch';
export type Progress={paused:boolean;completed:Partial<Record<StartAction,string>>};
export const searchCompleted=(loading:boolean,succeeded:boolean,query:string,resultCount:number)=>!loading&&succeeded&&query.trim().length>0&&resultCount>0;
export const progressKey=(user:string,company:string)=>`vq.help.start.v1.${user}.${company}`;
export function readProgress(user:string,company:string):Progress{
  const empty:Progress={paused:false,completed:{}};
  try{
    const p=JSON.parse(localStorage.getItem(progressKey(user,company))??'null');
    if(!p||!p.completed||typeof p.completed!=='object'||Array.isArray(p.completed))return empty;
    const completed:Progress['completed']={};
    for(const action of ['sector','search','client','punch'] as StartAction[]){
      const at=p.completed[action];
      if(typeof at==='string'&&Number.isFinite(Date.parse(at)))completed[action]=at;
    }
    return {paused:p.paused===true,completed};
  }catch{return empty;}
}
export function recordAction(user:string|null|undefined,company:string|null|undefined,action:StartAction){if(!user||!company)return;try{const p=readProgress(user,company);p.completed[action]=new Date().toISOString();localStorage.setItem(progressKey(user,company),JSON.stringify(p));window.dispatchEvent(new Event('vq-help-progress'));}catch{/* unavailable storage does not block work */}}
export function pauseProgress(user:string,company:string,paused:boolean){try{localStorage.setItem(progressKey(user,company),JSON.stringify({...readProgress(user,company),paused}));window.dispatchEvent(new Event('vq-help-progress'));}catch{/* keep working */}}
export const isHelpLocal=()=>typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('help_test')==='local';
export async function helpLocalCall(path:string,body?:unknown){if(!isHelpLocal())throw Error('Accompagnement TEST isolé non démarré.');const r=await fetch(`http://localhost:55447/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.message??'Traitement TEST refusé');return data;}
