import { describe, expect, it } from 'vitest';
import { RENDER_SERVICE_NAME } from '../src/server';

describe('render service', () => {
  it('has a name', () => {
    expect(RENDER_SERVICE_NAME).toBe('@pencil/render');
  });
});
