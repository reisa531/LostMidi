import { apiRead, type ReadOptions } from "./client";
import type { MidiDetail, MidiList } from "./types";

export function getMidis(page = 1, pageSize = 20, options: ReadOptions = {}) {
  return apiRead<MidiList>(`/api/v1/midis?page=${page}&pageSize=${pageSize}`, options);
}
export function getMidiBySlug(slug: string, options: ReadOptions = {}) {
  return apiRead<MidiDetail>(`/api/v1/midis/${encodeURIComponent(slug)}`, options);
}
export function getMidiByPublicId(id: string, options: ReadOptions = {}) {
  return apiRead<MidiDetail>(`/api/v1/midis/by-id/${encodeURIComponent(id)}`, options);
}
