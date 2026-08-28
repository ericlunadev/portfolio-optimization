import { describe, expect, it } from 'vitest';

import {
  parsePercent,
  toWeightBounds,
  validateAssetLimits,
  type AssetLimits,
} from './asset-limits';

const TICKERS = ['AAPL', 'MSFT'];

const CONTEXT = {
  enabled: true,
  targetPercent: 100,
  enforceFullInvestment: true,
  fallbackMaxPercent: 100,
};

function limits(entries: AssetLimits): AssetLimits {
  return entries;
}

describe('parsePercent', () => {
  it('reads a number', () => {
    expect(parsePercent('12.5')).toBe(12.5);
  });

  it('treats blank, whitespace and missing as no limit', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('   ')).toBeNull();
    expect(parsePercent(undefined)).toBeNull();
  });

  it('treats unparseable text as no limit', () => {
    expect(parsePercent('abc')).toBeNull();
  });
});

describe('toWeightBounds', () => {
  it('sends nothing when the toggle is off', () => {
    expect(
      toWeightBounds(TICKERS, limits({ AAPL: { min: '10', max: '40' } }), false),
    ).toBeUndefined();
  });

  it('sends nothing when no ticker sets a limit', () => {
    expect(toWeightBounds(TICKERS, limits({}), true)).toBeUndefined();
  });

  it('converts percentages to decimals aligned with the ticker order', () => {
    expect(
      toWeightBounds(
        TICKERS,
        limits({ AAPL: { min: '10', max: '40' }, MSFT: { min: '', max: '25' } }),
        true,
      ),
    ).toEqual({
      w_min_per_asset: [0.1, null],
      w_max_per_asset: [0.4, 0.25],
    });
  });

  it('leaves a ticker with no entry as null', () => {
    expect(toWeightBounds(TICKERS, limits({ MSFT: { min: '5', max: '' } }), true)).toEqual({
      w_min_per_asset: [null, 0.05],
      w_max_per_asset: [null, null],
    });
  });
});

describe('validateAssetLimits', () => {
  it('accepts limits that bracket the target', () => {
    expect(
      validateAssetLimits(
        TICKERS,
        limits({ AAPL: { min: '10', max: '60' }, MSFT: { min: '20', max: '70' } }),
        CONTEXT,
      ),
    ).toBeNull();
  });

  it('stays quiet when the toggle is off', () => {
    expect(
      validateAssetLimits(TICKERS, limits({ AAPL: { min: '90', max: '' } }), {
        ...CONTEXT,
        enabled: false,
      }),
    ).toBeNull();
  });

  it('rejects a minimum above its own maximum', () => {
    expect(
      validateAssetLimits(TICKERS, limits({ AAPL: { min: '50', max: '20' } }), CONTEXT),
    ).toEqual({ kind: 'minAboveMax', ticker: 'AAPL' });
  });

  it('rejects a limit outside 0-100', () => {
    expect(
      validateAssetLimits(TICKERS, limits({ MSFT: { min: '', max: '140' } }), CONTEXT),
    ).toEqual({ kind: 'outOfRange', ticker: 'MSFT' });
  });

  it('rejects minimums that add up past the capital', () => {
    expect(
      validateAssetLimits(
        TICKERS,
        limits({ AAPL: { min: '60', max: '' }, MSFT: { min: '60', max: '' } }),
        CONTEXT,
      ),
    ).toEqual({ kind: 'minTotalTooHigh', total: '120.0', target: '100' });
  });

  it('rejects maximums that fall short under full investment', () => {
    expect(
      validateAssetLimits(
        TICKERS,
        limits({ AAPL: { min: '', max: '20' }, MSFT: { min: '', max: '30' } }),
        CONTEXT,
      ),
    ).toEqual({ kind: 'maxTotalTooLow', total: '50.0', target: '100' });
  });

  it('allows short maximums when the portfolio may hold cash', () => {
    expect(
      validateAssetLimits(
        TICKERS,
        limits({ AAPL: { min: '', max: '20' }, MSFT: { min: '', max: '30' } }),
        { ...CONTEXT, enforceFullInvestment: false },
      ),
    ).toBeNull();
  });

  it('counts the portfolio-wide cap for tickers with no maximum of their own', () => {
    expect(
      validateAssetLimits(TICKERS, limits({ AAPL: { min: '10', max: '' } }), {
        ...CONTEXT,
        fallbackMaxPercent: 40,
      }),
    ).toEqual({ kind: 'maxTotalTooLow', total: '80.0', target: '100' });
  });

  it('measures against the leveraged total', () => {
    expect(
      validateAssetLimits(
        TICKERS,
        limits({ AAPL: { min: '70', max: '' }, MSFT: { min: '70', max: '' } }),
        { ...CONTEXT, targetPercent: 150 },
      ),
    ).toBeNull();
  });

  it('ignores limits left over from a removed ticker', () => {
    expect(
      validateAssetLimits(['AAPL'], limits({ AAPL: { min: '10', max: '' }, GLD: { min: '99', max: '' } }), CONTEXT),
    ).toBeNull();
  });
});
