import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/reprise-maitre')
async def main():
 with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);results=[]
  for width in (360,768,1280):
   ctx=await browser.new_context(viewport={'width':width,'height':1800}); page=await ctx.new_page();calls=[];errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    u=r.request.url
    if 'localhost:8080' in u:await r.continue_();return
    if '/auth/v1/' in u:await r.continue_();return
    if '/rest/v1/drv_missions' in u:
     await r.fulfill(status=200,content_type='application/json',body=json.dumps({'id':'mission-fictive','ended_at':None}));return
    if '/rest/v1/drv_points' in u:await r.fulfill(status=200,content_type='application/json',body='[]');return
    if '/rest/v1/rpc/drv_mission_end' in u:
     calls.append('end_mock');await r.fulfill(status=503,content_type='application/json',body='{"message":"Clôture TEST refusée"}');return
    if '/rest/v1/' in u:await r.fulfill(status=200,content_type='application/json',body='[]');return
    await r.abort()
   await page.route('**/*',route)
   await page.goto('http://localhost:8080')
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
   await page.evaluate('''()=> {window.geoCalls=0;window.geoClears=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:()=>{window.geoCalls++;return 42},clearWatch:()=>window.geoClears++}})}''')
   await page.goto('http://localhost:8080/chauffeur/mission',wait_until='domcontentloaded')
   # Navigation reload resets fake browser objects: scoped replacement before lazy component is mounted.
   await page.evaluate('''()=> {window.geoCalls=0;window.geoClears=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:()=>{window.geoCalls++;return 42},clearWatch:()=>window.geoClears++}})}''')
   btn=page.get_by_role('button',name='Autoriser et reprendre le suivi');await btn.wait_for()
   assert await page.evaluate('window.geoCalls')==0
   await page.screenshot(path=str(ROOT/f'chauffeur-{width}.png'))
   overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await btn.click();assert await page.evaluate('window.geoCalls')==1
   await page.get_by_role('button',name='Arrêter le suivi',exact=True).click()
   assert await page.evaluate('window.geoClears')>=1
   await page.get_by_role('button',name='Terminer la mission').click()
   await page.get_by_text('Clôture TEST refusée',exact=True).wait_for()
   assert await page.get_by_role('button',name='Terminer la mission').count()==1
   await page.screenshot(path=str(ROOT/f'chauffeur-refus-{width}.png'))
   results.append({'width':width,'overflow':overflow,'errors':errors,'calls':calls,'real_position':False,'mission_preserved':True})
   await ctx.close()
  print(json.dumps(results,ensure_ascii=False,indent=2));await browser.close()
asyncio.run(main())
