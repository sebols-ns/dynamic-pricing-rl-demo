import { Typography } from '@northslopetech/altitude-ui';

interface DataLineageProps {
  className?: string;
}

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  width: number;
}

interface Edge {
  from: string;
  to: string;
}

const NODES: Node[] = [
  // Column 1: CSV columns
  { id: 'qty', label: 'qty', x: 20, y: 30, color: 'var(--color-interactive)', width: 80 },
  { id: 'comp_1', label: 'comp_1', x: 20, y: 75, color: 'var(--color-interactive)', width: 80 },
  { id: 'month', label: 'month', x: 20, y: 120, color: 'var(--color-interactive)', width: 80 },
  { id: 'lag_price', label: 'lag_price', x: 20, y: 165, color: 'var(--color-interactive)', width: 80 },
  { id: 'unit_price', label: 'unit_price', x: 20, y: 210, color: 'var(--color-interactive)', width: 80 },

  // Column 2: State features
  { id: 'demand_bin', label: 'demandBin', x: 180, y: 30, color: 'var(--color-warning)', width: 100 },
  { id: 'comp_bin', label: 'compPriceBin', x: 180, y: 75, color: 'var(--color-warning)', width: 100 },
  { id: 'season_bin', label: 'seasonBin', x: 180, y: 120, color: 'var(--color-warning)', width: 100 },
  { id: 'lag_bin', label: 'lagPriceBin', x: 180, y: 165, color: 'var(--color-warning)', width: 100 },

  // Column 3: Q-table
  { id: 'qtable', label: 'Q-Table\n500×10', x: 360, y: 90, color: 'var(--color-primary)', width: 90 },

  // Column 4: Output
  { id: 'price', label: 'Rec. Price', x: 510, y: 90, color: 'var(--color-success)', width: 90 },
];

const EDGES: Edge[] = [
  { from: 'qty', to: 'demand_bin' },
  { from: 'comp_1', to: 'comp_bin' },
  { from: 'month', to: 'season_bin' },
  { from: 'lag_price', to: 'lag_bin' },
  { from: 'demand_bin', to: 'qtable' },
  { from: 'comp_bin', to: 'qtable' },
  { from: 'season_bin', to: 'qtable' },
  { from: 'lag_bin', to: 'qtable' },
  { from: 'unit_price', to: 'price' },
  { from: 'qtable', to: 'price' },
];

function getNodeCenter(node: Node): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + 16 };
}

export function DataLineage({ className }: DataLineageProps) {
  return (
    <div className={className}>
      <Typography variant="label-md-bold" className="mb-2">Data Lineage: CSV → State → Q-Table → Price</Typography>
      <svg width={620} height={250} className="overflow-visible">
        {/* Column labels */}
        <text x={60} y={15} textAnchor="middle" fontSize={10} fill="var(--color-secondary)" fontWeight={600}>CSV Columns</text>
        <text x={230} y={15} textAnchor="middle" fontSize={10} fill="var(--color-secondary)" fontWeight={600}>State Features</text>
        <text x={405} y={15} textAnchor="middle" fontSize={10} fill="var(--color-secondary)" fontWeight={600}>Model</text>
        <text x={555} y={15} textAnchor="middle" fontSize={10} fill="var(--color-secondary)" fontWeight={600}>Output</text>

        {/* Edges */}
        {EDGES.map((edge, i) => {
          const fromNode = NODES.find(n => n.id === edge.from)!;
          const toNode = NODES.find(n => n.id === edge.to)!;
          const from = getNodeCenter(fromNode);
          const to = getNodeCenter(toNode);
          return (
            <line
              key={i}
              x1={fromNode.x + fromNode.width}
              y1={from.y}
              x2={toNode.x}
              y2={to.y}
              stroke="var(--color-gray)"
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--color-gray)" />
          </marker>
        </defs>

        {/* Nodes */}
        {NODES.map(node => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={32}
              rx={6}
              fill={node.color}
              opacity={0.15}
              stroke={node.color}
              strokeWidth={1.5}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + 16}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--color-dark)"
              fontWeight={500}
            >
              {node.label.split('\n').map((line, i) => (
                <tspan key={i} x={node.x + node.width / 2} dy={i === 0 ? 0 : 12}>{line}</tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
