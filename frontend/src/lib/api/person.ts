import { apiRead, type ReadOptions } from "./client";
import type { PersonDetail } from "./types";

export function getPersonById(id: string, options: ReadOptions = {}) {
  return apiRead<PersonDetail>(`/api/v1/people/${encodeURIComponent(id)}`, options);
}
