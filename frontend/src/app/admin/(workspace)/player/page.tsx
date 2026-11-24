import { requireStaff, adminRequest } from "@/lib/admin/auth";
import { ListeningRoom } from "@/components/admin/listening-room";
import type { Song } from "@/lib/listening-room";
export const metadata = { title:"唱片室" };
export default async function PlayerPage() {
  await requireStaff();
  const songs=await adminRequest<Song[]>("/api/v1/admin/player");
  return <><h1 className="desk-title">唱片室</h1><ListeningRoom songs={songs} /></>;
}
