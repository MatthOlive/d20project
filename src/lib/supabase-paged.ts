import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all rows from a Supabase table, bypassing the default 1000-row limit
 * by paging via `.range()`. Use for catalogs that may exceed 2000 entries
 * (species, moves, abilities).
 */
export async function fetchAllPaged<T = unknown>(
  table: string,
  select: string,
  opts?: { orderBy?: string; ascending?: boolean; pageSize?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const orderBy = opts?.orderBy;
  const ascending = opts?.ascending ?? true;
  const all: T[] = [];
  let from = 0;
  // Safety cap to prevent runaway loops.
  for (let i = 0; i < 50; i++) {
    let q = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      .select(select)
      .range(from, from + pageSize - 1);
    if (orderBy) q = q.order(orderBy, { ascending });
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
