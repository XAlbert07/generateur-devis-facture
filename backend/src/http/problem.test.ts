import { describe, expect, it, vi } from 'vitest';
import { problem } from './problem.js';

describe('problem RFC 7807', () => {
  it('émet application/problem+json avec type, title et status', () => {
    const json = vi.fn();
    const type = vi.fn().mockReturnValue({ json });
    const status = vi.fn().mockReturnValue({ type });
    const response = { status } as never;
    problem(response, 422, 'Données invalides', { email: ['requis'] });
    expect(status).toHaveBeenCalledWith(422);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(json).toHaveBeenCalledWith({
      type: 'https://httpstatuses.com/422',
      title: 'Données invalides',
      status: 422,
      errors: { email: ['requis'] },
    });
  });

  it('omet errors si absent', () => {
    const json = vi.fn();
    const type = vi.fn().mockReturnValue({ json });
    const status = vi.fn().mockReturnValue({ type });
    problem({ status } as never, 404, 'Introuvable');
    expect(json).toHaveBeenCalledWith({
      type: 'https://httpstatuses.com/404',
      title: 'Introuvable',
      status: 404,
    });
  });
});
