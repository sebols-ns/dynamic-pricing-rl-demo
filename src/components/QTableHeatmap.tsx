import { useMemo } from 'react';
import { Typography } from '@northslopetech/altitude-ui';
import type { QLearningAgent } from '../engine/q-learning';
import { ACTION_MULTIPLIERS, TOTAL_STATES, NUM_ACTIONS } from '../types/rl';

interface QTableHeatmapProps {
  agent: QLearningAgent;
  episode: number; // forces re-computation when training progresses
}

function getColor(value: number, min: number, max: number): string {
  if (max === min) return 'hsl(210, 50%, 85%)';
  const t = (value - min) / (max - min);
  const hue = 210 + t * (140 - 210);
  const lightness = 90 - t * 45;
  return `hsl(${hue}, 70%, ${lightness}%)`;
}

export function QTableHeatmap({ agent, episode }: QTableHeatmapProps) {
  const { cells, topStates, globalMin, globalMax } = useMemo(() => {
    const stateMaxQ: { stateIdx: number; maxQ: number }[] = [];
    for (let s = 0; s < TOTAL_STATES; s++) {
      let maxQ = -Infinity;
      for (let a = 0; a < NUM_ACTIONS; a++) {
        const v = agent.qTable[s * NUM_ACTIONS + a];
        if (v > maxQ) maxQ = v;
      }
      if (maxQ > -Infinity && maxQ > 0.001) {
        stateMaxQ.push({ stateIdx: s, maxQ });
      }
    }
    stateMaxQ.sort((a, b) => b.maxQ - a.maxQ);
    const topStates = stateMaxQ.slice(0, 12).map(s => s.stateIdx);
    if (topStates.length === 0) {
      for (let s = 0; s < Math.min(8, TOTAL_STATES); s++) topStates.push(s);
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

    return { cells, topStates, globalMin: gMin, globalMax: gMax };
  }, [agent, episode]); // episode forces recompute

  const numRows = topStates.length;
  const cellW = 44;
  const cellH = 28;
  const labelWidth = 48;
  const headerHeight = 32;
  const svgWidth = labelWidth + NUM_ACTIONS * cellW + 80;
  const svgHeight = headerHeight + numRows * cellH + 10;

  return (
    <div>
      <Typography variant="label-md-bold" style={{ marginBottom: '12px' }}>
        Q-Table Heatmap (Top {numRows} States x 10 Actions)
      </Typography>
      <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible', fontFamily: 'Inter, sans-serif' }}>
        {/* Column headers */}
        {ACTION_MULTIPLIERS.map((mult, i) => (
          <text
            key={`h-${i}`}
            x={labelWidth + i * cellW + cellW / 2}
            y={headerHeight - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-secondary)"
            fontWeight={500}
          >
            {mult.toFixed(2)}x
          </text>
        ))}

        {/* Rows */}
        {topStates.map((stateIdx, row) => (
          <g key={`row-${stateIdx}`}>
            <text
              x={labelWidth - 6}
              y={headerHeight + row * cellH + cellH / 2 + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-secondary)"
            >
              S{stateIdx}
            </text>
            {Array.from({ length: NUM_ACTIONS }).map((_, col) => {
              const cell = cells[row * NUM_ACTIONS + col];
              if (!cell) return null;
              const isMax = cell.value === Math.max(...cells.filter(c => c.stateIdx === stateIdx).map(c => c.value));
              return (
                <g key={`cell-${row}-${col}`}>
                  <rect
                    x={labelWidth + col * cellW}
                    y={headerHeight + row * cellH}
                    width={cellW - 2}
                    height={cellH - 2}
                    rx={4}
                    fill={getColor(cell.value, globalMin, globalMax)}
                    stroke={isMax ? 'var(--color-dark)' : 'none'}
                    strokeWidth={isMax ? 1.5 : 0}
                    style={{ transition: 'fill 0.4s ease' }}
                  />
                  {cellW >= 40 && (
                    <text
                      x={labelWidth + col * cellW + (cellW - 2) / 2}
                      y={headerHeight + row * cellH + (cellH - 2) / 2 + 4}
                      textAnchor="middle"
                      fontSize={8}
                      fill="var(--color-secondary)"
                    >
                      {cell.value !== 0 ? cell.value.toFixed(2) : ''}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${labelWidth + NUM_ACTIONS * cellW + 12}, ${headerHeight})`}>
          <text fontSize={9} fill="var(--color-secondary)" fontWeight={600} y={-4}>Q-value</text>
          <defs>
            <linearGradient id="heatmapGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={getColor(globalMin, globalMin, globalMax)} />
              <stop offset="100%" stopColor={getColor(globalMax, globalMin, globalMax)} />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={12} height={numRows * cellH - 10} rx={3} fill="url(#heatmapGrad)" />
          <text x={16} y={10} fontSize={8} fill="var(--color-secondary)">{globalMax.toFixed(2)}</text>
          <text x={16} y={numRows * cellH - 14} fontSize={8} fill="var(--color-secondary)">{globalMin.toFixed(2)}</text>
        </g>
      </svg>
    </div>
  );
}
