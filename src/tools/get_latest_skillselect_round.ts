/**
 * get_latest_skillselect_round tool — most recent SkillSelect invitation round.
 */

import { apiFetch, toolResult, toolError, ToolResult } from "../utils";

interface RoundData {
  date: string;
  totalInvitations: number;
  bySubclass: Record<string, { invitations: number; minPoints: number; minPointsByOccupation?: Record<string, number> }>;
  byOccupation: Record<string, { invitations: number; minPoints: number }>;
  proRataOccupations: string[];
  notes: string;
}

interface SkillSelectLatestResponse {
  success: boolean;
  round: RoundData;
  lastUpdated: string;
}

export async function getLatestSkillSelectRound(): Promise<ToolResult> {
  try {
    const res = await apiFetch("/skillselect/rounds/latest") as SkillSelectLatestResponse;

    if (!res?.round) {
      return toolError("No SkillSelect round data available");
    }

    const round = res.round;

    // Build human-readable summary
    const subclassSummary = Object.entries(round.bySubclass ?? {}).map(([sc, data]) => ({
      visaSubclass: sc,
      invitations: data.invitations,
      minimumPointsCutoff: data.minPoints === 0 ? "No cutoff applied (all invited)" : data.minPoints,
      proRataOccupationCutoffs: data.minPointsByOccupation && Object.keys(data.minPointsByOccupation).length > 0
        ? data.minPointsByOccupation
        : null,
    }));

    const result = {
      roundDate: round.date,
      totalInvitations: round.totalInvitations,
      bySubclass: subclassSummary,
      proRataOccupations: round.proRataOccupations,
      notes: round.notes || null,
      interpretation:
        "Points cutoff of 0 means all applicants above the minimum threshold (65) were invited in that round. " +
        "Pro-rata occupations have higher individual cutoffs than the general minimum.",
      dataSource: "Department of Home Affairs SkillSelect",
      sourceUrl: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds",
    };

    return toolResult(result, "anzsco.com.au/api/skillselect/rounds/latest", res.lastUpdated ?? new Date().toISOString().split("T")[0]);
  } catch (err) {
    return toolError(`Failed to fetch SkillSelect data: ${err instanceof Error ? err.message : String(err)}`);
  }
}
