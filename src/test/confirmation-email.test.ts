import {describe,it,expect} from 'vitest';
import {renderConfirmationEmail} from '../../prepared/exec01b/confirmation-email';
import {confirmationMessage} from '../../prepared/exec01b/endpoint';
describe('prepared confirmation presentation preserves private envelope',()=>{
 const link='https://vracquebec.ca/portail/remblai#requestId=dossier-fictif&linkId=lien-fictif&secret=secret-fictif';
 it('preserves the supplied personal URL and recipient without creating another link',()=>{
  const message=confirmationMessage('client@test.invalid','Camille',link);
  expect(message.to).toBe('client@test.invalid');expect(message.purpose).toBe('service');expect(message.tracking).toBe(false);
  expect(message.html).toContain(link.replace(/&/g,'&amp;'));expect(message.text).toContain(link);
  expect((message.html.match(/secret-fictif/g)??[]).length).toBe(1);
 });
 it('does not render missing, null or raw template variables as personal data',()=>{
  for(const name of [undefined,null,'null','undefined','{{nom_client}}']) {
   const result=renderConfirmationEmail(name,null);expect(result.text.startsWith('Bonjour,')).toBe(true);
   expect(result.html).not.toContain('href="undefined"');expect(result.text).not.toContain('{{nom_client}}');
  }
 });
 it('escapes names and preserves a long legitimate name without truncation',()=>{
  const name='Marie-Alexandrine <script>alert(1)</script> Tremblay';const result=renderConfirmationEmail(name,link);
  expect(result.html).toContain('&lt;script&gt;');expect(result.html).not.toContain('<script>');expect(result.text).toContain(name);
 });
 it('never invents an unsubscribe token or link; preserves an explicitly supplied URL',()=>{
  const unsubscribe='https://capture.test.invalid/unsubscribe?token=fictif';
  expect(renderConfirmationEmail('Camille',link).html).not.toContain('token=');
  expect(renderConfirmationEmail('Camille',link,unsubscribe).html).toContain(unsubscribe);
 });
 it('omits unsafe and missing action URLs instead of creating another journey',()=>{
  for(const url of [null,undefined,'{{url}}','javascript:alert(1)','https://user:password@test.invalid'])expect(renderConfirmationEmail('Camille',url).html).not.toContain('Suivre ou modifier ma demande</a>');
 });
});