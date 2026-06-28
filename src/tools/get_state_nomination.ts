/**
 * get_state_nomination tool — occupation + state nomination status.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

const STATE_META: Record<string, { name: string; visas: string[] }> = {
  NSW: { name: "New South Wales", visas: ["190", "491"] },
  VIC: { name: "Victoria", visas: ["190", "491"] },
  QLD: { name: "Queensland", visas: ["190", "491"] },
  WA:  { name: "Western Australia", visas: ["190", "491"] },
  SA:  { name: "South Australia", visas: ["190", "491"] },
  TAS: { name: "Tasmania", visas: ["190", "491"] },
  ACT: { name: "Australian Capital Territory", visas: ["190"] },
  NT:  { name: "Northern Territory", visas: ["190", "491"] },
};

const VALID_STATES = Object.keys(STATE_META);

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

async function fetchSummary(code: string): Promise<OccupationSummary | null> {
  for (let page = 1; page <= 3; page++) {
    const res = await apiFetch(`/anzsco?pageSize=200&page=${page}`) as AnzscoPageResponse;
    const found = res?.data?.items?.find((o) => o.code === code);
    if (found) return found;
    if (!res?.data?.items || res.data.items.length < 200) break;
  }
  return null;
}

export async function getStateNomination(code: string, stateCode: string): Promise<ToolResult> {
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return toolError("code must be a 6-digit ANZSCO code");
  }
  if (!stateCode || !STATE_META[stateCode]) {
    return toolError(`stateCode must be one of: ${VALID_STATES.join(", ")}`);
  }

  const trimmedCode = code.trim();

  try {
    const occ = await fetchSummary(trimmedCode);

    if (!occ) {
      return toolError(`Occupation ${trimmedCode} not found`);
    }

    const isNominated = occ.stateNominations.includes(stateCode);
    const meta = STATE_META[stateCode];

    const result = {
      code: trimmedCode,
      title: occ.title,
      stateCode,
      stateName: meta.name,
      nominated: isNominated,
      nominationNote: isNominated
        ? `${occ.title} (${trimmedCode}) IS currently nominated by ${meta.name} (${stateCode}).`
        : `${occ.title} (${trimmedCode}) is NOT currently on ${meta.name}'s skills list.`,
      pointsBonusFor190: isNominated && meta.visas.includes("190") ? "+5 points" : "N/A",
      pointsBonusFor491: isNominated && meta.visas.includes("491") ? "+15 points" : "N/A",
      availableVisasViaThisState: isNominated ? meta.visas : [],
      allNominatingStates: occ.stateNominations,
      occupationLists: occ.occupationLists,
      assessingAuthority: occ.assessingAuthority ?? [],
      dataSource: "Compiled from state migration websites (April 2026)",
      occupationUrl: `https://anzsco.com.au/anzsco/${occ.slug}`,
    };

    return toolResult(result, "anzsco.com.au/api/anzsco", "2026-04-26");
  } catch (err) {
    return toolError(`Failed to get state nomination for ${trimmedCode}/${stateCode}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
