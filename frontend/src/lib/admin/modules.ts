export const adminModules = [
  { key: "overview", href: "/admin", label: "工作台", description: "查看档案概况与工作入口。", status: "available" },
  { key: "midis", href: "/admin/midis", label: "MIDI 档案", description: "新增和编辑作品基础资料，维护归档状态与权利信息。", status: "available" },
  { key: "people", href: "/admin/people", label: "人物管理", description: "维护人物资料和历史昵称，通过作品编辑页管理署名。", status: "available" },
  { key: "recovery", href: null, label: "来源与寻回", description: "整理历史网站、证据与寻回过程。", status: "planned" },
] as const;

export const adminNavigation = [
  ...adminModules.flatMap(module => module.href ? [{ href: module.href, label: module.label }] : []),
  { href: "/admin/modules", label: "管理功能" },
];
