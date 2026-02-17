/**
 * Gradient Boosted Regression Trees (GBRT) engine.
 *
 * Pure-logic module: no React, no DOM. Trains a GBT model on retail data
 * to predict demand (qty) from price, competitor, seasonality and other features.
 */

import type { RetailRow } from '../types/data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeNode {
  featureIndex: number; // -1 for leaf
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  value: number; // leaf prediction (mean residual)
  gain: number; // split gain (for feature importance)
}

export interface GBRTModel {
  trees: TreeNode[];
  featureNames: string[];
  featureImportance: number[];
  intercept: number; // mean(target) — initial prediction
  learningRate: number;
}

export interface GBRTConfig {
  maxDepth: number;
  minSamplesLeaf: number;
  learningRate: number;
  nTrees: number;
  subsampleRate: number;
}

export interface GBRTSnapshot {
  treeIndex: number;
  trainR2: number;
  featureImportance: number[];
  predictions: Float64Array;
}

export const DEFAULT_GBRT_CONFIG: GBRTConfig = {
  maxDepth: 5,
  minSamplesLeaf: 20,
  learningRate: 0.1,
  nTrees: 100,
  subsampleRate: 0.8,
};

export const FEATURE_NAMES = [
  'unit_price',
  'comp_1',
  'month',
  'lag_price',
  'inventory_level',
  'demand_forecast',
  'holiday',
  'weekday',
  'product_score',
  'freight_price',
];

// ---------------------------------------------------------------------------
// Feature preparation
// ---------------------------------------------------------------------------

export interface PreparedData {
  X: Float64Array[]; // one Float64Array per feature (column-major)
  y: Float64Array;
  featureNames: string[];
  nRows: number;
  nFeatures: number;
}

export function prepareFeatures(rows: RetailRow[]): PreparedData {
  const n = rows.length;
  const nFeatures = FEATURE_NAMES.length;
  const X: Float64Array[] = [];
  for (let f = 0; f < nFeatures; f++) {
    X.push(new Float64Array(n));
  }
  const y = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    X[0][i] = r.unit_price;
    X[1][i] = r.comp_1;
    X[2][i] = r.month;
    X[3][i] = r.lag_price;
    X[4][i] = r.inventory_level;
    X[5][i] = r.demand_forecast;
    X[6][i] = r.holiday;
    X[7][i] = r.weekday;
    X[8][i] = r.product_score;
    X[9][i] = r.freight_price;
    y[i] = r.qty;
  }

  return { X, y, featureNames: FEATURE_NAMES.slice(), nRows: n, nFeatures };
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

interface SplitResult {
  featureIndex: number;
  threshold: number;
  gain: number;
  leftIndices: Uint32Array;
  rightIndices: Uint32Array;
}

function weightedVariance(residuals: Float64Array, indices: Uint32Array, start: number, end: number): number {
  const n = end - start;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += residuals[indices[i]];
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = start; i < end; i++) {
    const d = residuals[indices[i]] - mean;
    variance += d * d;
  }
  return variance;
}

function meanValue(residuals: Float64Array, indices: Uint32Array | number[], start: number, end: number): number {
  const n = end - start;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += residuals[indices[i]];
  }
  return sum / n;
}

/**
 * Find the best split for a single feature by scanning sorted values.
 * Uses O(n) scan with pre-sorted indices.
 */
function findBestSplitForFeature(
  featureValues: Float64Array,
  residuals: Float64Array,
  indices: Uint32Array,
  start: number,
  end: number,
  minSamplesLeaf: number,
): { threshold: number; gain: number; splitPos: number } | null {
  const n = end - start;
  if (n < 2 * minSamplesLeaf) return null;

  // Sort the working slice of indices by feature value
  const slice = indices.slice(start, end);
  slice.sort((a, b) => featureValues[a] - featureValues[b]);
  for (let i = start; i < end; i++) {
    indices[i] = slice[i - start];
  }

  // Total sum and sum-of-squares for MSE calculation
  let totalSum = 0;
  for (let i = start; i < end; i++) {
    totalSum += residuals[indices[i]];
  }
  const totalMean = totalSum / n;
  let totalSS = 0;
  for (let i = start; i < end; i++) {
    const d = residuals[indices[i]] - totalMean;
    totalSS += d * d;
  }

  let leftSum = 0;
  let bestGain = 0;
  let bestSplitPos = -1;
  let bestThreshold = 0;

  for (let i = start; i < end - 1; i++) {
    leftSum += residuals[indices[i]];
    const leftN = i - start + 1;
    const rightN = n - leftN;

    if (leftN < minSamplesLeaf || rightN < minSamplesLeaf) continue;

    // Skip if same feature value as next (can't split between identical values)
    if (featureValues[indices[i]] === featureValues[indices[i + 1]]) continue;

    const rightSum = totalSum - leftSum;
    const leftMean = leftSum / leftN;
    const rightMean = rightSum / rightN;

    // Gain = total_SS - left_SS - right_SS
    // But we can compute it as: n * totalMean^2 - leftN * leftMean^2 - rightN * rightMean^2
    // Actually: gain = leftN * leftMean^2 + rightN * rightMean^2 - n * totalMean^2
    // This is equivalent to the reduction in variance
    const gain = leftN * leftMean * leftMean + rightN * rightMean * rightMean - n * totalMean * totalMean;

    if (gain > bestGain) {
      bestGain = gain;
      bestSplitPos = i + 1; // split: [start, splitPos) goes left, [splitPos, end) goes right
      bestThreshold = (featureValues[indices[i]] + featureValues[indices[i + 1]]) / 2;
    }
  }

  if (bestSplitPos < 0) return null;
  return { threshold: bestThreshold, gain: bestGain, splitPos: bestSplitPos };
}

function findBestSplit(
  X: Float64Array[],
  residuals: Float64Array,
  indices: Uint32Array,
  start: number,
  end: number,
  minSamplesLeaf: number,
): SplitResult | null {
  let bestResult: SplitResult | null = null;
  let bestGain = 0;

  // We need to try each feature independently, but sorting modifies indices.
  // Work on a copy for each feature scan.
  const workingIndices = indices.slice(start, end);

  for (let f = 0; f < X.length; f++) {
    // Restore the original order for this feature scan
    const tempIndices = new Uint32Array(indices.buffer, start * 4, end - start);
    tempIndices.set(workingIndices);

    const result = findBestSplitForFeature(X[f], residuals, indices, start, end, minSamplesLeaf);
    if (result && result.gain > bestGain) {
      bestGain = result.gain;
      const leftIndices = indices.slice(start, start + result.splitPos - start);
      const rightIndices = indices.slice(start + result.splitPos - start, end);
      bestResult = {
        featureIndex: f,
        threshold: result.threshold,
        gain: result.gain,
        leftIndices,
        rightIndices,
      };
    }
  }

  return bestResult;
}

function buildTreeRecursive(
  X: Float64Array[],
  residuals: Float64Array,
  indices: Uint32Array,
  start: number,
  end: number,
  depth: number,
  config: GBRTConfig,
  importanceAccum: Float64Array,
): TreeNode {
  const n = end - start;
  const leafValue = meanValue(residuals, indices, start, end);

  // Leaf conditions
  if (depth >= config.maxDepth || n < 2 * config.minSamplesLeaf) {
    return { featureIndex: -1, threshold: 0, left: null, right: null, value: leafValue, gain: 0 };
  }

  const split = findBestSplit(X, residuals, indices, start, end, config.minSamplesLeaf);
  if (!split || split.gain <= 0) {
    return { featureIndex: -1, threshold: 0, left: null, right: null, value: leafValue, gain: 0 };
  }

  // Accumulate feature importance
  importanceAccum[split.featureIndex] += split.gain;

  // Rebuild indices: left portion first, right portion second
  const combined = new Uint32Array(n);
  combined.set(split.leftIndices, 0);
  combined.set(split.rightIndices, split.leftIndices.length);
  for (let i = 0; i < n; i++) {
    indices[start + i] = combined[i];
  }

  const mid = start + split.leftIndices.length;

  const left = buildTreeRecursive(X, residuals, indices, start, mid, depth + 1, config, importanceAccum);
  const right = buildTreeRecursive(X, residuals, indices, mid, end, depth + 1, config, importanceAccum);

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    left,
    right,
    value: leafValue, // internal node also stores mean (not strictly needed)
    gain: split.gain,
  };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

export function predictTree(node: TreeNode, features: Float64Array | number[]): number {
  if (node.featureIndex < 0 || !node.left || !node.right) {
    return node.value;
  }
  if (features[node.featureIndex] <= node.threshold) {
    return predictTree(node.left, features);
  }
  return predictTree(node.right, features);
}

export function predictModel(model: GBRTModel, features: Float64Array | number[]): number {
  let pred = model.intercept;
  for (const tree of model.trees) {
    pred += model.learningRate * predictTree(tree, features);
  }
  return Math.max(0, pred);
}

/**
 * Predict for a single row, building the feature vector on the fly.
 */
export function predictRow(model: GBRTModel, row: RetailRow, overridePrice?: number): number {
  const features = [
    overridePrice ?? row.unit_price,
    row.comp_1,
    row.month,
    row.lag_price,
    row.inventory_level,
    row.demand_forecast,
    row.holiday,
    row.weekday,
    row.product_score,
    row.freight_price,
  ];
  return predictModel(model, features);
}

// ---------------------------------------------------------------------------
// Training (one tree at a time for streaming UI)
// ---------------------------------------------------------------------------

export interface TrainingContext {
  X: Float64Array[];
  y: Float64Array;
  residuals: Float64Array;
  predictions: Float64Array;
  featureImportance: Float64Array;
  config: GBRTConfig;
  model: GBRTModel;
  nRows: number;
}

export function initTraining(data: PreparedData, config: GBRTConfig = DEFAULT_GBRT_CONFIG): TrainingContext {
  const { X, y, nRows } = data;

  // Intercept = mean(y)
  let sum = 0;
  for (let i = 0; i < nRows; i++) sum += y[i];
  const intercept = sum / nRows;

  const predictions = new Float64Array(nRows);
  const residuals = new Float64Array(nRows);
  predictions.fill(intercept);
  for (let i = 0; i < nRows; i++) {
    residuals[i] = y[i] - intercept;
  }

  const model: GBRTModel = {
    trees: [],
    featureNames: data.featureNames.slice(),
    featureImportance: new Array(data.nFeatures).fill(0),
    intercept,
    learningRate: config.learningRate,
  };

  return {
    X,
    y,
    residuals,
    predictions,
    featureImportance: new Float64Array(data.nFeatures),
    config,
    model,
    nRows,
  };
}

/**
 * Train one tree on current residuals. Updates predictions/residuals in-place.
 * Returns the snapshot for visualization.
 */
export function trainOneTree(ctx: TrainingContext, treeIndex: number): GBRTSnapshot {
  const { X, y, residuals, predictions, config, model, nRows } = ctx;

  // Subsample
  const sampleSize = Math.floor(nRows * config.subsampleRate);
  const indices = new Uint32Array(sampleSize);
  if (config.subsampleRate >= 1.0) {
    for (let i = 0; i < nRows; i++) indices[i] = i;
  } else {
    // Random sampling without replacement (Fisher-Yates on a full array, take first sampleSize)
    const all = new Uint32Array(nRows);
    for (let i = 0; i < nRows; i++) all[i] = i;
    for (let i = nRows - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = all[i];
      all[i] = all[j];
      all[j] = tmp;
    }
    for (let i = 0; i < sampleSize; i++) indices[i] = all[i];
  }

  // Build tree
  const tree = buildTreeRecursive(
    X, residuals, indices, 0, sampleSize, 0, config, ctx.featureImportance,
  );

  // Update predictions and residuals for ALL rows (not just the subsample)
  const featureVec = new Float64Array(X.length);
  for (let i = 0; i < nRows; i++) {
    for (let f = 0; f < X.length; f++) featureVec[f] = X[f][i];
    const treePred = predictTree(tree, featureVec);
    predictions[i] += config.learningRate * treePred;
    residuals[i] = y[i] - predictions[i];
  }

  // Add tree to model
  model.trees.push(tree);

  // Update model's feature importance (normalized)
  const totalImportance = ctx.featureImportance.reduce((s, v) => s + v, 0);
  for (let f = 0; f < ctx.featureImportance.length; f++) {
    model.featureImportance[f] = totalImportance > 0
      ? ctx.featureImportance[f] / totalImportance
      : 0;
  }

  // Compute R²
  let ssRes = 0;
  let ssTot = 0;
  let meanY = 0;
  for (let i = 0; i < nRows; i++) meanY += y[i];
  meanY /= nRows;
  for (let i = 0; i < nRows; i++) {
    const diff = y[i] - predictions[i];
    ssRes += diff * diff;
    const diffMean = y[i] - meanY;
    ssTot += diffMean * diffMean;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    treeIndex,
    trainR2: r2,
    featureImportance: model.featureImportance.slice(),
    predictions: predictions.slice() as Float64Array,
  };
}

// ---------------------------------------------------------------------------
// Demand curve generation
// ---------------------------------------------------------------------------

export interface DemandCurvePoint {
  price: number;
  qty: number;
}

/**
 * Generate a demand curve by varying price across a range for a given product's
 * average feature values.
 */
export function generateDemandCurve(
  model: GBRTModel,
  rows: RetailRow[],
  numPoints: number = 20,
  priceRange: [number, number] = [0.5, 2.0],
): DemandCurvePoint[] {
  if (rows.length === 0) return [];

  // Compute average features for this product
  const n = rows.length;
  const avgFeatures = new Float64Array(FEATURE_NAMES.length);
  for (const r of rows) {
    avgFeatures[0] += r.unit_price;
    avgFeatures[1] += r.comp_1;
    avgFeatures[2] += r.month;
    avgFeatures[3] += r.lag_price;
    avgFeatures[4] += r.inventory_level;
    avgFeatures[5] += r.demand_forecast;
    avgFeatures[6] += r.holiday;
    avgFeatures[7] += r.weekday;
    avgFeatures[8] += r.product_score;
    avgFeatures[9] += r.freight_price;
  }
  for (let f = 0; f < avgFeatures.length; f++) avgFeatures[f] /= n;

  const basePrice = avgFeatures[0];
  const points: DemandCurvePoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const ratio = priceRange[0] + (priceRange[1] - priceRange[0]) * (i / (numPoints - 1));
    const price = basePrice * ratio;
    const features = avgFeatures.slice();
    features[0] = price; // override unit_price
    const qty = predictModel(model, features);
    points.push({ price: Math.round(price * 100) / 100, qty: Math.round(qty * 10) / 10 });
  }

  return points;
}
