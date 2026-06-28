/**
 * Tool dispatcher — routes tools/call requests to the correct handler.
 */

import { toolError, ToolResult } from "../utils";
import { searchOccupations } from "./search_occupations";
import { getOccupation } from "./get_occupation";
import { getVisaPathway } from "./get_visa_pathway";
import { getStateNomination } from "./get_state_nomination";
import { getLatestSkillSelectRound } from "./get_latest_skillselect_round";
import { searchByVisa } from "./search_by_visa";
import { searchByState } from "./search_by_state";
import { compareOccupations } from "./compare_occupations";

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_occupations":
        return await searchOccupations(
          String(args.query ?? ""),
          typeof args.limit === "number" ? args.limit : 10
        );

      case "get_occupation":
        return await getOccupation(String(args.code ?? ""));

      case "get_visa_pathway":
        return await getVisaPathway(
          String(args.code ?? ""),
          String(args.subclass ?? "")
        );

      case "get_state_nomination":
        return await getStateNomination(
          String(args.code ?? ""),
          String(args.stateCode ?? "").toUpperCase()
        );

      case "get_latest_skillselect_round":
        return await getLatestSkillSelectRound();

      case "search_by_visa":
        return await searchByVisa(
          String(args.subclass ?? ""),
          typeof args.limit === "number" ? args.limit : 20
        );

      case "search_by_state":
        return await searchByState(
          String(args.stateCode ?? "").toUpperCase(),
          typeof args.limit === "number" ? args.limit : 20
        );

      case "compare_occupations":
        return await compareOccupations(
          Array.isArray(args.codes) ? (args.codes as string[]) : []
        );

      default:
        return toolError(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Tool execution failed";
    return toolError(msg);
  }
}
