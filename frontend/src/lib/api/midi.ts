import { apiGet } from "./client";
import type { MidiDetail, MidiList } from "./types";

export function getMidis(page = 1, pageSize = 20) {
  return apiGet<MidiList>(`/api/v1/midis?page=${page}&pageSize=${pageSize}`);
}
export function getMidiBySlug(slug: string) {
  return apiGet<MidiDetail>(`/api/v1/midis/${encodeURIComponent(slug)}`);
}
export function getMidiByPublicId(id: string) {
  return apiGet<MidiDetail>(`/api/v1/midis/by-id/${encodeURIComponent(id)}`);
}
