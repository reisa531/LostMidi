import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/ui";
import { MidiForm } from "@/components/admin/midi-form";
export const metadata = { title: "新增音乐条目" };
export default async function NewMidi() {
  const session = await requireAdmin();
  return <><AdminPageHeader eyebrow="档案 / 新建" title={"新增音乐条目"} description={"一次保存作品资料与可选音乐文件；暂无音源也可先记录线索。"} /><MidiForm importEnabled={session.midi_import_enabled === true} reviewRequired={session.role === "maintainer"} /></>;
}
