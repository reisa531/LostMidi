import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/ui";
import { MidiForm } from "@/components/admin/midi-form";
export const metadata = { title: "新增 MIDI 档案" };
export default async function NewMidi() {
  await requireAdmin();
  return <><AdminPageHeader eyebrow="Collection / New" title="新增 MIDI 档案" description="创建作品基础资料。保存后会立即显示在公开档案站点。" /><MidiForm /></>;
}
