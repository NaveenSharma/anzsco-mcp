/**
 * MCP Tool registry — defines all 8 tools with full JSON Schema input definitions
 * and semantic descriptions that help AI assistants discover them.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS_LIST: McpTool[] = [
  {
    name: "search_occupations",
    description:
      "Search for ANZSCO occupations by free-text job title, technology name, or industry. " +
      "Handles technology synonyms so informal queries resolve correctly — for example: " +
      "'.net developer' returns ANZSCO 261312 Developer Programmer; " +
      "'java developer' or 'backend engineer' returns 261313 Software Engineer; " +
      "'react developer' or 'frontend' or 'vue.js' returns 261212 Web Developer; " +
      "'data scientist' or 'ml engineer' returns 224114 Data Scientist; " +
      "'devops' or 'kubernetes engineer' returns 261316 DevOps Engineer; " +
      "'gp' or 'general practitioner' returns 253111 General Practitioner; " +
      "'civil engineer' returns 233512. Returns matched ANZSCO codes with titles, " +
      "visa eligibility, skills assessment authority, and relevance scores sorted by match quality.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Job title, technology, or industry to search for. Examples: '.net developer', 'java engineer', 'data scientist', 'civil engineer', 'general practitioner', 'electrician'.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Default: 10. Max: 50.",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_occupation",
    description:
      "Get full occupation details for a specific ANZSCO code. Returns the occupation title, " +
      "ANZSCO classification group, skills assessment authority (ACS, Engineers Australia, VETASSESS, etc.), " +
      "occupation lists (MLTSSL / STSOL / ROL), eligible visa subclasses, nominating states and territories, " +
      "and a narrative description. Use this after search_occupations to get complete information about a specific occupation. " +
      "Example: get_occupation('261312') returns full details for Developer Programmer (.NET / C#).",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Six-digit ANZSCO occupation code, e.g. '261312' or '233512'.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "get_visa_pathway",
    description:
      "Get combined occupation and visa pathway information. Returns visa eligibility, skills assessment " +
      "body, estimated processing time, narrative about the pathway, and whether the occupation is on the " +
      "relevant skills list for that visa subclass. Useful for questions like 'can a .net developer apply " +
      "for visa 189?' or 'what are the points requirements for 261312 on subclass 190?'. " +
      "Supported subclasses: 189, 190, 491, 482, 186, 494.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Six-digit ANZSCO code, e.g. '261312'.",
        },
        subclass: {
          type: "string",
          description: "Visa subclass number as string: '189', '190', '491', '482', '186', or '494'.",
        },
      },
      required: ["code", "subclass"],
    },
  },
  {
    name: "get_state_nomination",
    description:
      "Get state/territory nomination status for a specific occupation. Returns whether the state " +
      "currently nominates the occupation, the state skills list version, indicative points bonus for " +
      "state nomination (190 = +5 points, 491 = +15 points), and a narrative. " +
      "State codes: NSW, VIC, QLD, WA, SA, TAS, ACT, NT. " +
      "Example: 'does NSW nominate 261312 developers?' — use get_state_nomination('261312', 'NSW').",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Six-digit ANZSCO code, e.g. '261312'.",
        },
        stateCode: {
          type: "string",
          description:
            "State/territory code: 'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', or 'NT'.",
        },
      },
      required: ["code", "stateCode"],
    },
  },
  {
    name: "get_latest_skillselect_round",
    description:
      "Get the most recent SkillSelect invitation round data from the Department of Home Affairs. " +
      "Returns the round date, total invitations issued, breakdown by visa subclass (189/190/491), " +
      "minimum points cutoffs, and per-occupation pro-rata cutoffs where applicable. " +
      "Use this to answer 'what is the latest points cutoff for 189 visa?', " +
      "'how many invitations were issued last round?', or 'did .net developers get invited in the last round?'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_by_visa",
    description:
      "List all ANZSCO occupations eligible for a given visa subclass. " +
      "Returns occupation codes, titles, and skills assessment authorities for all occupations " +
      "on the relevant skills list for that visa. Use to answer 'what jobs can I apply for on visa 189?' " +
      "or 'which occupations are eligible for the employer-sponsored 482 visa?'. " +
      "Supported subclasses: 189, 190, 491, 482, 186, 494.",
    inputSchema: {
      type: "object",
      properties: {
        subclass: {
          type: "string",
          description: "Visa subclass: '189', '190', '491', '482', '186', or '494'.",
        },
        limit: {
          type: "number",
          description: "Maximum results. Default 20, max 200.",
          default: 20,
        },
      },
      required: ["subclass"],
    },
  },
  {
    name: "search_by_state",
    description:
      "List all ANZSCO occupations currently nominated by a given Australian state or territory. " +
      "Returns occupation codes and titles for all occupations on that state's current skills list. " +
      "Use to answer 'what jobs does Victoria nominate?' or 'which occupations can get state-sponsored 491 in Queensland?'. " +
      "State codes: NSW, VIC, QLD, WA, SA, TAS, ACT, NT.",
    inputSchema: {
      type: "object",
      properties: {
        stateCode: {
          type: "string",
          description: "State code: 'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', or 'NT'.",
        },
        limit: {
          type: "number",
          description: "Maximum results. Default 20, max 200.",
          default: 20,
        },
      },
      required: ["stateCode"],
    },
  },
  {
    name: "compare_occupations",
    description:
      "Side-by-side comparison of multiple ANZSCO occupation codes. " +
      "Returns a comparison table showing: which visa subclasses each occupation is eligible for, " +
      "which states nominate each, skills assessment bodies, and occupation list type (MLTSSL/STSOL/ROL). " +
      "Useful when a user is choosing between two career paths or visa options — e.g. " +
      "'compare 261312 developer programmer vs 261313 software engineer' or " +
      "'which is better for visa 190 — 233512 civil engineer or 233311 electrical engineer?'.",
    inputSchema: {
      type: "object",
      properties: {
        codes: {
          type: "array",
          items: { type: "string" },
          description: "Array of 2-5 six-digit ANZSCO codes to compare, e.g. ['261312', '261313', '261212'].",
          minItems: 2,
          maxItems: 5,
        },
      },
      required: ["codes"],
    },
  },
];
