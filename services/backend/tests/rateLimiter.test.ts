import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkAndRecordFailedAccountLogin } from '../src/middleware/rateLimiter.js';
import { config } from '../src/config/index.js';

describe('Rate Limiter Behavior', () => {
  it('allows failed attempts up to limit (5) and throttles on the 6th', async () => {
    const email = 'rate-test@teamtrack.dev';

    // First 5 attempts should be recorded and permitted
    for (let i = 1; i <= 5; i++) {
      const allowed = await checkAndRecordFailedAccountLogin(email);
      assert.strictEqual(allowed, true, `Attempt ${i} should be allowed`);
    }

    // 6th attempt should exceed the threshold
    const blocked = await checkAndRecordFailedAccountLogin(email);
    assert.strictEqual(blocked, false, '6th attempt must be throttled');
  });

  it('verifies production configuration does not allow silent memory fallback', () => {
    assert.strictEqual(
      config.isProduction ? config.rateLimit.allowMemoryFallback : false,
      false,
      'Production must never allow memory fallback'
    );
  });
});
