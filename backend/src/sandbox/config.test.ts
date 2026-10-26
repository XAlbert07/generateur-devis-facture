import { afterEach, describe, expect, it } from 'vitest';
import { sandboxConfig } from './config.js';

const keys = ['SANDBOX_ENABLED', 'SANDBOX_TTL_HOURS', 'SANDBOX_MAX_ACTIVE', 'SANDBOX_MAX_PER_IP_PER_HOUR', 'SANDBOX_MAX_CONCURRENT', 'SANDBOX_POOL_SIZE'];

describe('configuration des espaces d’essai', () => {
  afterEach(() => { for (const key of keys) delete process.env[key]; });

  it('est désactivée par défaut, avec des plafonds prudents', () => {
    expect(sandboxConfig()).toEqual({ enabled: false, ttlHours: 12, maxActive: 30, maxPerIpPerHour: 3, maxConcurrent: 2, poolSize: 2 });
  });

  it('lit les valeurs de l’environnement', () => {
    process.env.SANDBOX_ENABLED = 'TRUE';
    process.env.SANDBOX_TTL_HOURS = '24';
    process.env.SANDBOX_MAX_ACTIVE = '10';
    process.env.SANDBOX_MAX_PER_IP_PER_HOUR = '5';
    process.env.SANDBOX_MAX_CONCURRENT = '1';
    process.env.SANDBOX_POOL_SIZE = '0';
    expect(sandboxConfig()).toEqual({ enabled: true, ttlHours: 24, maxActive: 10, maxPerIpPerHour: 5, maxConcurrent: 1, poolSize: 0 });
  });

  it('refuse une valeur ambiguë plutôt que de l’ignorer', () => {
    process.env.SANDBOX_ENABLED = 'oui';
    expect(() => sandboxConfig()).toThrow('SANDBOX_ENABLED doit valoir true ou false.');
  });

  it.each([['SANDBOX_TTL_HOURS', '0'], ['SANDBOX_TTL_HOURS', '500'], ['SANDBOX_MAX_ACTIVE', 'beaucoup'], ['SANDBOX_MAX_PER_IP_PER_HOUR', '1.5'], ['SANDBOX_POOL_SIZE', '9']])(
    'refuse %s=%s',
    (name, value) => {
      process.env[name] = value;
      expect(() => sandboxConfig()).toThrow(name);
    },
  );
});
