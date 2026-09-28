import { NextResponse } from "next/server";
import { apiGet, ApiError } from "@/lib/api/client";

export async function GET() {
  try {
    const captcha = await apiGet<{ id: string; svg: string }>("/api/v1/admin/register/captcha");
    return NextResponse.json(captcha, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiError && error.status === 429 ? 429 : 503;
    return NextResponse.json({ error: "验证码暂时无法加载，请稍后重试。" },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
