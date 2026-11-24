"use client";
import { useActionState } from "react";
import type { FrontDesk } from "@/lib/front-desk";
import { saveDesk, publishAnnouncement } from "@/lib/admin/desk-actions";

export function FrontDeskEditor({ desk, owner }: { desk: FrontDesk; owner: boolean }) {
  const [status, save, saving] = useActionState(saveDesk.bind(null, desk.slides), "");
  const [receipt, publish, publishing] = useActionState(publishAnnouncement, "");
  return <div className="desk-edit">
    <form action={save}><h2>首页一言</h2><input type="hidden" name="revision" value={desk.revision} />
      <label>一言<textarea name="sayings" rows={4} defaultValue={desk.sayings.join("\n")} /></label>
      <small>每行一句，每次打开或刷新首页随机抽一句。摘录视频标题可填写「原句 | 来源说明 | BV号」。</small>
      <button disabled={saving}>保存一言</button><p role="status">{status}</p>
    </form>
    {owner && <form action={publish}><h2>张贴公告</h2>
      <label>标题<input required name="title" maxLength={80} /></label>
      <label>正文<textarea required name="body" rows={5} maxLength={2000} /></label>
      <button disabled={publishing}>发布到首页</button><p role="status">{receipt}</p>
    </form>}
  </div>;
}
