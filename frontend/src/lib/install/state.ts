import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { backendAddress, browserOrigin } from "./config";

export const defaultSite = {
  name: "Lost MIDI Archive",
  description: "记录早期网络 MIDI 的作品、人物、历史来源与寻回过程。",
};
export interface InstallationStatus {
  installed: boolean;
  installation_enabled: boolean;
  site: { name: string; description: string };
}
export type InstallationState =
  | { kind: "configuration_required" }
  | { kind: "unavailable" }
  | { kind: "reachable"; status: InstallationStatus };

export function deploymentConfig() {
  // Never reflect malformed environment values (which could contain credentials).
  const backendUrl = backendAddress(process.env.BACKEND_API_URL ?? "");
  const origin = browserOrigin(process.env.ADMIN_ORIGIN ?? "");
  const secureCookie = process.env.ADMIN_COOKIE_SECURE !== "false";
  return { backendUrl, origin, secureCookie, ready: !!backendUrl && !!origin && (!origin.startsWith("https:") || secureCookie) };
}

function isInstallationStatus(value: unknown): value is InstallationStatus {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<InstallationStatus>;
  return typeof data.installed === "boolean" && typeof data.installation_enabled === "boolean"
    && !!data.site && typeof data.site.name === "string" && !!data.site.name.trim()
    && typeof data.site.description === "string";
}

// React cache deduplicates within a request, not across users or deployments.
// connection() keeps installation discovery out of builds/static prerendering.
export const getInstallationState = cache(async (): Promise<InstallationState> => {
  await connection();
  if (!deploymentConfig().backendUrl) return { kind: "configuration_required" };
  try {
    const status = await apiRequest<unknown>("/api/v1/installation");
    if (!isInstallationStatus(status)) return { kind: "unavailable" };
    return { kind: "reachable", status };
  } catch {
    // An outage, old backend, or invalid response must NEVER enable installation.
    return { kind: "unavailable" };
  }
});

export async function installedSite() {
  const state = await getInstallationState();
  return state.kind === "reachable" && state.status.installed ? state.status.site : defaultSite;
}

export async function requireInstallation() {
  const state = await getInstallationState();
  if (state.kind === "configuration_required" || (state.kind === "reachable" && !state.status.installed)) redirect("/install");
  return state.kind === "reachable" ? state.status.site : null;
}
