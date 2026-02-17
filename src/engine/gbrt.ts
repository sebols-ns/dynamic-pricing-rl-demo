/**
 * Gradient Boosted Regression Trees (GBRT) engine.
 *
 * Pure-logic module: no React, no DOM. Trains a GBT model on retail data
 * to predict demand (qty) from price, competitor, seasonality and other features.
 *
 * Uses histogram-based split finding for fast training on large datasets.
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
  lambda: number; // L2 regularization on leaf values (XGBoost-style)
}

export interface GBRTSnapshot {
  treeIndex: number;
  trainR2: number;
  testR2: number;
  featureImportance: number[];
  predictions: Float64Array;
}

export const DEFAULT_GBRT_CONFIG: GBRTConfig = {
  maxDepth: 4,
  minSamplesLeaf: 10,
  learningRate: 0.05,
  nTrees: 2000,
  subsampleRate: 0.8,
  lambda: 10,  // L2 regularization — shrinks leaf values, critical for small datasets
};

export const FEATURE_NAMES = [
  'unit_price',
  'comp_1',
  'month',
  'lag_price',
  'holiday',
  'weekday',
  'product_score',
  'freight_price',
  'category',
  'discount',
];

/**
 * Deterministic numeric encoding for category strings.
 * Trees only need distinct values per category — no ordinal meaning required.
 */
export function encodeCategory(cat: string): number {
  let h = 0;
  for (let i = 0; i < cat.length; i++) {
    h = Math.imul(31, h) + cat.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

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
    X[4][i] = r.holiday;
    X[5][i] = r.weekday;
    X[6][i] = r.product_score;
    X[7][i] = r.freight_price;
    X[8][i] = encodeCategory(r.product_category_name);
    X[9][i] = r.discount;
    y[i] = r.qty;
  }

  return { X, y, featureNames: FEATURE_NAMES.slice(), nRows: n, nFeatures };
}

// ---------------------------------------------------------------------------
// Histogram binning (computed once, reused across all trees)
// ---------------------------------------------------------------------------

const MAX_HIST_BINS = 64;

interface BinnedFeatures {
  binIndices: Uint8Array[];   // [nFeatures][nRows] — bin index per sample
  binEdges: Float64Array[];   // [nFeatures] — threshold values between bins
  nBins: number[];            // actual bin count per feature
  maxBins: number;            // max across all features
}

function binFeatures(X: Float64Array[], nRows: number): BinnedFeatures {
  const nFeatures = X.length;
  const binIndices: Uint8Array[] = [];
  const binEdges: Float64Array[] = [];
  const nBins: number[] = [];
  let maxBins = 0;

  for (let f = 0; f < nFeatures; f++) {
    const sorted = Float64Array.from(X[f]).sort();

    // Compute quantile-based bin edges, deduplicating ties
    const edges: number[] = [];
    for (let b = 1; b < MAX_HIST_BINS; b++) {
      const idx = Math.floor(b * nRows / MAX_HIST_BINS);
      const val = sorted[Math.min(idx, nRows - 1)];
      if (edges.length === 0 || val !== edges[edges.length - 1]) {
        edges.push(val);
      }
    }
    const edgesArr = Float64Array.from(edges);
    binEdges.push(edgesArr);
    const fBins = edgesArr.length + 1;
    nBins.push(fBins);
    if (fBins > maxBins) maxBins = fBins;

    // Assign each sample to a bin via binary search
    const bins = new Uint8Array(nRows);
    const nEdges = edgesArr.length;
    for (let i = 0; i < nRows; i++) {
      const v = X[f][i];
      let lo = 0, hi = nEdges;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (edgesArr[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      bins[i] = lo;
    }
    binIndices.push(bins);
  }

  return { binIndices, binEdges, nBins, maxBins };
}

// ---------------------------------------------------------------------------
// Histogram-based tree building
// ---------------------------------------------------------------------------

/** Regularized leaf value: sum(residuals) / (count + lambda) */
function leafValue(residuals: Float64Array, indices: Uint32Array, start: number, end: number, lambda: number): number {
  const n = end - start;
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += residuals[indices[i]];
  }
  return sum / (n + lambda);
}

function findBestSplitHist(
  binned: BinnedFeatures,
  residuals: Float64Array,
  indices: Uint32Array,
  start: number,
  end: number,
  minSamplesLeaf: number,
  lambda: number,
  histSum: Float64Array,
  histCount: Uint32Array,
): { featureIndex: number; threshold: number; gain: number; splitBin: number } | null {
  const n = end - start;
  if (n < 2 * minSamplesLeaf) return null;

  let totalSum = 0;
  for (let i = start; i < end; i++) {
    totalSum += residuals[indices[i]];
  }

  // XGBoost-style regularized gain: sum² / (count + lambda)
  const parentScore = (totalSum * totalSum) / (n + lambda);

  let bestGain = 0;
  let bestFeature = -1;
  let bestBin = -1;
  let bestThreshold = 0;

  for (let f = 0; f < binned.binIndices.length; f++) {
    const fBins = binned.binIndices[f];
    const numBins = binned.nBins[f];
    const edges = binned.binEdges[f];

    // Clear histogram
    for (let b = 0; b < numBins; b++) {
      histSum[b] = 0;
      histCount[b] = 0;
    }

    // Build histogram
    for (let i = start; i < end; i++) {
      const idx = indices[i];
      histSum[fBins[idx]] += residuals[idx];
      histCount[fBins[idx]]++;
    }

    // Scan bins left-to-right to find best split
    let leftSum = 0;
    let leftCount = 0;

    for (let b = 0; b < numBins - 1; b++) {
      leftSum += histSum[b];
      leftCount += histCount[b];

      if (leftCount < minSamplesLeaf) continue;
      const rightCount = n - leftCount;
      if (rightCount < minSamplesLeaf) break;

      const rightSum = totalSum - leftSum;

      // Regularized gain: left_score + right_score - parent_score
      const gain = (leftSum * leftSum) / (leftCount + lambda)
        + (rightSum * rightSum) / (rightCount + lambda)
        - parentScore;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestBin = b;
        bestThreshold = edges[b];
      }
    }
  }

  if (bestFeature < 0) return null;
  return { featureIndex: bestFeature, threshold: bestThreshold, gain: bestGain, splitBin: bestBin };
}

/**
 * In-place partition of indices so that samples with bin <= splitBin come first.
 * Returns the mid index (start of right partition).
 */
function partitionByBin(
  featureBins: Uint8Array,
  splitBin: number,
  indices: Uint32Array,
  start: number,
  end: number,
): number {
  let lo = start;
  let hi = end - 1;
  while (lo <= hi) {
    if (featureBins[indices[lo]] <= splitBin) {
      lo++;
    } else {
      const tmp = indices[lo];
      indices[lo] = indices[hi];
      indices[hi] = tmp;
      hi--;
    }
  }
  return lo;
}

function buildTreeHist(
  binned: BinnedFeatures,
  residuals: Float64Array,
  indices: Uint32Array,
  start: number,
  end: number,
  depth: number,
  config: GBRTConfig,
  importanceAccum: Float64Array,
  histSum: Float64Array,
  histCount: Uint32Array,
): TreeNode {
  const n = end - start;
  const lv = leafValue(residuals, indices, start, end, config.lambda);

  if (depth >= config.maxDepth || n < 2 * config.minSamplesLeaf) {
    return { featureIndex: -1, threshold: 0, left: null, right: null, value: lv, gain: 0 };
  }

  const split = findBestSplitHist(binned, residuals, indices, start, end, config.minSamplesLeaf, config.lambda, histSum, histCount);
  if (!split || split.gain <= 0) {
    return { featureIndex: -1, threshold: 0, left: null, right: null, value: lv, gain: 0 };
  }

  importanceAccum[split.featureIndex] += split.gain;

  const mid = partitionByBin(binned.binIndices[split.featureIndex], split.splitBin, indices, start, end);

  // Guard against degenerate splits
  if (mid === start || mid === end) {
    return { featureIndex: -1, threshold: 0, left: null, right: null, value: lv, gain: 0 };
  }

  const left = buildTreeHist(binned, residuals, indices, start, mid, depth + 1, config, importanceAccum, histSum, histCount);
  const right = buildTreeHist(binned, residuals, indices, mid, end, depth + 1, config, importanceAccum, histSum, histCount);

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    left,
    right,
    value: lv,
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
    row.holiday,
    row.weekday,
    row.product_score,
    row.freight_price,
    encodeCategory(row.product_category_name),
    row.discount,
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
  nRows: number;         // training rows only
  nRowsTotal: number;    // all rows (train + test)
  trainIndices: number[];
  testIndices: number[];
  // Full-dataset arrays for test R² computation
  allX: Float64Array[];
  allY: Float64Array;
  binned: BinnedFeatures;
  histSum: Float64Array;
  histCount: Uint32Array;
}

export function initTraining(data: PreparedData, config: GBRTConfig = DEFAULT_GBRT_CONFIG): TrainingContext {
  const { X, y, nRows } = data;

  // Shuffle indices for train/test split
  const allIdx: number[] = [];
  for (let i = 0; i < nRows; i++) allIdx.push(i);
  for (let i = nRows - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = allIdx[i]; allIdx[i] = allIdx[j]; allIdx[j] = tmp;
  }

  const testSize = Math.max(1, Math.floor(nRows * 0.2));
  const trainSize = nRows - testSize;
  const trainIndices = allIdx.slice(0, trainSize);
  const testIndices = allIdx.slice(trainSize);

  // Build column-major train subset
  const nF = X.length;
  const trainX: Float64Array[] = [];
  for (let f = 0; f < nF; f++) {
    const col = new Float64Array(trainSize);
    for (let i = 0; i < trainSize; i++) col[i] = X[f][trainIndices[i]];
    trainX.push(col);
  }
  const trainY = new Float64Array(trainSize);
  for (let i = 0; i < trainSize; i++) trainY[i] = y[trainIndices[i]];

  // Pre-bin train features only (one-time cost)
  const binned = binFeatures(trainX, trainSize);

  // Intercept = mean(trainY)
  let sum = 0;
  for (let i = 0; i < trainSize; i++) sum += trainY[i];
  const intercept = sum / trainSize;

  const predictions = new Float64Array(trainSize);
  const residuals = new Float64Array(trainSize);
  predictions.fill(intercept);
  for (let i = 0; i < trainSize; i++) {
    residuals[i] = trainY[i] - intercept;
  }

  const model: GBRTModel = {
    trees: [],
    featureNames: data.featureNames.slice(),
    featureImportance: new Array(data.nFeatures).fill(0),
    intercept,
    learningRate: config.learningRate,
  };

  return {
    X: trainX,
    y: trainY,
    residuals,
    predictions,
    featureImportance: new Float64Array(data.nFeatures),
    config,
    model,
    nRows: trainSize,
    nRowsTotal: nRows,
    trainIndices,
    testIndices,
    allX: X,
    allY: y,
    binned,
    histSum: new Float64Array(binned.maxBins),
    histCount: new Uint32Array(binned.maxBins),
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

  // Build tree using histogram-based splitting
  const tree = buildTreeHist(
    ctx.binned, residuals, indices, 0, sampleSize, 0, config,
    ctx.featureImportance, ctx.histSum, ctx.histCount,
  );

  // Update predictions and residuals for ALL rows
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

  // Compute train R²
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
  const trainR2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Compute test R² (out-of-sample)
  const testIdx = ctx.testIndices;
  const nTest = testIdx.length;
  let testR2 = 0;
  if (nTest > 0) {
    let testMeanY = 0;
    for (let i = 0; i < nTest; i++) testMeanY += ctx.allY[testIdx[i]];
    testMeanY /= nTest;

    let testSsRes = 0;
    let testSsTot = 0;
    const fv = new Float64Array(X.length);
    for (let i = 0; i < nTest; i++) {
      const ri = testIdx[i];
      for (let f = 0; f < X.length; f++) fv[f] = ctx.allX[f][ri];
      const pred = predictModel(model, fv);
      const diff = ctx.allY[ri] - pred;
      testSsRes += diff * diff;
      const diffMean = ctx.allY[ri] - testMeanY;
      testSsTot += diffMean * diffMean;
    }
    testR2 = testSsTot > 0 ? 1 - testSsRes / testSsTot : 0;
  }

  return {
    treeIndex,
    trainR2,
    testR2,
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
// ---------------------------------------------------------------------------
// Interactive Partial Dependence Plot
// ---------------------------------------------------------------------------

export interface PDPLine {
  label: string;
  points: { x: number; y: number }[];
}

export interface PDPResult {
  sweepFeatureName: string;
  conditionFeatureName: string | null;
  lines: PDPLine[];
}

/**
 * Generate partial dependence data: sweep one feature while holding others at
 * their means. Optionally condition on a second feature to show multiple curves
 * (e.g., "demand vs price in summer vs winter").
 */
export function generatePDP(
  model: GBRTModel,
  rows: RetailRow[],
  sweepFeature: string,
  conditionFeature: string | null = null,
  numPoints: number = 30,
): PDPResult {
  if (rows.length === 0 || model.trees.length === 0) {
    return { sweepFeatureName: sweepFeature, conditionFeatureName: conditionFeature, lines: [] };
  }

  const sweepIdx = FEATURE_NAMES.indexOf(sweepFeature);
  const condIdx = conditionFeature ? FEATURE_NAMES.indexOf(conditionFeature) : -1;

  // Build feature matrix for averages
  const featureVals = (r: RetailRow): number[] => [
    r.unit_price, r.comp_1, r.month, r.lag_price,
    r.holiday, r.weekday, r.product_score, r.freight_price,
    encodeCategory(r.product_category_name), r.discount,
  ];

  // Split rows into condition groups
  const groups: { label: string; rows: RetailRow[] }[] = [];

  if (conditionFeature && condIdx >= 0) {
    if (conditionFeature === 'month') {
      const summer = rows.filter(r => [6, 7, 8].includes(r.month));
      const winter = rows.filter(r => [12, 1, 2].includes(r.month));
      const other = rows.filter(r => ![6, 7, 8, 12, 1, 2].includes(r.month));
      if (summer.length > 0) groups.push({ label: 'Summer (Jun-Aug)', rows: summer });
      if (winter.length > 0) groups.push({ label: 'Winter (Dec-Feb)', rows: winter });
      if (other.length > 0) groups.push({ label: 'Spring/Fall', rows: other });
    } else if (conditionFeature === 'holiday') {
      const holiday = rows.filter(r => r.holiday === 1);
      const noHoliday = rows.filter(r => r.holiday === 0);
      if (holiday.length > 0) groups.push({ label: 'Holiday', rows: holiday });
      if (noHoliday.length > 0) groups.push({ label: 'Non-Holiday', rows: noHoliday });
    } else {
      // Continuous: median split
      const vals = rows.map(r => featureVals(r)[condIdx]).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      const low = rows.filter(r => featureVals(r)[condIdx] <= median);
      const high = rows.filter(r => featureVals(r)[condIdx] > median);
      const condName = FEATURE_NAMES[condIdx];
      if (low.length > 0) groups.push({ label: `Low ${condName}`, rows: low });
      if (high.length > 0) groups.push({ label: `High ${condName}`, rows: high });
    }
  } else {
    groups.push({ label: 'All Data', rows });
  }

  // Get sweep range from the data
  const allSweepVals = rows.map(r => featureVals(r)[sweepIdx]).sort((a, b) => a - b);
  const sweepMin = allSweepVals[Math.floor(allSweepVals.length * 0.02)];
  const sweepMax = allSweepVals[Math.floor(allSweepVals.length * 0.98)];

  const lines: PDPLine[] = [];

  for (const group of groups) {
    // Compute mean features for this group
    const nF = FEATURE_NAMES.length;
    const avgFeatures = new Float64Array(nF);
    for (const r of group.rows) {
      const fv = featureVals(r);
      for (let f = 0; f < nF; f++) avgFeatures[f] += fv[f];
    }
    for (let f = 0; f < nF; f++) avgFeatures[f] /= group.rows.length;
    // Use first row's category encoding (mean of hashes is meaningless)
    avgFeatures[8] = encodeCategory(group.rows[0].product_category_name);

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      const xVal = sweepMin + (sweepMax - sweepMin) * (i / (numPoints - 1));
      const features = avgFeatures.slice();
      features[sweepIdx] = xVal;
      const yVal = predictModel(model, features);
      pts.push({
        x: Math.round(xVal * 100) / 100,
        y: Math.round(yVal * 10) / 10,
      });
    }
    lines.push({ label: group.label, points: pts });
  }

  return { sweepFeatureName: sweepFeature, conditionFeatureName: conditionFeature, lines };
}

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
    avgFeatures[4] += r.holiday;
    avgFeatures[5] += r.weekday;
    avgFeatures[6] += r.product_score;
    avgFeatures[7] += r.freight_price;
    avgFeatures[9] += r.discount;
  }
  for (let f = 0; f < avgFeatures.length; f++) avgFeatures[f] /= n;
  // Category is not averaged — use the first row's category (all rows should be same product)
  avgFeatures[8] = encodeCategory(rows[0].product_category_name);

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
