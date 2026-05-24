import type { TreeNode, Element } from '../types';

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null || isNaN(grams)) return '—';
  if (grams >= 1000) return `${(grams / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`;
  return `${grams} g`;
}

export function calcTreeWeight(
  nodes: TreeNode[] = [],
  elementMap: Record<string, Element>,
  excludedNodeIds: string[] = []
): number {
  let total = 0;
  if (!Array.isArray(nodes)) return 0;
  for (const node of nodes) {
    if (excludedNodeIds.includes(node._id)) continue;
    
    const el = elementMap[node.elementId];
    const qty = node.quantity ?? 1;
    total += (el?.weight ?? 0) * qty;
    
    if (node.children?.length) {
      total += calcTreeWeight(node.children, elementMap, excludedNodeIds);
    }
  }
  return total;
}
