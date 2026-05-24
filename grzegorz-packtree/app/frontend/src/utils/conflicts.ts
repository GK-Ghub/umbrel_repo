import type { Plan, TreeNode, Element } from '../types';

export interface ConflictInfo {
  /** elementId → array of unique plan identifiers (e.g. "Name (ID)") that contain it */
  elementConflicts: Record<string, string[]>;
  /** nodeId → list of other plan names that also have this element */
  nodeConflictMap: Record<string, string>;
  /** total number of conflicting elements */
  conflictCount: number;
}

/**
 * Scan all plans in a trip and find elements that appear in more than one plan.
 * Returns a map of elementId → [planInfo, ...] for duplicates,
 * and nodeId → "conflicting plan names" for highlighting individual nodes.
 */
export function detectConflicts(
  plans: Plan[] = [], 
  excludedNodeIds: string[] = [],
  elementMap: Record<string, Element> = {}
): ConflictInfo {
  // First pass: map elementId → Set of plan IDs
  const elementToPlanIds: Record<string, Set<string>> = {};
  const planMap: Record<string, Plan> = {};

  for (const plan of plans) {
    if (!plan || !plan.tree) continue;
    planMap[plan._id] = plan;
    const elemIds = collectElementIds(plan.tree, excludedNodeIds, elementMap);
    for (const eid of elemIds) {
      if (!elementToPlanIds[eid]) elementToPlanIds[eid] = new Set();
      elementToPlanIds[eid].add(plan._id);
    }
  }

  // Identify conflicting elements (present in 2+ plans)
  const elementConflicts: Record<string, string[]> = {};
  for (const [eid, planIds] of Object.entries(elementToPlanIds)) {
    if (planIds.size > 1) {
      elementConflicts[eid] = Array.from(planIds).map(id => planMap[id]?.name || 'Unknown');
    }
  }

  // Second pass: map nodeId → "other plan names"
  const nodeConflictMap: Record<string, string> = {};

  for (const plan of plans) {
    if (!plan || !plan.tree) continue;
    walkNodes(plan.tree, (node) => {
      if (excludedNodeIds.includes(node._id)) return;
      
      const eid = node.elementId;
      if (elementConflicts[eid]) {
        const otherPlanIds = Array.from(elementToPlanIds[eid]).filter(id => id !== plan._id);
        if (otherPlanIds.length > 0) {
          nodeConflictMap[node._id] = otherPlanIds.map(id => planMap[id].name).join(', ');
        }
      }
    }, excludedNodeIds);
  }

  return {
    elementConflicts,
    nodeConflictMap,
    conflictCount: Object.keys(elementConflicts).length,
  };
}

function collectElementIds(
  nodes: TreeNode[], 
  excludedNodeIds: string[],
  elementMap: Record<string, Element>
): string[] {
  const ids: string[] = [];
  for (const n of nodes) {
    if (excludedNodeIds.includes(n._id)) continue;
    
    const element = elementMap[n.elementId];
    // Heuristic: if element is explicitly marked as container OR it has children, treat it as container
    const isContainer = element ? element.isContainer : (n.children && n.children.length > 0);
    
    if (!isContainer) {
      ids.push(n.elementId);
    }
    
    if (n.children?.length) {
      ids.push(...collectElementIds(n.children, excludedNodeIds, elementMap));
    }
  }
  return ids;
}

function walkNodes(nodes: TreeNode[], cb: (node: TreeNode) => void, excludedNodeIds: string[]): void {
  for (const n of nodes) {
    if (excludedNodeIds.includes(n._id)) continue;
    cb(n);
    if (n.children?.length) walkNodes(n.children, cb, excludedNodeIds);
  }
}
