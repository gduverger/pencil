import { describe, expect, it } from 'vitest';
import { usage } from '../src/cli';

describe('pencil cli', () => {
  it('prints usage', () => {
    expect(usage()).toContain('pencil run');
  });
});
