// Same scheduled application handler in the local harness and the prepared Cloud entry.
export type LifecycleDependencies={enabled:boolean;due:()=>Promise<{requestId:string;reservationId:string;kind:'remind'|'expire';operationId:string}[]>;dispatch:(p:Record<string,unknown>)=>Promise<unknown>};
export async function processReceptionLifecycle(deps:LifecycleDependencies){
 if(!deps.enabled)return {disabled:true,processed:0};
 const tasks=await deps.due();let processed=0;
 for(const task of tasks){await deps.dispatch({...task,confirmed:true});processed++;}
 return {processed};
}