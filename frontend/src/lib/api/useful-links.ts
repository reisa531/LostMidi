import { apiGet } from "./client";

export interface UsefulLink { id: string; title: string; url: string; description: string; sort_order: number }
export function getUsefulLinks() { return apiGet<UsefulLink[]>("/api/v1/useful-links"); }
