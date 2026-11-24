export type Slide = { title: string; href: string };
export type FrontDesk = {
  revision: number;
  sayings: string[];
  slides: Slide[];
  announcements: { id: string; title: string; body: string; author: string; published_at: string }[];
};
