import "server-only";
import { cache } from "react";
import { ApiError } from "@/lib/api/client";
import { getCatalogOverview } from "@/lib/api/catalog";
import type { CatalogOverview } from "@/lib/api/types";

export type OverviewState = { overview: CatalogOverview } | { unavailable: true };

/** Metadata and page bodies share one overview request per render. */
export const loadOverview = cache(async (): Promise<OverviewState> => {
  try { return { overview: await getCatalogOverview() }; }
  catch (error) { if (error instanceof ApiError) return { unavailable: true }; throw error; }
});
