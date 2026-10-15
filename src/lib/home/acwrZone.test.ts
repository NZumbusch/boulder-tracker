import { describe, it, expect } from 'vitest';
import { acwrZone, acwrZoneId } from './acwrZone';

const edges = { sweetMin: 0.8, caution: 1.3, highRisk: 1.5 };

describe('acwrZone', () => {
  it('puts an edge in the lower zone', () => {
    expect(['0.79', '0.8', '1.3', '1.31', '1.5', '1.51'].map((r) => acwrZoneId(Number(r), edges))).toEqual(['low', 'sweet', 'sweet', 'caution', 'caution', 'risk']);
  });
  it('names every zone and keeps a low ratio out of the warning colours', () => {
    expect(acwrZone(0.48, edges)).toMatchObject({ zone: 'low', label: 'Low', status: 'good' });
    expect(acwrZone(1, edges)).toMatchObject({ label: 'Sweet spot', status: 'good' });
    expect(acwrZone(1.4, edges)).toMatchObject({ label: 'Caution', status: 'caution' });
    expect(acwrZone(2, edges)).toMatchObject({ label: 'High risk', status: 'risk' });
  });
  it('has no zone without a counted ratio', () => {
    expect(acwrZone(undefined, edges)).toBeUndefined();
    expect(acwrZone(NaN, edges)).toBeUndefined();
  });
  it("follows the athlete's own edges", () => {
    expect(acwrZone(1.2, { sweetMin: 0.8, caution: 1.1, highRisk: 1.4 })?.zone).toBe('caution');
  });
});
