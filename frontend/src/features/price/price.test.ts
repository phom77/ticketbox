import { describe, expect, it } from 'vitest';
import { formatPrice, lowestPrice } from './price';

describe('price helpers', () => {
  it('formats the all-in amount in VND without decimals', () => {
    expect(formatPrice(1_250_000)).toMatch(/1\D?250\D?000/);
    expect(formatPrice(1_250_000)).toMatch(/₫|VND/);
  });

  it('finds the lowest valid price', () => {
    expect(lowestPrice([900_000, 450_000, null, undefined, Number.NaN])).toBe(450_000);
    expect(lowestPrice([0, 100])).toBe(0);
    expect(lowestPrice([])).toBeNull();
    expect(lowestPrice([null, -1])).toBeNull();
  });
});
