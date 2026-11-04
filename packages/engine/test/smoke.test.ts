import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('@pencil/engine', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@pencil/engine');
  });
});
