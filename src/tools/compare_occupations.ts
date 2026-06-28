/**
 * compare_occupations tool — side-by-side comparison of multiple ANZSCO codes.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

interface OccupationSummary {
  code: string;
  slug: string;
  title: string;
  occupationLists: string[];
  visaSubclasses: string[];
  stateNominations: string[];
  assessingAuthority?: string[];
}

interface AnzscoPageResponse {
  success: boolean;
  data: { items: OccupationSummary[] };
}

/** Fetch all 590 occupations across 3 pages */
async function fetchAllOccupations(): Promise<OccupationSummary[]> {
  const results: OccupationSummary[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await apiFetch(`/anzsco?pageSize=200&page=${page}`) as AnzscoPageResponse;
    const items = res?.data?.items ?? [];
    results.push(...items);
    if (items.length < 200) break;
  }
  return results;
}

export async function compareOccupations(codes: string[]): Promise<ToolResult> {
  if (!Array.isArray(codes) || codes.length < 2) {
    return toolError("Provide at least 2 ANZSCO codes to compare");
  }
  if (codes.length > 5) {
    return toolError("Maximum 5 codes per comparison");
  }
  for (const code of codes) {
    if (!/^\d{6}$/.test(code.trim())) {
      return toolError(`Invalid code: '${code}' — must be 6 digits`);
    }
  }

  try {
    const allItems = await fetchAllOccupations();

    const matched = codes.map((code) => {
      const occ = allItems.find((o) => o.code === code.trim());
      if (!occ) return { code, error: "not found" };

      return {
        code: occ.code,
        title: occ.title,
        assessingAuthority: occ.assessingAuthority ?? [],
        occupationLists: occ.occupationLists,
        eligibleVisas: occ.visaSubclasses,
        nominatingStates: occ.stateNominations,
        onMLTSSL: occ.occupationLists.includes("MLTSSL"),
        eligibleFor189: occ.visaSubclasses.includes("189"),
        eligibleFor190: occ.visaSubclasses.includes("190"),
        eligibleFor491: occ.visaSubclasses.includes("491"),
        eligibleFor482: occ.visaSubclasses.includes("482"),
        eligibleFor186: occ.visaSubclasses.includes("186"),
        occupationUrl: `https://anzsco.com.au/anzsco/${occ.slug}`,
      };
    });

    const validOccs = matched.filter((o) => !("error" in o)) as Array<{ eligibleVisas: string[] }>;
    const commonVisas = validOccs.length > 1
      ? validOccs[0].eligibleVisas.filter((v: string) =>
          validOccs.every((o) => o.eligibleVisas.includes(v))
        )
      : [];

    const validWithStates = matched.filter((o) => !("error" in o) && "nominatingStates" in o) as Array<{ nominatingStates: string[] }>;
    const commonStates = validWithStates.length > 1
      ? validWithStates[0].nominatingStates.filter((s: string) =>
          validWithStates.every((o) => o.nominatingStates.includes(s))
        )
      : [];

    return toolResult(
      {
        occupations: matched,
        comparison: {
          sharedVisaSubclasses: commonVisas,
          sharedNominatingStates: commonStates,
          codesCompared: codes,
          note: commonVisas.length > 0
            ? `All compared occupations share visa subclasses: ${commonVisas.join(", ")}.`
            : "No visa subclasses are shared by ALL compared occupations.",
        },
      },
      "anzsco.com.au/api/anzsco",
      "2026-04-26"
    );
  } catch (err) {
    return toolError(`Failed to compare occupations: ${err instanceof Error ? err.message : String(err)}`);
  }
}
