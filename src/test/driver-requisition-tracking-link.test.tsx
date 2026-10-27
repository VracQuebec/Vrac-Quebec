import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RequisitionPanel from '@/components/entrepreneur-app/RequisitionPanel';
import type { Requisition } from '@/lib/ops/requisitions';
vi.mock('@/lib/fleet/tenant',()=>({getActiveCompanyId:()=>null,fetchCompanies:async()=>[],setActiveCompanyId:()=>{}}));
afterEach(cleanup);
const row=(state:Requisition['state']):Requisition=>({
 id:'request-test',request_number:'DT-TEST',company_id:'company-test',version:2,state,
 values:{company_id:'company-test',request_id:'request-test',driver_id:'driver-test',truck_id:'truck-test',destination_id:'destination-test',material:'terre',quantity:20,unit:'tonnes',starts_at:'2026-10-28T13:00:00Z',instructions:'FICTIF'},
 destination:'Destination TEST',actions:[],history:[],
});
it('accepted driver requisition links to its exact existing mission route',async()=>{
 render(<MemoryRouter><RequisitionPanel company="company-test" driver read={async()=>[row('accepted')]} /></MemoryRouter>);
 expect(await screen.findByRole('link',{name:'Suivi de cette mission'})).toHaveAttribute('href','/chauffeur/mission?requisition=request-test');
});
it('unaccepted requisition cannot expose the tracking command',async()=>{
 render(<MemoryRouter><RequisitionPanel company="company-test" driver read={async()=>[row('transmitted')]} /></MemoryRouter>);
 await screen.findByText('DT-TEST');
 expect(screen.queryByRole('link',{name:'Suivi de cette mission'})).toBeNull();
});