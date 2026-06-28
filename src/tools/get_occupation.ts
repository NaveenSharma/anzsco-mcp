/**
 * get_occupation tool — fetch full details for a single ANZSCO code.
 *
 * Uses the /api/anzsco/<code> endpoint (which returns full detail including narrative)
 * plus the list endpoint to get structured lists/visas/states.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

interface OccupationSummary {
  code: string;
  slug: string;
  title: string;
  skillLevel: number;
  occupationLists: string[];
  visaSubclasses: string[];
  stateNominations: string[];
  assessingAuthority?: string[];
}

interface OccupationDetailResponse {
  success: boolean;
  data: {
    majorGroup: string;
    subMajorGroup: string;
    minorGroup: string;
    unitGroup: string;
    assessingAuthority: string[];
    relatedKeywords: string[];
    data: string; // JSON string
  };
}

interface ParsedOccData {
  code: string;
  title: string;
  rawBody?: string;
  oscaCode?: string[];
  narrative?: {
    Summary?: string;
    Duties?: string[];
    DemandOutlook?: string;
    Qualifications?: string;
  };
}

interface AnzscoPageResponse {
  success: boolean;
  data: { items: OccupationSummary[] };
}

/** Fetch occupation summary from paginated list — tries page 1 then 2 then 3 */
async function fetchSummary(code: string): Promise<OccupationSummary | null> {
  for (let page = 1; page <= 3; page++) {
    const res = await apiFetch(`/anzsco?pageSize=200&page=${page}`) as AnzscoPageResponse;
    const found = res?.data?.items?.find((o) => o.code === code);
    if (found) return found;
    if (!res?.data?.items || res.data.items.length < 200) break; // last page
  }
  return null;
}

export async function getOccupation(code: string): Promise<ToolResult> {
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return toolError("code must be a 6-digit ANZSCO code, e.g. '261312'");
  }

  const trimmedCode = code.trim();

  try {
    // Fetch detail + summary in parallel
    const [detailRes, summary] = await Promise.all([
      apiFetch(`/anzsco/${trimmedCode}`) as Promise<OccupationDetailResponse>,
      fetchSummary(trimmedCode),
    ]);

    if (!detailRes?.data && !summary) {
      return toolError(`Occupation ${trimmedCode} not found`);
    }

    const detail = detailRes?.data;

    // Parse the embedded JSON string
    let parsed: ParsedOccData | null = null;
    if (detail?.data && typeof detail.data === "string") {
      try {
        parsed = JSON.parse(detail.data) as ParsedOccData;
      } catch {
        // leave null
      }
    }

    const augmented = {
      code: trimmedCode,
      title: parsed?.title ?? summary?.title ?? `ANZSCO ${trimmedCode}`,
      anzscoGroup: detail ? {
        majorGroup: detail.majorGroup,
        subMajorGroup: detail.subMajorGroup,
        minorGroup: detail.minorGroup,
        unitGroup: detail.unitGroup,
      } : null,
      assessingAuthority: detail?.assessingAuthority ?? summary?.assessingAuthority ?? [],
      occupationLists: summary?.occupationLists ?? [],
      visaSubclasses: summary?.visaSubclasses ?? [],
      stateNominations: summary?.stateNominations ?? [],
      skillLevel: summary?.skillLevel,
      onMLTSSL: summary?.occupationLists?.includes("MLTSSL") ?? false,
      narrative: parsed?.narrative ?? null,
      relatedKeywords: detail?.relatedKeywords ?? [],
      oscaCodes: parsed?.oscaCode ?? [],
      occupationUrl: summary?.slug
        ? `https://anzsco.com.au/anzsco/${summary.slug}`
        : `https://anzsco.com.au/anzsco/${trimmedCode}`,
    };

    return toolResult(augmented, `anzsco.com.au/api/anzsco/${trimmedCode}`, "2026-04-26");
  } catch (err) {
    return toolError(`Failed to fetch occupation ${trimmedCode}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
