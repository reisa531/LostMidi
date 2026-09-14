import { apiGet } from "./client";
import type { PersonDetail } from "./types";

export function getPersonById(id: string) {
  return apiGet<PersonDetail>(`/api/v1/people/${encodeURIComponent(id)}`);
}
