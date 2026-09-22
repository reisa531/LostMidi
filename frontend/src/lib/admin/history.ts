import type { MidiDetail, MidiEntry } from "@/lib/api/types";

export type HistoricalSource = MidiDetail["historical_sources"][number];
export type RecoveryEvent = MidiDetail["recovery_events"][number];
export interface HistoryEdit {
  entry: Pick<MidiEntry, "id" | "title" | "slug" | "revision">;
  historical_sources: HistoricalSource[];
  recovery_events: RecoveryEvent[];
}
