export type Category = 'Electronics' | 'Clothing' | 'Food' | 'Tools' | 'Hygiene' | 'Documents' | 'Other';
export type PlanStatus = 'draft' | 'active' | 'archived';

export interface Element {
  _id: string;
  name: string;
  description: string;
  weight: number;
  categories: Category[];
  imagePath: string | null;
  isContainer: boolean;
  isReturnable: boolean;
  isLastMinute: boolean;
  defaultContents: (Element | string)[];
  createdAt: string;
  updatedAt: string;
}

export interface TreeNode {
  _id: string;
  elementId: string;
  name: string;
  state: string;
  quantity: number;
  children: TreeNode[];
}

export interface Plan {
  _id: string;
  name: string;
  description: string;
  status: PlanStatus;
  usedElementIds: string[];
  tree: TreeNode[];
  packingProgress: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface PlanTemplate {
  _id: string;
  name: string;
  description: string;
  tree: TreeNode[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnableItem {
  _id: string;
  name: string;
  isLastMinute: boolean;
  imagePath: string | null;
  path: string[];
}

export interface ReturnableResponse {
  lastMinute: ReturnableItem[];
  regular: ReturnableItem[];
}

export interface SearchResult {
  nodeId: string;
  elementId: string;
  name: string;
  breadcrumb: string[];
  state: string;
}

export interface TripPlan {
  _id: string;
  name: string;
  description: string;
  tree: TreeNode[];
  sourcePlanId?: string;
}

export interface Trip {
  _id: string;
  name: string;
  description: string;
  plans: TripPlan[];
  packingProgress: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

/** Legacy type for compatibility if needed, but now Trip is always "with plans" */
export interface TripWithPlans extends Trip {}
