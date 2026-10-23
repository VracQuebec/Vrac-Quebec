import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/reprise-maitre'); ROOT.mkdir(exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  results=[]
  for width in (360,768,1280):
   ctx=await browser.new_context(viewport={'width':width,'height':1800})
   page=await ctx.new_page(); errors=[]; writes=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    u=r.request.url
    if 'localhost:8080' in u: await r.continue_(); return
    if 'mkt-request-submit' in u:
     writes.append(json.loads(r.request.post_data or '{}'))
     await r.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'request_number':'TEST-LOCAL-001'})); return
    if '/auth/v1/' in u:
     await r.fulfill(status=200,content_type='application/json',body='{"user":null}');return
    if '/rest/v1/' in u:
     await r.fulfill(status=200,content_type='application/json',body='[]');return
    await r.abort()
   await page.route('**/*',route)
   await page.goto('http://localhost:8080',wait_until='domcontentloaded')
   card=page.get_by_role('link',name='Des soumissions pour vos travaux et vos besoins de chantier',exact=False)
   await card.first.wait_for(); await card.first.scroll_into_view_if_needed()
   await card.first.screenshot(path=str(ROOT/f'accueil-{width}.png'))
   overflow=await page.evaluate('document.documentElement.scrollWidth > innerWidth')
   await card.first.click()
   await page.get_by_role('button',name='Excavation Fondation').click()
   await page.get_by_label('Ville',exact=True).fill('Ville fictive')
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.get_by_label('Décrivez votre besoin').fill('Démonstration locale, aucune demande réelle.')
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.get_by_label('Votre nom',exact=True).fill('Client fictif')
   await page.get_by_label('Courriel',exact=True).fill('client@test.invalid')
   await page.get_by_role('button',name='Continuer',exact=False).click()
   await page.screenshot(path=str(ROOT/f'revision-{width}.png'))
   await page.get_by_role('button',name='Envoyer ma demande',exact=True).click()
   await page.get_by_text('Numéro de votre demande : TEST-LOCAL-001',exact=True).wait_for()
   assert len(writes)==1 and writes[0]['category_slug']=='excavation-et-terrassement'
   await page.screenshot(path=str(ROOT/f'confirmation-{width}.png'))
   results.append({'width':width,'overflow':overflow,'errors':errors,'request_count_mock':len(writes),'final_url':page.url,'real_writes':0})
   await ctx.close()
  print(json.dumps(results,ensure_ascii=False,indent=2)); await browser.close()
asyncio.run(main())
