import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/exec03')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  c=await b.new_context(viewport={'width':1280,'height':1800})
  page=await c.new_page(); errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def guard(route):
   url=route.request.url
   if not url.startswith(('http://localhost:8080','http://localhost:55440')):
    external.append(url.split('?')[0]);await route.abort()
   else:await route.continue_()
  await page.route('**/*',guard)
  await page.goto('http://localhost:8080/entrepreneur/carte?exec03=local')
  await page.evaluate('''async()=>{await fetch('http://localhost:55440/search/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:1})});}''')
  await page.reload();await page.get_by_role('heading',name='Secteur de recherche',exact=True).wait_for()
  await page.get_by_role('button',name='Villes / régions',exact=True).click()
  for city in ['Québec','Lévis']:
   await page.get_by_role('textbox',name='Ville à ajouter').fill(city);await page.get_by_role('button',name='Ajouter',exact=True).click()
  await page.get_by_role('button',name='Mémoriser mon secteur').click()
  await page.get_by_role('status').filter(has_text='Préférences mémorisées').wait_for()
  await page.screenshot(path=str(OUT/'sectors-desktop.png'))
  print('multi-city saved:',await page.get_by_role('heading',name='Dompes',exact=True).count())
  await page.evaluate('''async()=>{await fetch('http://localhost:55440/search/logout',{method:'POST',credentials:'include'});await fetch('http://localhost:55440/search/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:1})});}''')
  await page.reload();await page.get_by_role('button',name='Retirer Québec',exact=True).wait_for();await page.get_by_role('button',name='Retirer Lévis',exact=True).wait_for();print('preferences after reconnection: two cities restored')
  await page.get_by_role('button',name='Rayon géographique',exact=True).click()
  await page.locator('#search-chantier').select_option('test-quebec');await page.locator('#sector-radius').fill('2');await page.get_by_role('button',name='Utiliser l’adresse du chantier').click()
  await page.screenshot(path=str(OUT/'radius-desktop.png'))
  await page.locator('#search-chantier').select_option('test-levis');print('origin changed:',await page.locator('#sector-address').input_value())
  await page.set_viewport_size({'width':393,'height':852});await page.screenshot(path=str(OUT/'sectors-mobile.png'))
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.goto('http://localhost:8080/entrepreneur/comparateur?exec03=local');await page.get_by_role('heading',name='Économies de transport estimées').wait_for()
  await page.get_by_role('combobox',name='Changer le chantier de comparaison').select_option('test-quebec')
  
  if await page.get_by_role('button',name='Terre',exact=True).get_attribute('class') and 'font-semibold' not in await page.get_by_role('button',name='Terre',exact=True).get_attribute('class'):await page.get_by_role('button',name='Terre',exact=True).click();
  if 'font-semibold' not in await page.get_by_role('button',name='Camion 10 roues',exact=True).get_attribute('class'):await page.get_by_role('button',name='Camion 10 roues',exact=True).click()
  await page.locator('#cmp-qty').fill('12');await page.get_by_role('button',name='Comparer les sites',exact=True).click()
  await page.get_by_text('Distance à confirmer',exact=True).first.wait_for();print('comparison state:',(await page.locator('body').inner_text())[-5000:]);await page.screenshot(path=str(OUT/'comparison-state.png'))
  await page.locator('#savings-trips').fill('12');await page.locator('#savings-rate').fill('150');await page.locator('#savings-rate-source').fill('Taux fictif complet TEST')
  for side,minutes in [('baseline','30'),('alternative','20')]:
   for field,val in [('outboundMinutes',minutes),('returnMinutes',minutes),('waitMinutes','0'),('receptionTotal','0'),('otherTotal','0')]:await page.locator(f'#savings-{side}-{field}').fill(val)
  await page.get_by_text('Calcul vérifié sur le serveur isolé.',exact=False).wait_for()
  panel=page.get_by_role('region',name='Simulation des économies');await panel.locator('dl').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/'savings-mobile.png'))
  print('savings:',(await panel.inner_text())[-700:])
  async with page.expect_download() as dl:await page.get_by_role('button',name='Exporter le récapitulatif PDF').click()
  await (await dl.value).save_as(str(OUT/'savings.pdf'))
  await page.set_viewport_size({'width':1280,'height':1800});await panel.scroll_into_view_if_needed();await page.screenshot(path=str(OUT/'savings-desktop.png'))
  print('overflow:',await page.evaluate('document.documentElement.scrollWidth>innerWidth'));print('page errors:',errors);print('external attempts:',external)
  await b.close()
asyncio.run(main())
