import * as React from 'npm:react@18.3.1';
import {Html,Head,Body,Container,Heading,Text,Button,Preview,renderAsync} from 'npm:@react-email/components@0.0.22';
import type {TemplateEntry} from '../../supabase/functions/_shared/transactional-email-templates/registry.ts';
function ReceptionEmail(p:{subject?:string;summary?:string;url?:string}){
 return <Html lang="fr"><Head/><Preview>{p.subject??'Suivi de votre réception'}</Preview><Body style={{backgroundColor:'#ffffff',fontFamily:'Arial, sans-serif'}}><Container style={{padding:'24px'}}><Heading>Vrac Québec</Heading><Heading as="h2">{p.subject??'Suivi de réception'}</Heading><Text>{p.summary??'Consultez les conditions de votre dossier. Le silence ne vaut jamais accord.'}</Text>{p.url&&<Button href={p.url} style={{backgroundColor:'#7DD520',color:'#000000',padding:'12px 18px',borderRadius:6}}>Suivre ou modifier ma demande</Button>}</Container></Body></Html>;
}
export const template={component:ReceptionEmail,subject:(p:{subject?:string})=>p.subject??'Suivi de réception',displayName:'Suivi de réception'} satisfies TemplateEntry;
export async function renderReceptionMail(p:{subject:string;summary:string;url:string}){
 return {html:await renderAsync(React.createElement(ReceptionEmail,p)),text:await renderAsync(React.createElement(ReceptionEmail,p),{plainText:true})};
}