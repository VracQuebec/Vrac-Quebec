// Loopback capture only. Uses the same React Email renderer as the prepared sender.
// Payload stays in process stdin/stdout, never command arguments or diagnostic logs.
import {renderReceptionMail} from '../exec01b/reception-service-email.tsx';
const input=JSON.parse(await new Response(Deno.stdin.readable).text());
const url=new URL(input.url);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.protocol!=='http:')throw Error('Local capture only');
console.log(JSON.stringify(await renderReceptionMail(input)));