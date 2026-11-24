import { cookies } from "next/headers";
import { sessionCookie } from "@/lib/admin/auth";

export async function GET(request: Request, { params }: { params: Promise<{kind:string;id:string}> }) {
  const {kind,id} = await params;
  if (!["asset","file"].includes(kind) || !/^[1-9]\d{0,17}$/.test(id)) return new Response(null,{status:404});
  const token=(await cookies()).get(sessionCookie)?.value;
  const headers=new Headers({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
  if (!token) return new Response(null,{status:401,headers});
  const upstream=new Headers({Authorization:"Bearer "+token});
  const range=request.headers.get("range");
  if (range) upstream.set("Range",range);
  const result=await fetch(process.env.BACKEND_API_URL+"/api/v1/admin/player/"+kind+"/"+id,{cache:"no-store",headers:upstream,signal:request.signal,redirect:"error"});
  for (const key of ["content-type","content-length","content-range","accept-ranges"]) {
    const value=result.headers.get(key); if(value) headers.set(key,value);
  }
  return new Response(result.body,{status:result.status,headers});
}
