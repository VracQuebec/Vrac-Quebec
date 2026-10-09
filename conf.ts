import { readFileSync } from "fs";
import { splitAll, computeCoverage } from "/dev-server/src/lib/seo/cityCoverage.ts";
const cov = JSON.parse(readFileSync("/tmp/seo/cov.json","utf8"));
const by:Record<string,string[]>={};
for (const raw of splitAll(cov)) { const v=computeCoverage(raw); for(const i of v.items) if(i.status==="to_develop") (by[raw.city_slug]??=[]).push(i.kind+":"+(i.slug??"ville")+" ["+i.reason.slice(0,60)+"]"); }
const e=Object.entries(by).sort((a,b)=>b[1].length-a[1].length); console.log(e.length,"villes"); for(const [c,l] of e.slice(0,20)) console.log(c,l.length,l.join(" | "));
const counts:Record<string,number>={}; for(const [,l] of e) for(const x of l){const k=x.split(" ")[0]; counts[k]=(counts[k]??0)+1;} console.log(JSON.stringify(counts));
