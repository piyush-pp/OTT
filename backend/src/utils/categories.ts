export const CATEGORIES = [
  "Tech",
  "Gaming",
  "Music",
  "Tutorial",
  "Sports",
  "News",
  "Entertainment",
  "Other"
] as const;

export type Category = (typeof CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(CATEGORIES);

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && CATEGORY_SET.has(value);
}
