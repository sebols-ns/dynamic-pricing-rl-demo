import { useMemo } from 'react';
import { Typography, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@northslopetech/altitude-ui';
import type { QLearningAgent } from '../engine/q-learning';
import { ACTION_MULTIPLIERS, TOTAL_STATES, NUM_ACTIONS } from '../types/rl';

interface QTableHeatmapProps {
  agent: QLearningAgent;
  className?: string;
}

function getColor(value: number, min: number, max: number): string {
  if (max === min) return 'hsl(210, 50%, 50%)';
  const t = (value - min) / (max - min);
  // Blue (low) to Green (high)
  const hue = 210 + t * (140 - 210); // 210=blue -> 140=green
  const lightness = 85 - t * 40; // lighter for low, darker for high
  return `hsl(${hue}, 65%, ${lightness}%)`;
}

export function QTableHeatmap({ agent, className }: QTableHeatmapProps) {
  const { cells, globalMin, globalMax } = useMemo(() => {
    // Aggregate: for each action, average Q-value across all states
    const actionAvgs: number[] = [];
    for (let a = 0; a < NUM_ACTIONS; a++) {
      let sum = 0;
      let count = 0;
      for (let s = 0; s < TOTAL_STATES; s++) {
        const v = agent.qTable[s * NUM_ACTIONS + a];
        if (v !== 0) {
          sum += v;
          count++;
        }
      }
      actionAvgs.push(count > 0 ? sum / count : 0);
    }

    // For a more detailed view, show top 20 most-visited states × actions
    const stateMaxQ: { stateIdx: number; maxQ: number }[] = [];
    for (let s = 0; s < TOTAL_STATES; s++) {
      let maxQ = -Infinity;
      for (let a = 0; a < NUM_ACTIONS; a++) {
        const v = agent.qTable[s * NUM_ACTIONS + a];
        if (v > maxQ) maxQ = v;
      }
      if (maxQ > -Infinity && maxQ !== 0) {
        stateMaxQ.push({ stateIdx: s, maxQ });
      }
    }
    stateMaxQ.sort((a, b) => b.maxQ - a.maxQ);
    const topStates = stateMaxQ.slice(0, 15).map(s => s.stateIdx);
    if (topStates.length === 0) {
      // No training yet, show empty grid with a few states
      for (let s = 0; s < Math.min(15, TOTAL_STATES); s++) topStates.push(s);
    }

    const cells: { stateIdx: number; action: number; value: number }[] = [];
    let gMin = Infinity, gMax = -Infinity;
    for (const s of topStates) {
      for (let a = 0; a < NUM_ACTIONS; a++) {
        const v = agent.qTable[s * NUM_ACTIONS + a];
        cells.push({ stateIdx: s, action: a, value: v });
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }
    if (gMin === Infinity) { gMin = 0; gMax = 0; }

    return { cells, topStates, actionAvgs, globalMin: gMin, globalMax: gMax };
  }, [agent]);

  const numRows = Math.ceil(cells.length / NUM_ACTIONS);
  const cellSize = 28;
  const labelWidth = 50;
  const headerHeight = 40;
  const svgWidth = labelWidth + NUM_ACTIONS * cellSize + 10;
  const svgHeight = headerHeight + numRows * cellSize + 10;

  return (
    <div className={className}>
      <Typography variant="label-md-bold" className="mb-2">Q-Table Heatmap (Top States × Actions)</Typography>
      <TooltipProvider>
        <svg width={svgWidth} height={svgHeight} className="overflow-visible">
          {/* Column headers - action multipliers */}
          {ACTION_MULTIPLIERS.map((mult, i) => (
            <text
              key={`h-${i}`}
              x={labelWidth + i * cellSize + cellSize / 2}
              y={headerHeight - 8}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-secondary)"
            >
              {mult.toFixed(2)}
            </text>
          ))}
          {/* Rows */}
          {Array.from({ length: numRows }).map((_, row) => (
            <g key={`row-${row}`}>
              <text
                x={labelWidth - 4}
                y={headerHeight + row * cellSize + cellSize / 2 + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-secondary)"
              >
                S{cells[row * NUM_ACTIONS]?.stateIdx ?? row}
              </text>
              {Array.from({ length: NUM_ACTIONS }).map((_, col) => {
                const cell = cells[row * NUM_ACTIONS + col];
                if (!cell) return null;
                return (
                  <Tooltip key={`cell-${row}-${col}`}>
                    <TooltipTrigger asChild>
                      <rect
                        x={labelWidth + col * cellSize}
                        y={headerHeight + row * cellSize}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        rx={3}
                        fill={getColor(cell.value, globalMin, globalMax)}
                        className="cursor-pointer"
                        style={{ transition: 'fill 0.3s' }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <div>State {cell.stateIdx}, Action ×{ACTION_MULTIPLIERS[cell.action].toFixed(2)}</div>
                        <div>Q-value: {cell.value.toFixed(4)}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </g>
          ))}
        </svg>
      </TooltipProvider>
    </div>
  );
}
