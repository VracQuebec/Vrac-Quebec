import {describe,it,expect} from 'vitest';
import {recordedConfirmation} from '../../prepared/fonctions-guard-claim-id/client-confirmation';
describe('inactive remblai and vrac confirmation contract',()=>{
  for(const reference of [{submission_id:'request-A'},{request_number:'VRAC-1'}]) {
    it(`null mail never becomes acceptance for ${Object.keys(reference)[0]}`,()=>{
      expect(recordedConfirmation({...reference,email_status:'unknown',email_sent:null}).email_sent).toBeNull();
      expect(recordedConfirmation(reference).state).toBe('unknown');
    });
    it(`voluntary non-delivery survives retry for ${Object.keys(reference)[0]}`,()=>{
      expect(recordedConfirmation({...reference,email_status:'not_sent',email_sent:false}).state).toBe('not_sent');
    });
  }
  it('refuses any confirmation without evidence of a recorded request',()=>{
    for(const value of [null,{}, {ok:true,email_sent:true}, {submission_id:''}])expect(()=>recordedConfirmation(value)).toThrow();
  });
});