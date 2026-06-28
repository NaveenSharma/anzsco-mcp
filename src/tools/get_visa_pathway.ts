/**
 * get_visa_pathway tool — occupation + visa combined information.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

const VISA_META: Record<string, { name: string; type: string; pointsTested: boolean; sponsor: boolean; notes: string }> = {
  "189": {
    name: "Skilled — Independent",
    type: "points-tested",
    pointsTested: true,
    sponsor: false,
    notes: "No sponsorship required. Must be on MLTSSL. Minimum 65 points. Invited via SkillSelect EOI.",
  },
  "190": {
    name: "Skilled — Nominated (State/Territory)",
    type: "points-tested",
    pointsTested: true,
    sponsor: true,
    notes: "State/territory nomination required (+5 points). Occupation must be on state's skills list. Minimum 65 points.",
  },
  "491": {
    name: "Skilled Work Regional (Provisional)",
    type: "points-tested",
    pointsTested: true,
    sponsor: true,
    notes: "State nomination or eligible relative sponsor required (+15 points). Must live and work regionally. Can lead to PR via 191 visa.",
  },
  "482": {
    name: "Temporary Skill Shortage",
    type: "employer-sponsored",
    pointsTested: false,
    sponsor: true,
    notes: "Employer sponsorship required. Short-term (2 yr) or medium-term (4 yr) stream. Points not tested.",
  },
  "186": {
    name: "Employer Nomination Scheme (ENS)",
    type: "employer-sponsored",
    pointsTested: false,
    sponsor: true,
    notes: "Permanent residence via employer nomination. Direct entry or TRT stream. No SkillSelect.",
  },
  "494": {
    name: "Skilled Employer Sponsored Regional (Provisional)",
    type: "employer-sponsored",
    pointsTested: false,
    sponsor: true,
    notes: "Employer sponsorship in a regional area. Provisional for 5 years; leads to PR via 191 visa.",
  },
  "485": {
    name: "Temporary Graduate",
    type: "graduate",
    pointsTested: false,
    sponsor: false,
    notes: "Post-study work rights for international graduates. Requires Australian study completion.",
  },
};

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

export async function getVisaPathway(code: string, subclass: string): Promise<ToolResult> {
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return toolError("code must be a 6-digit ANZSCO code");
  }
  if (!subclass || !VISA_META[subclass]) {
    return toolError(`subclass must be one of: ${Object.keys(VISA_META).join(", ")}`);
  }

  const trimmedCode = code.trim();

  try {
    const occ = await fetchSummary(trimmedCode);

    if (!occ) {
      return toolError(`Occupation ${trimmedCode} not found`);
    }

    const eligible = occ.visaSubclasses.includes(subclass);
    const meta = VISA_META[subclass];

    const result = {
      code: trimmedCode,
      title: occ.title,
      visaSubclass: subclass,
      visaName: meta.name,
      eligible,
      eligibilityNote: eligible
        ? `${occ.title} (${trimmedCode}) IS eligible for visa subclass ${subclass} (${meta.name}).`
        : `${occ.title} (${trimmedCode}) is NOT currently eligible for visa subclass ${subclass}.`,
      visaType: meta.type,
      pointsTested: meta.pointsTested,
      sponsorRequired: meta.sponsor,
      visaNote: meta.notes,
      occupationLists: occ.occupationLists,
      onMLTSSL: occ.occupationLists.includes("MLTSSL"),
      assessingAuthority: occ.assessingAuthority ?? [],
      allEligibleVisas: occ.visaSubclasses,
      nominatingStates: occ.stateNominations,
      occupationUrl: `https://anzsco.com.au/anzsco/${occ.slug}`,
    };

    return toolResult(result, `anzsco.com.au/api/anzsco/${trimmedCode}`, "2026-04-26");
  } catch (err) {
    return toolError(`Failed to get visa pathway for ${trimmedCode}/${subclass}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
