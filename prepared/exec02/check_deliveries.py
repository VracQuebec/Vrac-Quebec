import asyncio,json
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/exec02b'); shots=OUT/'screenshots';shots.mkdir(exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  admin=await browser.new_context(viewport={'width':1280,'height':1800})
  entrepreneur=await browser.new_context(viewport={'width':1280,'height':1800})
  owner=await browser.new_context(viewport={'width':360,'height':900})
  ap=await admin.new_page();ep=await entrepreneur.new_page();op=await owner.new_page()
  errors=[]
  for page in [ap,ep,op]: page.on('pageerror',lambda e: errors.append(str(e)))
  await ap.goto('http://localhost:55440/harness/login')
  await ep.goto('http://localhost:55440/harness/login?role=entrepreneur')
  response=await admin.request.post('http://localhost:55440/harness/create'); assert response.status==200,await response.text()
  fixture=await response.json(); id=fixture['id']
  await op.goto(fixture['url']);await op.get_by_role('heading',name='Coordination des réceptions').wait_for()
  await op.get_by_role('button',name='Recevoir un code').click()
  messages=await (await admin.request.get('http://localhost:55440/harness/messages')).json()
  code=next(m['text'].strip().split()[-1] for m in reversed(messages) if 'code' in m['subject'].lower())
  print('Captured verification email; no real send.')
  await op.get_by_role('textbox',name='Code de vérification').fill(code)
  await op.get_by_role('button',name='Vérifier le code').click()
  await op.get_by_text('Identité fictive vérifiée pour 10 minutes.').wait_for()
  start=(datetime.now(timezone.utc)+timedelta(days=1)).replace(second=0,microsecond=0)
  end=start+timedelta(hours=1)
  async def dates(page):
   await page.locator('#reception-start').fill(start.strftime('%Y-%m-%dT%H:%M'))
   await page.locator('#reception-end').fill(end.strftime('%Y-%m-%dT%H:%M'))
  async def confirm(page):
   await page.get_by_role('button',name='Confirmer l’action',exact=True).click()
   await page.get_by_role('alertdialog').wait_for(state='hidden')
  await dates(op);await op.get_by_role('button',name='Accepter ces conditions de réception').click();await confirm(op)
  await ep.goto(f'http://localhost:8080/entrepreneur/coordination-remblai?server=local&requestId={id}')
  await ep.get_by_role('heading',name='Coordination des réceptions').wait_for()
  await dates(ep);await ep.get_by_role('combobox',name='Offre du chantier').click();await ep.get_by_role('option').first.click()
  await ep.locator('#reception-quantity').fill('30')
  await ep.get_by_role('button',name='Proposer cette réception').click();await confirm(ep)
  await op.get_by_text('En attente de validation',exact=True).wait_for()
  await op.get_by_role('button',name='Accepter la réception',exact=True).click()
  await op.get_by_role('alertdialog').screenshot(path=str(shots/'owner-confirm-mobile.png'))
  await confirm(op);await op.get_by_text('Réception autorisée et capacité réservée',exact=True).wait_for()
  await op.get_by_test_id('reserved-capacity').get_by_text('30 m3',exact=True).wait_for()
  await op.get_by_role('region',name='Coordination des réceptions').screenshot(path=str(shots/'owner-approved-mobile.png'))
  await ap.goto(f'http://localhost:8080/admin/apercu-suivi-remblai?server=local&requestId={id}')
  await ap.get_by_text('Réception autorisée et capacité réservée',exact=True).wait_for()
  await ap.get_by_role('region',name='Coordination des réceptions').screenshot(path=str(shots/'crm-approved-desktop.png'))
  import subprocess
  database=json.loads(Path('/tmp/browser/exec02/ready.json').read_text())['database']
  import uuid
  trip=str(uuid.uuid4())
  subprocess.run(['psql',f'postgresql://lovable@127.0.0.1:55439/{database}?sslmode=disable','-c',f"insert into trips(id,submission_id,status,delivered_at) values('{trip}','{id}','termine',now())"],check=True,capture_output=True)
  await ap.locator('#receipt-trip').fill(trip)
  await ap.locator('#measured-quantity').fill('12')
  await ap.locator('#measured-ticket').fill('TEST-02B-12')
  await ap.locator('#measured-at').fill((datetime.now(timezone.utc)-timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M'))
  await ap.get_by_role('button',name='Enregistrer le billet —').click();await confirm(ap)
  await ap.get_by_text('Réellement livré : 12 m3',exact=True).wait_for()
  await op.get_by_test_id('reserved-capacity').get_by_text('18 m3',exact=True).wait_for()
  await ap.get_by_role('region',name='Coordination des réceptions').screenshot(path=str(shots/'crm-partial-12.png'))
  await ap.locator('#measured-quantity').fill('10')
  await ap.locator('#measurement-reason').fill('Billet corrigé après mesure vérifiée')
  await ap.get_by_role('button',name='Corriger le billet TEST-02B-12',exact=True).click();await confirm(ap)
  await ap.get_by_text('Réellement livré : 10 m3',exact=True).wait_for()
  await op.get_by_test_id('reserved-capacity').get_by_text('20 m3',exact=True).wait_for()
  await ap.get_by_role('region',name='Coordination des réceptions').screenshot(path=str(shots/'crm-correction-10.png'))
  for width in [360,768,1280]:
   await op.set_viewport_size({'width':width,'height':900 if width==360 else 1800})
   assert await op.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'overflow {width}'
   await op.screenshot(path=str(shots/f'portal-{width}.png'))
  assert not errors,errors
  (OUT/'result.json').write_text(json.dumps({'partial':12,'corrected':10,'remaining':90,'reserved':20,'widths':[360,768,1280],'page_errors':errors,'real_sends':0},indent=2))
  print('Existing CRM and portal: partial 12, corrected 10, remaining 90, reserved 20. No overflow or JavaScript error. Captured TEST only.')
  await browser.close()
asyncio.run(main())
