import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/ui";
import { MidiForm } from "@/components/admin/midi-form";
export const metadata = { title: "新增 MIDI 档案" };
export default async function NewMidi() {
  const session = await requireAdmin();
  return <><AdminPageHeader eyebrow="Collection / New" title="新增 MIDI 档案" description="作品资料与可选 MIDI 文件一次保存；没有音源，也能先记录线索。" /><MidiForm importEnabled={session.midi_import_enabled === true} /></>;
}
