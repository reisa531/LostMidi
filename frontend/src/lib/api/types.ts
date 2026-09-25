export type ArchiveStatus = "archived" | "partially_recovered" | "lost" | "uncertain";
export interface Credit { person_id: string; display_name: string; role: string }
export interface MidiEntry {
  revision: number;
  id: string; public_id: string; slug: string; title: string; description: string | null;
  estimated_year: number | null; estimated_date: string | null; archive_status: ArchiveStatus;
  created_at: string; updated_at: string; copyright_status: string | null;
  license: string | null; rights_holder: string | null; distribution_permission: string | null;
}
export interface Person { id: string; public_id: string; display_name: string; biography: string | null; summary: string | null; profile: PersonProfile; created_at: string; updated_at: string; revision: number }
export type PersonProfile = Record<string, unknown>;
export interface MidiList {
  data: (MidiEntry & { credits: Credit[] })[];
  pagination: { page: number; pageSize: number; total: number };
}
export interface MidiDetail {
  entry: MidiEntry; credits: Credit[]; people: Person[];
  historical_sources: { id: string; website_name: string; original_url: string | null;
    first_seen_at: string | null; last_seen_at: string | null; wayback_url: string | null; notes: string | null;
    source_type: string; credibility: number; checked_at: string | null; evidence_files?: EvidenceFile[] }[];
  recovery_events: { id: string; recovered_at: string | null; recovered_by: string | null;
    recovered_by_name: string | null; story: string; evidence: string | null; created_at: string; evidence_files?: EvidenceFile[] }[];
  files: { id: string; original_filename: string; sha256: string; file_size: number;
    discovered_at: string | null; created_at: string; download_available: boolean }[];
}
export interface EvidenceFile { id: string; filename: string; media_type: string; sha256: string; file_size: number; created_at: string }
export interface PersonDetail {
  person: Person; aliases: string[]; midis: { id: string; public_id: string; slug: string; title: string; role: string }[];
  previous: Person | null; next: Person | null;
}

export interface CatalogPagination { page: number; pageSize: number; total: number }
export interface CatalogEntry {
  id: string; public_id: string; slug: string; title: string; estimated_year: number | null; estimated_date: string | null;
  archive_status: ArchiveStatus; updated_at: string; credits: Credit[];
  sources: string[]; file_count: number; downloadable_file_count: number;
}
export interface CatalogOverview {
  stats: {
    entries: number; people: number; files: number; with_files: number;
    downloadable: number; sources: number; statuses: Record<ArchiveStatus, number>;
  };
  recent: CatalogEntry[];
  needs_attention: CatalogEntry[];
}
export interface CatalogEntries { data: CatalogEntry[]; pagination: CatalogPagination }
export interface CatalogPeople {
  data: { id: string; public_id: string; display_name: string; biography: string | null; summary: string | null; updated_at: string; aliases: string[]; midi_count: number }[];
  pagination: CatalogPagination;
}
export interface CatalogGroup { key: string; label: string; entries: number; with_files: number; downloadable: number }
export interface CatalogGroups { data: CatalogGroup[]; pagination: CatalogPagination }
