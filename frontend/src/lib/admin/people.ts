import "server-only";
import { adminRequest } from "./auth";
import type { Person } from "@/lib/api/types";
export interface PeopleList { data: Person[]; pagination: { page: number; pageSize: number; total: number } }
export interface PersonEdit { person: Person; aliases: string[] }
export interface CreditEdit { revision: number; credits: { person_id: string; display_name: string; role: string }[] }
export function getPeople(page = 1) { return adminRequest<PeopleList>(`/api/v1/admin/people?page=${page}&pageSize=100`); }
