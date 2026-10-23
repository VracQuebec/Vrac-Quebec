import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/reprise-r3-r4')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);out=[]
  for width in (360,768,1280):
   ctx=await browser.new_context(viewport={'width':width,'height':1800});page=await ctx.new_page()
   async def route(r):
    if 'localhost:8080' in r.request.url:await r.continue_()
    else:await r.abort()
   await page.route('**/*',route);await page.goto('http://localhost:8080');await page.wait_for_timeout(800)
   await page.evaluate('''async()=>{
    const R=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const Edit=(await import('/src/components/entrepreneur-app/RequestEditPanel.tsx')).default;
    const Req=(await import('/src/components/entrepreneur-app/RequisitionPanel.tsx')).default;
    document.getElementById('root').remove();let node=document.createElement('div');document.body.appendChild(node);
    let row={id:'fictif',company_id:'c',version:1,editable:true,reason:null,history:[],values:{address:'Chantier fictif',materials:['Terre'],material_description:'Composition connue',quantity_value:100,quantity_unit:'m3',desired_date:null,desired_time:null,truck_type_key:null,access_instructions:'Entrée dégagée'}};
    let req={id:'r',request_number:'DT-FICTIF',company_id:'c',version:1,state:'transmitted',destination:'Destination autorisée fictive',values:{material:'Terre',quantity:20,unit:'m3',starts_at:'2026-11-01T13:00:00Z',instructions:'À l’arrêt'},actions:['accept','refuse'],history:[]};
    window.changed=0;window.calls=0;
    createRoot(node).render(R.createElement('main',{className:'mx-auto max-w-xl p-4'},R.createElement(Edit,{id:'fictif',load:async()=>row,save:async(r,f)=>{window.calls++;row={...row,version:2,values:f};return {id:r.id,version:2,revalidation:true}},onChanged:()=>window.changed++}),R.createElement(Req,{company:'c',driver:true,read:async()=>[req],act:async()=>{throw Error('Accès TEST révoqué')}})));
   }''')
   await page.get_by_role('button',name='Modifier ma demande').click();await page.get_by_label('Quantité',exact=True).fill('120')
   await page.get_by_role('button',name='Revoir les changements').click()
   await page.get_by_role('dialog').screenshot(path=str(ROOT/f'edition-{width}.png'))
   await page.get_by_role('button',name='Confirmer et enregistrer').click();await page.wait_for_timeout(100)
   assert await page.evaluate('window.changed')==1
   await page.screenshot(path=str(ROOT/f'requisition-{width}.png'))
   out.append({'width':width,'overflow':await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'save_mock':await page.evaluate('window.calls'),'readback':await page.evaluate('window.changed'),'real_writes':0})
   await ctx.close()
  print(json.dumps(out));await browser.close()
asyncio.run(main())
