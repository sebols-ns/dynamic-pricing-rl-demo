import { Typography } from '@northslopetech/altitude-ui';
import type { ShapleyValue } from '../types/rl';

interface WaterfallChartProps {
  shapValues: ShapleyValue[];
  basePrice: number;
  finalPrice: number;
  className?: string;
}

export function WaterfallChart({ shapValues, basePrice, finalPrice, className }: WaterfallChartProps) {
  const sorted = [...shapValues].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Calculate bounds for scaling
  const allPrices: number[] = [basePrice];
  let running = basePrice;
  for (const sv of sorted) {
    running += sv.value;
    allPrices.push(running);
  }
  allPrices.push(finalPrice);
  const minPrice = Math.min(...allPrices) - 1;
  const maxPrice = Math.max(...allPrices) + 1;

  const chartWidth = 500;
  const chartHeight = (sorted.length + 2) * 48 + 20;
  const barAreaLeft = 180;
  const barAreaRight = chartWidth - 20;
  const barAreaWidth = barAreaRight - barAreaLeft;
  const barHeight = 28;

  function xScale(price: number): number {
    return barAreaLeft + ((price - minPrice) / (maxPrice - minPrice)) * barAreaWidth;
  }

  let cumulative = basePrice;

  return (
    <div className={className}>
      <Typography variant="label-md-bold" className="mb-2">SHAP Feature Contributions</Typography>
      <svg width={chartWidth} height={chartHeight} className="overflow-visible">
        {/* Base price bar */}
        <text x={barAreaLeft - 8} y={28} textAnchor="end" fontSize={12} fill="var(--color-dark)" dominantBaseline="middle">
          Base Price
        </text>
        <rect
          x={xScale(Math.min(basePrice, 0))}
          y={14}
          width={Math.max(2, xScale(basePrice) - xScale(Math.min(basePrice, 0)))}
          height={barHeight}
          rx={4}
          fill="var(--color-interactive)"
        />
        <text x={xScale(basePrice) + 6} y={28} fontSize={11} fill="var(--color-dark)" dominantBaseline="middle">
          ${basePrice.toFixed(2)}
        </text>

        {/* Feature contribution bars */}
        {sorted.map((sv, i) => {
          const y = (i + 1) * 48 + 14;
          const start = cumulative;
          const end = cumulative + sv.value;
          cumulative = end;

          const barLeft = xScale(Math.min(start, end));
          const barRight = xScale(Math.max(start, end));
          const barW = Math.max(2, barRight - barLeft);
          const isPositive = sv.value >= 0;

          return (
            <g key={sv.feature}>
              {/* Connector line from previous bar */}
              <line
                x1={xScale(start)}
                y1={y - 20}
                x2={xScale(start)}
                y2={y + barHeight / 2}
                stroke="var(--color-gray)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <text x={barAreaLeft - 8} y={y + barHeight / 2} textAnchor="end" fontSize={11} fill="var(--color-dark)" dominantBaseline="middle">
                {sv.label}
              </text>
              <rect
                x={barLeft}
                y={y}
                width={barW}
                height={barHeight}
                rx={4}
                fill={isPositive ? 'var(--color-success)' : 'var(--color-error)'}
                opacity={0.85}
              />
              <text
                x={isPositive ? barRight + 6 : barLeft - 6}
                y={y + barHeight / 2}
                textAnchor={isPositive ? 'start' : 'end'}
                fontSize={11}
                fill={isPositive ? 'var(--color-success)' : 'var(--color-error)'}
                fontWeight={600}
                dominantBaseline="middle"
              >
                {isPositive ? '+' : ''}{sv.value.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Final price bar */}
        {(() => {
          const y = (sorted.length + 1) * 48 + 14;
          return (
            <g>
              <line
                x1={xScale(cumulative)}
                y1={y - 20}
                x2={xScale(cumulative)}
                y2={y + barHeight / 2}
                stroke="var(--color-gray)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <text x={barAreaLeft - 8} y={y + barHeight / 2} textAnchor="end" fontSize={12} fill="var(--color-dark)" fontWeight={600} dominantBaseline="middle">
                Final Price
              </text>
              <rect
                x={xScale(Math.min(finalPrice, 0))}
                y={y}
                width={Math.max(2, xScale(finalPrice) - xScale(Math.min(finalPrice, 0)))}
                height={barHeight}
                rx={4}
                fill="var(--color-primary)"
              />
              <text x={xScale(finalPrice) + 6} y={y + barHeight / 2} fontSize={11} fill="var(--color-dark)" fontWeight={600} dominantBaseline="middle">
                ${finalPrice.toFixed(2)}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
