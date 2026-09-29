"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { manageMusicFileAction, type FileManagementState } from "@/lib/admin/file-management-actions";

export function MidiFileManagement({ midiId, fileId, revision, publicDownload, downloadAvailable, reviewRequired }: {
  midiId: string; fileId: string; revision: number; publicDownload: boolean; downloadAvailable: boolean; reviewRequired: boolean;
}) {
  const router = useRouter();
  const [visibility, visibilityAction, visibilityPending] = useActionState<FileManagementState, FormData>(manageMusicFileAction, { error: "" });
  const [deletion, deletionAction, deletionPending] = useActionState<FileManagementState, FormData>(manageMusicFileAction, { error: "" });
  useEffect(() => { if (visibility.done || deletion.done) router.refresh(); }, [visibility.done, deletion.done, router]);
  const disabled = visibilityPending || deletionPending;
  return <div className="space-y-3">
    <p className="text-xs text-muted">{downloadAvailable ? "访客可下载" : publicDownload ? "文件已设为公开，但条目分发许可暂不允许下载" : "仅后台保存，访客不可下载"}</p>
    <div className="flex flex-wrap gap-4 text-sm">
      <form action={visibilityAction}>
        <input type="hidden" name="midi_id" value={midiId} /><input type="hidden" name="file_id" value={fileId} />
        <input type="hidden" name="revision" value={revision} /><input type="hidden" name="intent" value="visibility" />
        <input type="hidden" name="public_download_enabled" value={publicDownload ? "false" : "true"} />
        <button type="submit" disabled={disabled} className="underline disabled:opacity-50">{publicDownload ? "关闭访客下载" : "开放访客下载"}</button>
      </form>
      <form action={deletionAction} onSubmit={event => {
        if (!window.confirm("确定从此音乐条目移除该文件？移除后访客将无法下载。")) event.preventDefault();
      }}>
        <input type="hidden" name="midi_id" value={midiId} /><input type="hidden" name="file_id" value={fileId} />
        <input type="hidden" name="revision" value={revision} /><input type="hidden" name="intent" value="delete" />
        <button type="submit" disabled={disabled} className="text-red-800 underline disabled:opacity-50">移除文件</button>
      </form>
    </div>
    {(visibility.error || deletion.error) && <p role="alert" className="text-sm text-red-800">{visibility.error || deletion.error}</p>}
    {(visibility.queued || deletion.queued) && <p role="status" className="text-sm text-amber-900">{reviewRequired ? "申请已提交，等待超级管理员审核。" : "申请已提交。"}</p>}
    {(visibility.done || deletion.done) && <p role="status" className="text-sm text-green-900">操作已完成，文件列表正在刷新。</p>}
  </div>;
}
