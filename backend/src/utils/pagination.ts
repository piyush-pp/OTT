import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Clamp (rather than reject) oversized pageSize. Admin dropdowns request
  // pageSize=200 to fetch "all" campaigns/creatives; rejecting would 400 the
  // whole request and leave those dropdowns empty.
  pageSize: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, 200))
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    data: items,
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    }
  };
}
