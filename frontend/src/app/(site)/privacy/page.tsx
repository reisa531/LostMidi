import Link from "next/link";
import { Section } from "@/components/archive";
import { CookieDetails } from "@/components/cookie-notice";

export const metadata = {
  title: "Cookie 与隐私说明",
  description: "了解 LostMidi 的登录 Cookie、访问统计和外部视频，自行设置访问偏好。",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Cookie 与隐私说明", url: "/privacy" },
};

export default function PrivacyPage() {
  return <article className="mx-auto max-w-3xl">
    <h1 className="my-6 font-serif text-4xl">Cookie 与隐私说明</h1>
    <p>你可以只用必要功能浏览 LostMidi。访问统计和外部视频由你分别选择，随时可以撤回。</p>
    <p className="my-5"><CookieDetails /></p>
    <Section title="本站保存什么">
      <p><strong>登录会话</strong>　登录成功后，LostMidi 会设置 <code>lostmidi_admin</code>，供工作台识别你的身份。它只在工作台路径下发送，有效期为 8 小时，退出登录时清除。</p>
      <p><strong>访问偏好</strong>　做出选择后，本站会用 <code>lostmidi_consent</code> 在此浏览器记住横幅版本、选择和时间，保留 180 天。更改设置会更新记录。到期、清除 Cookie 或本文所列用途发生变更后，本站会再次询问。</p>
      <p><strong>注册与草稿</strong>　注册页会连接 Cloudflare Turnstile，核验注册请求。工作台的文字草稿暂存在当前浏览器标签页，供你继续编辑。</p>
    </Section>
    <Section title="可选的外部服务">
      <p><strong>Vercel 访问统计</strong>　开启后，本站会把页面访问事件发送给 Vercel，用于了解哪些页面有人访问。这项统计不使用统计 Cookie。</p>
      <p><strong>哔哩哔哩播放器</strong>　开启后，仍需点击「载入 B 站视频」才会连接哔哩哔哩。对方会收到播放器请求，并可能按其自身政策读取或设置 Cookie。关闭偏好会移除本站页面中已载入的播放器。你也可以直接前往 B 站观看。</p>
    </Section>
    <Section title="更改选择或联系我们"><p>页脚的「Cookie 设置」会显示你上次保存的选择。若对数据使用有疑问，可通过联系页找到站长。</p>
      <Link className="archive-link" href="/about#contact">联系站长</Link></Section>
  </article>;
}
