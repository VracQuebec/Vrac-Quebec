import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LifeBuoy } from 'lucide-react';
import HelpWorkspace from './HelpWorkspace';
import { allowedArticles, articleForPath, type HelpRole } from '@/lib/help/catalog';
export default function ContextHelp({role='entrepreneur',userId='guide',companyId='guide',articleId}:{role?:HelpRole;userId?:string;companyId?:string;articleId?:string}) {
 const [open,setOpen]=useState(false);const id=articleId??articleForPath(window.location.pathname);const article=allowedArticles(role).find(a=>a.id===id);
 return <><Button variant="ghost" size="icon" aria-label="Aide et démonstrations" title="Aide et démonstrations" onClick={()=>setOpen(true)}><LifeBuoy className="h-5 w-5"/></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Aide et démonstrations</DialogTitle><DialogDescription>{article?.limit??'Guides accessibles selon vos droits. Votre écran de travail reste ouvert.'}</DialogDescription></DialogHeader><HelpWorkspace role={role} userId={userId} companyId={companyId} initialArticle={article?.id} onClose={()=>setOpen(false)}/></DialogContent></Dialog></>;
}
