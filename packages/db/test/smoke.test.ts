import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('@pencil/db', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@pencil/db');
  });
});
