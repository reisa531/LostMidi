import { apiRead, type ReadOptions } from "./client";

export interface UsefulLink { id: string; title: string; url: string; description: string; sort_order: number }
export function getUsefulLinks(options: ReadOptions = {}) { return apiRead<UsefulLink[]>("/api/v1/useful-links", options); }
