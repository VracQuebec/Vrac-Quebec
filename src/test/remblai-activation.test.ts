import { describe, it, expect } from 'vitest';
import { RECEPTION_CLOUD_ENABLED } from '../lib/remblai/activation';

describe('EXEC-01 activation boundary', () => {
  it('keeps EXEC-02 hosted reservations disabled independently of owner follow-up', () => {
    expect(RECEPTION_CLOUD_ENABLED).toBe(false);
  });
});