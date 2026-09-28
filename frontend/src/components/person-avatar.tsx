import Image from "next/image";

export function PersonAvatar({ avatar, name, size = 80 }: { avatar: unknown; name: string; size?: number }) {
  const source = typeof avatar === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar) ? avatar : null;
  return <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#e8eee2] shadow-sm" style={{ width: size, height: size }}>
    {source ? <Image src={source} alt={`${name}的头像`} width={size} height={size} unoptimized className="h-full w-full object-cover" />
      : <span aria-label={`${name}的默认头像`} role="img" className="font-serif text-accent" style={{ fontSize: Math.round(size * 0.4) }}>人</span>}
  </div>;
}
