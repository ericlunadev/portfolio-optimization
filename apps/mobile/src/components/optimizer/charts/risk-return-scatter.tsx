import { Circle, G, Line, Polygon, Svg, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { OptimizationResult } from '@/lib/api/optimization';
import { formatPercent } from '@/lib/format';
import { linearScale, niceTicks, padDomain } from '@/components/optimizer/charts/chart-scales';

type RiskReturnScatterProps = {
  result: OptimizationResult;
  width: number;
};

const HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 30;
const HAIRLINE = 0.5;

/**
 * Risk/return scatter: each asset plotted by volatility (x) vs expected return
 * (y), with the optimal portfolio marked as a diamond. Uses only the optimize
 * response, so it adds no API call. The optimal point typically sits up and to
 * the left of the individual assets (diversification lowers risk).
 */
export function RiskReturnScatter({ result, width }: RiskReturnScatterProps) {
  const theme = useTheme();

  const assets = result.weights;
  const vols = [...assets.map((a) => a.volatility), result.volatility];
  const rets = [...assets.map((a) => a.exp_ret), result.expected_return];

  const [xMin, xMax] = padDomain(Math.min(...vols), Math.max(...vols));
  const [yMin, yMax] = padDomain(Math.min(...rets), Math.max(...rets));

  const plotLeft = PAD_LEFT;
  const plotRight = width - PAD_RIGHT;
  const plotTop = PAD_TOP;
  const plotBottom = HEIGHT - PAD_BOTTOM;

  const x = linearScale(xMin, xMax, plotLeft, plotRight);
  const y = linearScale(yMin, yMax, plotBottom, plotTop); // inverted: higher return = higher up

  const xTicks = niceTicks(xMin, xMax, 4);
  const yTicks = niceTicks(yMin, yMax, 4);

  const optimalX = x(result.volatility);
  const optimalY = y(result.expected_return);
  const d = 6; // optimal diamond half-size

  return (
    <Svg width={width} height={HEIGHT}>
      {/* Y gridlines + labels */}
      {yTicks.map((t) => {
        const ty = y(t);
        if (ty < plotTop - 1 || ty > plotBottom + 1) return null;
        return (
          <G key={`y-${t}`}>
            <Line x1={plotLeft} y1={ty} x2={plotRight} y2={ty} stroke={theme.border} strokeWidth={HAIRLINE} />
            <SvgText x={plotLeft - 6} y={ty + 3} fill={theme.textSecondary} fontSize={10} textAnchor="end">
              {formatPercent(t, 0)}
            </SvgText>
          </G>
        );
      })}

      {/* X tick labels */}
      {xTicks.map((t) => {
        const tx = x(t);
        if (tx < plotLeft - 1 || tx > plotRight + 1) return null;
        return (
          <SvgText
            key={`x-${t}`}
            x={tx}
            y={HEIGHT - 10}
            fill={theme.textSecondary}
            fontSize={10}
            textAnchor="middle">
            {formatPercent(t, 0)}
          </SvgText>
        );
      })}

      {/* Asset points */}
      {assets.map((a) => (
        <Circle
          key={a.fund_id}
          cx={x(a.volatility)}
          cy={y(a.exp_ret)}
          r={4}
          fill={theme.tint}
          fillOpacity={0.7}
        />
      ))}

      {/* Optimal portfolio: diamond */}
      <Polygon
        points={`${optimalX},${optimalY - d} ${optimalX + d},${optimalY} ${optimalX},${optimalY + d} ${optimalX - d},${optimalY}`}
        fill={theme.positive}
        stroke={theme.background}
        strokeWidth={1.5}
      />
    </Svg>
  );
}
