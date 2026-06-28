/**
 * search_occupations tool
 *
 * Algorithm:
 * 1. Normalise query (lowercase, trim).
 * 2. Check TECH_SYNONYMS — any match gives the mapped ANZSCO code a strong boost.
 *    Fetch those specific codes directly from /api/anzsco/<code>.
 * 3. Also call /api/anzsco/search?q=<query> (the API's own text search) as a fallback.
 * 4. Merge, deduplicate, score, and return top N.
 *
 * NOTE: The API caps page returns at 200 rows, and 590 occupations span 3 pages.
 * We avoid full-pagination by using (a) synonym-direct lookup and (b) API text search.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";
import { scoreOccupation, TECH_SYNONYMS, fuzzyMatchSynonyms, fuzzyMatchTitles } from "../synonyms";

interface OccupationItem {
  code: string;
  slug: string;
  title: string;
  skillLevel: number;
  occupationLists: string[];
  visaSubclasses: string[];
  stateNominations: string[];
  assessingAuthority?: string[];
}

interface AnzscoPageResponse {
  success: boolean;
  data: {
    page?: number;
    pageSize?: number;
    total?: number;
    items: OccupationItem[];
  };
}

export async function searchOccupations(
  query: string,
  limit: number
): Promise<ToolResult> {
  if (!query || query.trim().length === 0) {
    return toolError("query is required");
  }

  const cap = Math.min(Math.max(1, limit), 50);
  const q = query.toLowerCase().trim();

  // Step 1: Check synonym map to find codes that match this query
  const synonymMatchedCodes: string[] = [];
  for (const [code, synonyms] of Object.entries(TECH_SYNONYMS)) {
    for (const syn of synonyms) {
      if (q === syn || q.includes(syn) || syn.includes(q)) {
        synonymMatchedCodes.push(code);
        break;
      }
    }
  }

  // Step 2: Fetch synonym-matched codes directly (one request per code, in parallel)
  const directFetches = synonymMatchedCodes.slice(0, 10).map(async (code): Promise<OccupationItem | null> => {
    try {
      const res = await apiFetch(`/anzsco?pageSize=200&page=1`) as AnzscoPageResponse;
      // Try to find in first 200
      const found = res?.data?.items?.find((o) => o.code === code);
      if (found) return found;
      // Try page 2 if not found in page 1
      const res2 = await apiFetch(`/anzsco?pageSize=200&page=2`) as AnzscoPageResponse;
      return res2?.data?.items?.find((o) => o.code === code) ?? null;
    } catch {
      return null;
    }
  });

  // Step 3: Also do the API text search
  const apiSearchFetch = apiFetch(
    `/anzsco/search?q=${encodeURIComponent(query)}&top=${cap}`
  ).then((res) => {
    const r = res as AnzscoPageResponse;
    return r?.data?.items ?? [];
  }).catch(() => [] as OccupationItem[]);

  const [directResults, apiSearchItems] = await Promise.all([
    Promise.all(directFetches),
    apiSearchFetch,
  ]);

  // Merge all candidates
  const seen = new Set<string>();
  const candidates: Array<OccupationItem & { score: number }> = [];

  for (const occ of [...directResults, ...apiSearchItems]) {
    if (!occ || seen.has(occ.code)) continue;
    seen.add(occ.code);
    candidates.push({
      ...occ,
      score: scoreOccupation(occ.code, occ.title, q),
    });
  }

  // If synonym matched codes but didn't appear in results, add score based on synonym match
  for (const code of synonymMatchedCodes) {
    if (!seen.has(code)) {
      // We know about this code from synonyms but couldn't fetch it — still score it
      candidates.push({
        code,
        slug: code,
        title: `ANZSCO ${code} (synonym matched)`,
        skillLevel: 1,
        occupationLists: [],
        visaSubclasses: [],
        stateNominations: [],
        score: 100,
      });
    }
  }

  // Sort by score descending
  const directMatches = candidates
    .filter((o) => o.score > 0 || synonymMatchedCodes.includes(o.code))
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map(({ score, ...occ }) => ({
      code: occ.code,
      title: occ.title,
      assessingAuthority: occ.assessingAuthority ?? [],
      occupationLists: occ.occupationLists,
      visaSubclasses: occ.visaSubclasses,
      stateNominations: occ.stateNominations,
      occupationUrl: occ.slug && !occ.slug.startsWith(occ.code + " ")
        ? `https://anzsco.com.au/anzsco/${occ.slug}`
        : `https://anzsco.com.au/anzsco/${occ.code}`,
      matchScore: score,
    }));

  // --- Fuzzy fallback when no direct matches found ---
  if (directMatches.length === 0) {
    // 1. Fuzzy match against TECH_SYNONYMS
    const synonymFuzzy = fuzzyMatchSynonyms(q, cap);

    // 2. Fetch all occupation titles for title-level fuzzy match
    let allOccupations: Array<{ code: string; title: string }> = [];
    try {
      const page1 = await apiFetch(`/anzsco?pageSize=200&page=1`) as AnzscoPageResponse;
      const page2 = await apiFetch(`/anzsco?pageSize=200&page=2`) as AnzscoPageResponse;
      const page3 = await apiFetch(`/anzsco?pageSize=200&page=3`) as AnzscoPageResponse;
      allOccupations = [
        ...(page1?.data?.items ?? []),
        ...(page2?.data?.items ?? []),
        ...(page3?.data?.items ?? []),
      ].map((o) => ({ code: o.code, title: o.title }));
    } catch {
      // non-fatal — synonym fuzzy alone is still useful
    }

    const titleFuzzy = fuzzyMatchTitles(q, allOccupations, cap);

    // Merge synonym fuzzy + title fuzzy (deduplicate by code)
    const fuzzySeen = new Set<string>();
    const fuzzyResults: Array<{ code: string; title: string; distance: number }> = [];

    for (const hit of synonymFuzzy) {
      if (!fuzzySeen.has(hit.code)) {
        fuzzySeen.add(hit.code);
        // Look up the title from allOccupations (or fallback to synonym)
        const found = allOccupations.find((o) => o.code === hit.code);
        fuzzyResults.push({ code: hit.code, title: found?.title ?? `ANZSCO ${hit.code}`, distance: hit.distance });
      }
    }
    for (const hit of titleFuzzy) {
      if (!fuzzySeen.has(hit.code)) {
        fuzzySeen.add(hit.code);
        fuzzyResults.push(hit);
      }
    }

    fuzzyResults.sort((a, b) => a.distance - b.distance);

    if (fuzzyResults.length > 0) {
      // Return fuzzy matches with low matchScore (< 50) and a suggestions field
      const fuzzyData = fuzzyResults.slice(0, cap).map((hit) => ({
        code: hit.code,
        title: hit.title,
        assessingAuthority: [],
        occupationLists: [],
        visaSubclasses: [],
        stateNominations: [],
        occupationUrl: `https://anzsco.com.au/anzsco/${hit.code}`,
        matchScore: Math.max(1, 40 - hit.distance * 10), // 30-40 range for fuzzy
      }));

      const suggestions = fuzzyResults.slice(0, 3).map((h) => `Did you mean: "${h.title}"?`);

      return {
        ok: true,
        data: fuzzyData,
        suggestions,
        source: "anzsco.com.au (fuzzy fallback — possible typo detected)",
        lastUpdated: "2026-04-26",
      } as ToolResult & { suggestions: string[] };
    }

    // Still no match — return empty with top-3 closest suggestions from synonym keys
    const fallbackSuggestions = fuzzyMatchSynonyms(q, 3).map(
      (h) => `Did you mean: "${h.matchedSynonym}"?`
    );

    return {
      ok: true,
      data: [],
      suggestions: fallbackSuggestions.length > 0
        ? fallbackSuggestions
        : ["Try searching by occupation title, e.g. 'software engineer', or a technology like 'react developer'."],
      source: "anzsco.com.au (no match found)",
      lastUpdated: "2026-04-26",
    } as ToolResult & { suggestions: string[] };
  }

  const source = synonymMatchedCodes.length > 0
    ? "anzsco.com.au (synonym map + API search)"
    : "anzsco.com.au/api/anzsco/search";

  return toolResult(directMatches, source, "2026-04-26");
}
