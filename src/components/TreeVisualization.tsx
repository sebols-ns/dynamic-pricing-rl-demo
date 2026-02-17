import { useMemo } from 'react';
import type { TreeNode } from '../engine/gbrt';

interface TreeVisualizationProps {
  tree: TreeNode;
  featureNames: string[];
  treeIndex: number;
}

interface LayoutNode {
  x: number;
  y: number;
  depth: number;
  isLeaf: boolean;
  label: string;
  sublabel?: string;
  children: LayoutNode[];
}

function isLeafNode(node: TreeNode): boolean {
  return node.featureIndex < 0 || !node.left || !node.right;
}

function countLeaves(node: TreeNode): number {
  if (isLeafNode(node)) return 1;
  return countLeaves(node.left!) + countLeaves(node.right!);
}

function treeDepth(node: TreeNode): number {
  if (isLeafNode(node)) return 0;
  return 1 + Math.max(treeDepth(node.left!), treeDepth(node.right!));
}

function formatFeatureName(fname: string): string {
  const map: Record<string, string> = {
    unit_price: 'price',
    comp_1: 'competitor',
    lag_price: 'lag price',
    freight_price: 'freight',
    product_score: 'score',
  };
  return map[fname] ?? fname;
}

function formatThreshold(fname: string, threshold: number): string {
  if (fname === 'category') return '';
  if (threshold > 1000) return Math.round(threshold).toLocaleString();
  if (threshold >= 100) return threshold.toFixed(0);
  return threshold.toFixed(1);
}

function layoutTree(
  node: TreeNode,
  featureNames: string[],
  depth: number,
  leftX: number,
  width: number,
  levelHeight: number,
): LayoutNode {
  const isLeaf = isLeafNode(node);
  const y = depth * levelHeight + 28;

  if (isLeaf) {
    const sign = node.value >= 0 ? '+' : '';
    return {
      x: leftX + width / 2,
      y,
      depth,
      isLeaf: true,
      label: `${sign}${node.value.toFixed(1)}`,
      children: [],
    };
  }

  const leftLeaves = countLeaves(node.left!);
  const rightLeaves = countLeaves(node.right!);
  const totalLeaves = leftLeaves + rightLeaves;
  const leftWidth = (leftLeaves / totalLeaves) * width;
  const rightWidth = width - leftWidth;

  const leftChild = layoutTree(node.left!, featureNames, depth + 1, leftX, leftWidth, levelHeight);
  const rightChild = layoutTree(node.right!, featureNames, depth + 1, leftX + leftWidth, rightWidth, levelHeight);

  const fname = featureNames[node.featureIndex] ?? `f${node.featureIndex}`;
  const displayName = formatFeatureName(fname);
  const thresholdStr = formatThreshold(fname, node.threshold);

  return {
    x: (leftChild.x + rightChild.x) / 2,
    y,
    depth,
    isLeaf: false,
    label: displayName,
    sublabel: thresholdStr ? `<= ${thresholdStr}` : undefined,
    children: [leftChild, rightChild],
  };
}

function collectNodes(layout: LayoutNode): LayoutNode[] {
  const result = [layout];
  for (const child of layout.children) {
    result.push(...collectNodes(child));
  }
  return result;
}

function collectEdges(layout: LayoutNode): { x1: number; y1: number; x2: number; y2: number }[] {
  const result: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const child of layout.children) {
    result.push({ x1: layout.x, y1: layout.y + 12, x2: child.x, y2: child.y - 12 });
    result.push(...collectEdges(child));
  }
  return result;
}

export function TreeVisualization({ tree, featureNames, treeIndex }: TreeVisualizationProps) {
  const { nodes, edges, svgHeight, svgWidth, depth } = useMemo(() => {
    const d = treeDepth(tree);
    const nLeaves = countLeaves(tree);
    // Scale width to leaf count so labels don't overlap
    const minLeafWidth = 70;
    const w = Math.max(600, nLeaves * minLeafWidth);
    const levelHeight = 64;
    const layout = layoutTree(tree, featureNames, 0, 20, w - 40, levelHeight);

    const allNodes = collectNodes(layout);
    const maxY = Math.max(...allNodes.map(n => n.y));

    return {
      nodes: allNodes,
      edges: collectEdges(layout),
      svgHeight: maxY + 44,
      svgWidth: w,
      depth: d,
    };
  }, [tree, featureNames]);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-secondary)' }}>
          Tree {treeIndex + 1} — depth {depth}, {nodes.filter(n => n.isLeaf).length} leaves
        </span>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          {/* Edges */}
          {edges.map((e, i) => (
            <line
              key={`e${i}`}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="var(--color-neutral-300)"
              strokeWidth={1}
            />
          ))}

          {/* Nodes */}
          {nodes.map((n, i) => {
            if (n.isLeaf) {
              return (
                <g key={`n${i}`}>
                  <circle cx={n.x} cy={n.y} r={5} fill="var(--color-success)" />
                  <text
                    x={n.x} y={n.y + 16}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-secondary)"
                    style={{ fontFamily: 'monospace', userSelect: 'none' }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            }

            // Internal node — rounded rect with label inside
            const boxW = Math.max(60, n.label.length * 7 + 16);
            return (
              <g key={`n${i}`}>
                <rect
                  x={n.x - boxW / 2}
                  y={n.y - 12}
                  width={boxW}
                  height={24}
                  rx={4}
                  fill="var(--color-interactive)"
                />
                <text
                  x={n.x} y={n.y + 1}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="white"
                  style={{ userSelect: 'none' }}
                >
                  {n.label}
                </text>
                {n.sublabel && (
                  <text
                    x={n.x} y={n.y - 16}
                    textAnchor="middle"
                    fontSize={8}
                    fill="var(--color-secondary)"
                    style={{ fontFamily: 'monospace', userSelect: 'none' }}
                  >
                    {n.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
