import type { Element, Plan, PlanTemplate, ReturnableResponse, SearchResult, TreeNode } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Items
export const getItems = (params: Record<string, string> = {}): Promise<Element[]> => {
  const qs = new URLSearchParams(params).toString();
  return request<Element[]>(`/items${qs ? '?' + qs : ''}`);
};
export const getItem    = (id: string): Promise<Element> => request<Element>(`/items/${id}`);
export const createItem = (fd: FormData): Promise<Element> =>
  request<Element>('/items', { method: 'POST', body: fd });
export const updateItem = (id: string, fd: FormData): Promise<Element> =>
  request<Element>(`/items/${id}`, { method: 'PATCH', body: fd });
export const deleteItem = (id: string): Promise<{ deleted: boolean }> =>
  request(`/items/${id}`, { method: 'DELETE' });

// Plans
export const getPlans   = (): Promise<Plan[]>          => request<Plan[]>('/plans');
export const getPlan    = (id: string): Promise<Plan>  => request<Plan>(`/plans/${id}`);
export const createPlan = (data: { name: string; description: string }): Promise<Plan> =>
  request<Plan>('/plans', { ...json(data), method: 'POST' });
export const updatePlan = (id: string, data: Partial<Plan>): Promise<Plan> =>
  request<Plan>(`/plans/${id}`, { ...json(data), method: 'PATCH' });
export const deletePlan = (id: string): Promise<{ deleted: boolean }> =>
  request(`/plans/${id}`, { method: 'DELETE' });

export const addElementToPlan = (
  planId: string, body: { elementId: string; parentNodeId?: string },
): Promise<Plan> => request<Plan>(`/plans/${planId}/add-element`, json(body));

export const removeElementFromPlan = (
  planId: string, body: { nodeId: string },
): Promise<Plan> => request<Plan>(`/plans/${planId}/remove-element`, json(body));

export const reorderPlan = (
  planId: string, body: { parentNodeId: string | null; orderedNodeIds: string[] },
): Promise<Plan> => request<Plan>(`/plans/${planId}/reorder`, json(body));

export const moveNode = (
  planId: string, body: { nodeId: string; targetParentId: string | null; targetIndex: number },
): Promise<Plan> => request<Plan>(`/plans/${planId}/move-node`, json(body));

export const injectTemplate = (
  planId: string, body: { templateId: string; parentNodeId?: string },
): Promise<Plan> => request<Plan>(`/plans/${planId}/inject-template`, json(body));

export const getReturnableList = (planId: string): Promise<ReturnableResponse> =>
  request<ReturnableResponse>(`/plans/${planId}/returnable`);

// Templates
export const getTemplates = (): Promise<PlanTemplate[]> =>
  request<PlanTemplate[]>('/plans/templates/list');
export const createTemplate = (data: { name: string; description?: string; sourcePlanId?: string }): Promise<PlanTemplate> =>
  request<PlanTemplate>('/plans/templates/create', json(data));
export const updateTemplate = (id: string, data: Partial<PlanTemplate>): Promise<PlanTemplate> =>
  request<PlanTemplate>(`/plans/templates/${id}`, { ...json(data), method: 'PATCH' });
export const deleteTemplate = (id: string): Promise<{ deleted: boolean }> =>
  request(`/plans/templates/${id}`, { method: 'DELETE' });

// Search
export const searchItems = (q: string, planId?: string): Promise<SearchResult[]> => {
  const qs = new URLSearchParams({ q, ...(planId ? { planId } : {}) }).toString();
  return request<SearchResult[]>(`/search?${qs}`);
};

// QR
export const getQrUrl  = (planId: string, nodeId: string): string =>
  `${BASE}/api/qr/${planId}/${nodeId}`;
export const getQrData = (planId: string, nodeId: string): Promise<{ planId: string; planName: string; node: TreeNode }> =>
  request(`/qr/${planId}/${nodeId}/data`);

// Data export / import
export const getExportUrl = (include: string[]): string =>
  `${BASE}/api/data/export?include=${include.join(',')}`;

export const importData = (body: {
  bundle: unknown;
  mode: 'merge' | 'replace';
  include: string[];
}): Promise<{ success: boolean; mode: string; report: Record<string, number> }> =>
  request('/data/import', json(body));

export const getDataStats = (): Promise<{ items: number; plans: number; templates: number }> =>
  request('/data/stats');

// Template tree manipulation (mirrors plan methods)
export const getTemplate = (id: string): Promise<PlanTemplate> =>
  request<PlanTemplate>(`/plans/templates/${id}`);

export const addElementToTemplate = (
  tmplId: string, body: { elementId: string; parentNodeId?: string },
): Promise<PlanTemplate> => request<PlanTemplate>(`/plans/templates/${tmplId}/add-element`, json(body));

export const removeElementFromTemplate = (
  tmplId: string, body: { nodeId: string },
): Promise<PlanTemplate> => request<PlanTemplate>(`/plans/templates/${tmplId}/remove-element`, json(body));

export const reorderTemplate = (
  tmplId: string, body: { parentNodeId: string | null; orderedNodeIds: string[] },
): Promise<PlanTemplate> => request<PlanTemplate>(`/plans/templates/${tmplId}/reorder`, json(body));

export const moveTemplateNode = (
  tmplId: string, body: { nodeId: string; targetParentId: string | null; targetIndex: number },
): Promise<PlanTemplate> => request<PlanTemplate>(`/plans/templates/${tmplId}/move-node`, json(body));

// Packing progress
export const savePackingProgress = (
  planId: string, progress: Record<string, boolean>,
): Promise<{ ok: boolean }> =>
  request(`/plans/${planId}/packing-progress`, { ...json({ progress }), method: 'PATCH' });

// Node quantity
export const setNodeQuantity = (
  planId: string, body: { nodeId: string; quantity: number },
): Promise<import('../types').Plan> =>
  request(`/plans/${planId}/node-quantity`, { ...json(body), method: 'PATCH' });

// Merge plans
export const mergePlans = (
  targetPlanId: string, body: { sourcePlanId: string },
): Promise<import('../types').Plan> =>
  request(`/plans/${targetPlanId}/merge`, json(body));

// Trips
import type { Trip, TripWithPlans } from '../types';

export const getTrips = (): Promise<Trip[]> => request<Trip[]>('/trips');
export const getTrip  = (id: string): Promise<TripWithPlans> => request<TripWithPlans>(`/trips/${id}`);
export const createTrip = (data: { name: string; description?: string; planIds?: string[] }): Promise<Trip> =>
  request<Trip>('/trips', { ...json(data), method: 'POST' });
export const updateTrip = (id: string, data: Partial<Trip>): Promise<Trip> =>
  request<Trip>(`/trips/${id}`, { ...json(data), method: 'PATCH' });
export const deleteTrip = (id: string): Promise<{ deleted: boolean }> =>
  request(`/trips/${id}`, { method: 'DELETE' });
export const addPlanToTrip = (tripId: string, planId: string): Promise<Trip> =>
  request<Trip>(`/trips/${tripId}/add-plan`, json({ planId }));
export const removePlanFromTrip = (tripId: string, planId: string): Promise<Trip> =>
  request<Trip>(`/trips/${tripId}/remove-plan/${planId}`, { method: 'DELETE' });
export const saveTripProgress = (tripId: string, progress: Record<string, boolean>): Promise<{ ok: boolean }> =>
  request(`/trips/${tripId}/packing-progress`, { ...json({ progress }), method: 'PATCH' });

export const removeElementFromTrip = (tripId: string, nodeId: string): Promise<Trip> =>
  request<Trip>(`/trips/${tripId}/remove-element`, { ...json({ nodeId }), method: 'POST' });

export const resolveTripConflict = (tripId: string, elementId: string, keepInPlanId: string): Promise<Trip> =>
  request<Trip>(`/trips/${tripId}/resolve-conflict`, { ...json({ elementId, keepInPlanId }), method: 'POST' });

export const syncTripPlans = (tripId: string): Promise<Trip> =>
  request<Trip>(`/trips/${tripId}/sync`, { method: 'POST' });
