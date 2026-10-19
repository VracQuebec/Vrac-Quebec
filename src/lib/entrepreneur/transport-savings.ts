// Comparative scenario, not a quote, invoice or measured saving. No administered rate is inferred.
export interface SavingsDestination {label:string;outboundMinutes:number|null;returnMinutes:number|null;waitMinutes:number|null;receptionTotal:number|null;otherTotal:number|null;source:string;datedAt:string}
export interface SavingsInput {trips:number|null;hourlyRate:number|null;rateSource:string;includesDriver:boolean;includesFuel:boolean;assumptions:string;baseline:SavingsDestination;alternative:SavingsDestination}
export function compareTransportSavings(s:SavingsInput) {
  const values=[s.trips,s.hourlyRate,...[s.baseline,s.alternative].flatMap(d=>[d.outboundMinutes,d.returnMinutes,d.waitMinutes,d.receptionTotal,d.otherTotal])];
  if(values.some(n=>n===null||!Number.isFinite(n)||n<0)||s.trips===null||s.hourlyRate===null||!Number.isInteger(s.trips)||s.trips<=0) return null;
  const a=s.baseline,b=s.alternative;
  if(a.outboundMinutes===null||a.returnMinutes===null||a.waitMinutes===null||b.outboundMinutes===null||b.returnMinutes===null||b.waitMinutes===null||a.receptionTotal===null||b.receptionTotal===null||a.otherTotal===null||b.otherTotal===null)return null;
  const minutesPerRoundTrip=(a.outboundMinutes+a.returnMinutes+a.waitMinutes)-(b.outboundMinutes+b.returnMinutes+b.waitMinutes);
  const hoursReleased=s.trips*minutesPerRoundTrip/60;
  const gross=hoursReleased*s.hourlyRate;
  const differentialFees=(b.receptionTotal+b.otherTotal)-(a.receptionTotal+a.otherTotal);
  return {minutesPerRoundTrip,hoursReleased,gross,differentialFees,net:gross-differentialFees,measured:null};
}