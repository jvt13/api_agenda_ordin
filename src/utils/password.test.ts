import { describe, it, expect } from 'vitest';
import { sanitizeString } from '../utils/password.js';

describe('sanitizeString', () => {
  it('remove caracteres perigosos', () => {
    expect(sanitizeString('  hello<script>  ')).toBe('helloscript');
  });
});
