import type { Metadata } from "next";
import { requireInstallation } from "@/lib/install/state";
import { InstallationUnavailable } from "@/components/install/unavailable";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function AdminRoot({ children }: { children: React.ReactNode }) {
  if (!(await requireInstallation())) return <InstallationUnavailable />;
  return children;
}
