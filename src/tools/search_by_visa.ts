/**
 * search_by_visa tool — all occupations eligible for a given visa subclass.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

const VALID_SUBCLASSES = ["189", "190", "491", "482", "186", "494", "485"];

interface OccupationItem {
  code: string;
  slug: string;
  title: string;
  occupationLists: string[];
  visaSubclasses: string[];
  stateNominations: string[];
  assessingAuthority?: string[];
}

export async function searchByVisa(subclass: string, limit: number): Promise<ToolResult> {
  if (!subclass || !VALID_SUBCLASSES.includes(subclass)) {
    return toolError(`subclass must be one of: ${VALID_SUBCLASSES.join(", ")}`);
  }

  const cap = Math.min(Math.max(1, limit), 200);

  try {
    const res = await apiFetch(`/anzsco?visaSubclass=${subclass}&pageSize=${cap}`) as {
      success: boolean;
      data: { page: number; pageSize: number; total: number; items: OccupationItem[] };
    };

    const items = res?.data?.items ?? [];
    const total = res?.data?.total ?? items.length;

    const result = {
      visaSubclass: subclass,
      totalMatched: total,
      totalReturned: items.length,
      occupations: items.map((o) => ({
        code: o.code,
        title: o.title,
        occupationLists: o.occupationLists,
        assessingAuthority: o.assessingAuthority ?? [],
        stateNominations: o.stateNominations,
      })),
      note: `Showing ${items.length} of ${total} occupations eligible for visa subclass ${subclass}.`,
    };

    return toolResult(result, `anzsco.com.au/api/anzsco?visaSubclass=${subclass}`, "2026-04-26");
  } catch (err) {
    return toolError(`Failed to search by visa ${subclass}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
