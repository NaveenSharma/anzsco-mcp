/**
 * search_by_state tool — all occupations nominated by a given state.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

const VALID_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

interface OccupationItem {
  code: string;
  slug: string;
  title: string;
  occupationLists: string[];
  visaSubclasses: string[];
  stateNominations: string[];
  assessingAuthority?: string[];
}

export async function searchByState(stateCode: string, limit: number): Promise<ToolResult> {
  if (!stateCode || !VALID_STATES.includes(stateCode)) {
    return toolError(`stateCode must be one of: ${VALID_STATES.join(", ")}`);
  }

  const cap = Math.min(Math.max(1, limit), 200);

  try {
    const res = await apiFetch(`/anzsco?stateNomination=${stateCode}&pageSize=${cap}`) as {
      success: boolean;
      data: { page: number; pageSize: number; total: number; items: OccupationItem[] };
    };

    const items = res?.data?.items ?? [];
    const total = res?.data?.total ?? items.length;

    const result = {
      stateCode,
      stateName: STATE_NAMES[stateCode],
      totalMatched: total,
      totalReturned: items.length,
      occupations: items.map((o) => ({
        code: o.code,
        title: o.title,
        occupationLists: o.occupationLists,
        assessingAuthority: o.assessingAuthority ?? [],
        eligibleVisas: o.visaSubclasses,
      })),
      note: `Showing ${items.length} of ${total} occupations on ${STATE_NAMES[stateCode]}'s skills list.`,
      dataSource: "Compiled from state migration websites (April 2026)",
    };

    return toolResult(result, `anzsco.com.au/api/anzsco?stateNomination=${stateCode}`, "2026-04-26");
  } catch (err) {
    return toolError(`Failed to search by state ${stateCode}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
