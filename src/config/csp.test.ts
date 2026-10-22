import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './csp';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  const production = directives(
    buildContentSecurityPolicy({ nonce: 'abc', apiOrigin: 'https://api.example.com', isDev: false }),
  );

  it('allows scripts only via the nonce (plus the Telegram SDK host as CSP2 fallback)', () => {
    expect(production.get('script-src')).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'", 'https://telegram.org']);
  });

  it('limits network access to our origin and the backend', () => {
    expect(production.get('connect-src')).toEqual(["'self'", 'https://api.example.com']);
  });

  it('keeps inline styles (injected by telegram-web-app.js) and tg: frames working', () => {
    expect(production.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(production.get('frame-src')).toEqual(["'self'", 'tg:']);
  });

  it('does not forbid framing (Telegram Web embeds Mini Apps in an iframe)', () => {
    expect(production.has('frame-ancestors')).toBe(false);
  });

  it('relaxes only what Next.js dev tooling needs in development', () => {
    const dev = directives(buildContentSecurityPolicy({ nonce: 'n', apiOrigin: null, isDev: true }));
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toEqual(["'self'"]);
    expect(production.get('script-src')).not.toContain("'unsafe-eval'");
  });
});
