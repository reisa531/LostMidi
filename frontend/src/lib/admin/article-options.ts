import "server-only";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";

export type ArticleOption = { id: string; label: string };
export async function articleOptions() {
  const [firstMidis, firstPeople] = await Promise.all([
    getCatalogEntries({ page: 1, pageSize: 100, sort: "title" }),
    getCatalogPeople({ page: 1, pageSize: 100 }),
  ]);
  const midiPages = Math.ceil(firstMidis.pagination.total / 100);
  const peoplePages = Math.ceil(firstPeople.pagination.total / 100);
  const moreMidis = [];
  for (let start = 2; start <= midiPages; start += 4)
    moreMidis.push(...await Promise.all(Array.from({ length: Math.min(4, midiPages - start + 1) }, (_, index) =>
      getCatalogEntries({ page: start + index, pageSize: 100, sort: "title" }))));
  const morePeople = [];
  for (let start = 2; start <= peoplePages; start += 4)
    morePeople.push(...await Promise.all(Array.from({ length: Math.min(4, peoplePages - start + 1) }, (_, index) =>
      getCatalogPeople({ page: start + index, pageSize: 100 }))));
  return {
    midis: [firstMidis, ...moreMidis].flatMap(page => page.data.map(item => ({ id: item.id, label: `${item.title} · #${item.id}` }))),
    people: [firstPeople, ...morePeople].flatMap(page => page.data.map(item => ({ id: item.id, label: `${item.display_name} · #${item.id}` }))),
  };
}
