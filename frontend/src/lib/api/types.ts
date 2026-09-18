export type ArchiveStatus = "archived" | "partially_recovered" | "lost" | "uncertain";
export interface Credit { person_id: string; display_name: string; role: string }
export interface MidiEntry {
  revision: number;
  id: string; slug: string; title: string; description: string | null;
  estimated_year: number | null; archive_status: ArchiveStatus;
  created_at: string; updated_at: string; copyright_status: string | null;
  license: string | null; rights_holder: string | null; distribution_permission: string | null;
}
export interface Person { id: string; display_name: string; biography: string | null; created_at: string; revision: number }
export interface MidiList {
  data: (MidiEntry & { credits: Credit[] })[];
  pagination: { page: number; pageSize: number; total: number };
}
export interface MidiDetail {
  entry: MidiEntry; credits: Credit[]; people: Person[];
  historical_sources: { id: string; website_name: string; original_url: string | null;
    first_seen_at: string | null; last_seen_at: string | null; wayback_url: string | null; notes: string | null }[];
  recovery_events: { id: string; recovered_at: string | null; recovered_by: string | null;
    recovered_by_name: string | null; story: string; evidence: string | null; created_at: string }[];
  files: { id: string; original_filename: string; sha256: string; file_size: number;
    discovered_at: string | null; created_at: string }[];
}
export interface PersonDetail {
  person: Person; aliases: string[]; midis: { id: string; slug: string; title: string; role: string }[];
}
