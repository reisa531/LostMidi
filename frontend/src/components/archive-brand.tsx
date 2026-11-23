export function ArchiveMark({ size = 24, colors }: {
  size?: number;
  colors?: { paper: string; ink: string; accent: string };
}) {
  const paper = colors?.paper ?? "var(--mark-paper)";
  const ink = colors?.ink ?? "var(--mark-ink)";
  const accent = colors?.accent ?? "var(--mark-accent)";
  return <svg aria-hidden="true" className="archive-mark" width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6H33L42 15V42H6Z" fill={paper} stroke={ink} strokeWidth="3" />
    <path d="M33 6V15H42" fill="none" stroke={ink} strokeWidth="3" />
    <rect x="12" y="30" width="9" height="6" fill={ink} />
    <rect x="21" y="21" width="6" height="6" fill={ink} />
    <rect x="30" y="27" width="6" height="6" fill={accent} />
  </svg>;
}

export function SearchMark() {
  return <span aria-hidden="true" className="search-mark" />;
}
