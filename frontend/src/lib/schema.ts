/**
 * schema.org 节点构造器。
 *
 * 所有页面共用同一套语言、URL 与站点标识约定，输出的对象交给 lib/seo.ts 的 jsonLd()
 * 序列化后写进 <script type="application/ld+json">。构造器只处理已知字段：缺失的内容
 * 一律留 undefined，由 JSON.stringify 丢弃，不猜测年代、作者或许可。
 */
import { absoluteUrl } from "./seo";

export const SCHEMA_LANGUAGE = "zh-CN";

/** 面包屑的一步；path 为站内路径，最后一步即当前页面。 */
export type Crumb = { name: string; path: string };
/** 指向站内页面的实体引用。 */
export type EntityRef = { name: string; path: string };

function refNode(type: "Person" | "MusicComposition", ref: EntityRef, origin?: string) {
  return { "@type": type, name: ref.name, url: absoluteUrl(ref.path, origin) ?? undefined };
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : undefined;
}

function publisher(name: string, origin?: string) {
  return { "@type": "Organization", name, url: origin ? `${origin}/` : undefined };
}

export function webSiteId(origin: string) {
  return `${origin}/#website`;
}

export function datasetId(origin: string) {
  return `${origin}/#dataset`;
}

export function breadcrumbList(crumbs: Crumb[], origin?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path, origin) ?? undefined,
    })),
  };
}

/** 档案文章：Article + 关联实体，供 Bing 识别作者、发布时间与主题。 */
export function articleSchema(input: {
  origin?: string; path: string; title: string; description: string; siteName: string;
  authorUsername: string; published?: string | null; modified?: string | null; about?: EntityRef[];
}) {
  const url = absoluteUrl(input.path, input.origin);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description || undefined,
    inLanguage: SCHEMA_LANGUAGE,
    url: url ?? undefined,
    mainEntityOfPage: url ? { "@type": "WebPage", "@id": url } : undefined,
    datePublished: dateOnly(input.published),
    dateModified: dateOnly(input.modified),
    author: { "@type": "Person", name: input.authorUsername },
    publisher: publisher(input.siteName, input.origin),
    isPartOf: input.origin ? { "@id": webSiteId(input.origin) } : undefined,
    about: input.about?.length
      ? input.about.map(item => ({ "@type": "Thing", name: item.name, url: absoluteUrl(item.path, input.origin) ?? undefined }))
      : undefined,
  };
}

/** MIDI 作品档案：MusicComposition，署名按作曲与其他参与者分别表达。 */
export function musicCompositionSchema(input: {
  origin?: string; path: string; title: string; description?: string; identifier: string;
  dateCreated?: string | null; dateModified?: string | null;
  composers: EntityRef[]; contributors: EntityRef[]; dataset?: string | null;
}) {
  const url = absoluteUrl(input.path, input.origin);
  return {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: input.title,
    description: input.description || undefined,
    inLanguage: SCHEMA_LANGUAGE,
    url: url ?? undefined,
    identifier: input.identifier,
    dateCreated: dateOnly(input.dateCreated),
    dateModified: dateOnly(input.dateModified),
    composer: input.composers.length ? input.composers.map(ref => refNode("Person", ref, input.origin)) : undefined,
    creator: input.contributors.length ? input.contributors.map(ref => refNode("Person", ref, input.origin)) : undefined,
    isPartOf: input.dataset ? { "@id": input.dataset } : input.origin ? { "@id": datasetId(input.origin) } : undefined,
  };
}

/** 人物档案：Person，历史昵称与外部主页分别用 alternateName / sameAs 表达。 */
export function personSchema(input: {
  origin?: string; publicId: string; name: string; description: string;
  aliases?: string[]; sameAs?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    description: input.description || undefined,
    inLanguage: SCHEMA_LANGUAGE,
    url: absoluteUrl(`/people/${input.publicId}`, input.origin) ?? undefined,
    alternateName: input.aliases?.length ? input.aliases : undefined,
    sameAs: input.sameAs?.length ? input.sameAs : undefined,
  };
}

/** 档案数据集：站点本身是一份关于早期网络 MIDI 的资料集合。 */
export function datasetSchema(input: {
  origin: string; name: string; description: string; keywords: string[]; sitemapPath?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": datasetId(input.origin),
    name: input.name,
    description: input.description,
    url: `${input.origin}/`,
    inLanguage: SCHEMA_LANGUAGE,
    isAccessibleForFree: true,
    creator: publisher(input.name, input.origin),
    keywords: input.keywords.length ? input.keywords : undefined,
    distribution: input.sitemapPath
      ? [{ "@type": "DataDownload", encodingFormat: "application/xml", contentUrl: absoluteUrl(input.sitemapPath, input.origin) ?? undefined }]
      : undefined,
  };
}
