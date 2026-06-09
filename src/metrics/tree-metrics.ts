import { ProcurementMatchDeliverable } from "../types/index.js";

export interface TreeMetrics {
  structureValid: boolean;
  totalNodes: number;
  level1Count: number;
  level2Count: number;
  leafCount: number;
  maxDepth: number;
  sourceCoverage: number;
  consolidationRate: number;
  priorityEntropy: number;
  confidenceEntropy: number;
  treeBalance: number;
}

export function computeMetrics(
  tree: ProcurementMatchDeliverable[],
  totalChunks: number
): TreeMetrics {
  const leaves: ProcurementMatchDeliverable[] = [];
  let level1Count = 0;
  let level2Count = 0;
  let maxDepth = 0;
  let totalNodes = 0;

  const walk = (node: ProcurementMatchDeliverable, depth: number): void => {
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    if (depth === 1) level1Count++;
    else if (depth === 2) level2Count++;

    if (node.deliverableArray.length === 0) {
      leaves.push(node);
    } else {
      for (const child of node.deliverableArray) walk(child, depth + 1);
    }
  };

  for (const node of tree) walk(node, 1);

  const referencedChunks = new Set<string>();
  let multiChunkLeaves = 0;

  for (const leaf of leaves) {
    for (const id of leaf.procurementDocumentChunkIdArray) referencedChunks.add(id);
    if (leaf.procurementDocumentChunkIdArray.length > 1) multiChunkLeaves++;
  }

  const sourceCoverage = totalChunks > 0 ? referencedChunks.size / totalChunks : 0;
  const consolidationRate = leaves.length > 0 ? multiChunkLeaves / leaves.length : 0;

  const priorities = leaves.map((l) => l.priority);
  const confidences = leaves.map((l) => String(l.confidence));

  const priorityEntropy = shannonEntropy(frequencies(priorities));
  const confidenceEntropy = shannonEntropy(frequencies(confidences));

  const leafCounts = tree.map((l1) => countLeaves(l1));
  const treeBalance = 1 - giniCoefficient(leafCounts);

  return {
    structureValid: tree.length > 0 && leaves.length > 0,
    totalNodes,
    level1Count,
    level2Count,
    leafCount: leaves.length,
    maxDepth,
    sourceCoverage,
    consolidationRate,
    priorityEntropy,
    confidenceEntropy,
    treeBalance,
  };
}

function countLeaves(node: ProcurementMatchDeliverable): number {
  if (node.deliverableArray.length === 0) return 1;
  return node.deliverableArray.reduce((sum, child) => sum + countLeaves(child), 0);
}

function frequencies(values: string[]): number[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.values());
}

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function giniCoefficient(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return sum / (n * n * mean);
}
