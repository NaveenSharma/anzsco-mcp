/**
 * anzsco-mcp — Cloudflare Worker implementing the Model Context Protocol (MCP)
 * for anzsco.com.au occupation data.
 *
 * Endpoint:  POST /        — JSON-RPC 2.0 MCP endpoint
 *            GET  /        — manifest JSON
 *            GET  /tools   — human-readable HTML tool catalogue
 *            GET  /.well-known/mcp.json — MCP discovery manifest
 *
 * Transport: JSON-RPC 2.0 (HTTP POST). SSE transport not implemented.
 *
 * Data strategy: HYBRID
 *   - tech_synonyms + static metadata bundled in source (fast, no latency)
 *   - Occupation lookup, skillselect rounds: fetched from https://anzsco.com.au/api/...
 *     with 5-minute CF edge cache (cheap, always-fresh)
 *
 * MCP spec compliance:
 *   https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

import { handleToolCall } from "./tools/dispatcher";
import { TOOLS_LIST } from "./tools/registry";
import { CORS_HEADERS, jsonResponse, errorResponse } from "./utils";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS pre-flight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // -----------------------------------------------------------------------
    // Route dispatch
    // -----------------------------------------------------------------------
    const path = url.pathname.replace(/\/$/, "") || "/";

    // GET / — root manifest
    if (method === "GET" && path === "") {
      return serveManifest(url);
    }
    if (method === "GET" && path === "/") {
      return serveManifest(url);
    }

    // GET /.well-known/mcp.json — MCP discovery manifest
    if (method === "GET" && path === "/.well-known/mcp.json") {
      return serveMcpDiscovery(url);
    }

    // GET /.well-known/mcp/server-card.json — Smithery scanner manifest
    if (method === "GET" && path === "/.well-known/mcp/server-card.json") {
      return serveServerCard(url);
    }

    // GET /tools — human-readable HTML catalogue
    if (method === "GET" && path === "/tools") {
      return serveToolsHtml();
    }

    // GET /health
    if (method === "GET" && path === "/health") {
      return jsonResponse({ ok: true, service: "anzsco-mcp", version: "1.0.0" }, 200);
    }

    // POST / — MCP JSON-RPC 2.0
    if (method === "POST" && (path === "/" || path === "")) {
      return handleMcpRequest(request);
    }

    // 404 fallback
    return jsonResponse({ error: "not_found", path }, 404);
  },
};

// ---------------------------------------------------------------------------
// MCP JSON-RPC handler
// ---------------------------------------------------------------------------

async function handleMcpRequest(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(-32700, "Parse error", null);
  }

  // Support both single RPC and batch (array)
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((item) => dispatchRpc(item as RpcRequest))
    );
    return jsonResponse(responses, 200);
  }

  const result = await dispatchRpc(body as RpcRequest);
  return jsonResponse(result, 200);
}

interface RpcRequest {
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  id?: string | number | null;
}

async function dispatchRpc(rpc: RpcRequest): Promise<unknown> {
  const id = rpc.id ?? null;
  const method = rpc.method ?? "";

  if (rpc.jsonrpc !== "2.0") {
    return mcpError(-32600, "Invalid Request — jsonrpc must be '2.0'", id);
  }

  try {
    switch (method) {
      case "initialize":
        return mcpResult(handleInitialize(), id);

      case "tools/list":
        return mcpResult(handleToolsList(), id);

      case "tools/call": {
        const params = rpc.params as { name?: string; arguments?: Record<string, unknown> };
        if (!params?.name) {
          return mcpError(-32602, "Invalid params — 'name' required", id);
        }
        const toolResult = await handleToolCall(params.name, params.arguments ?? {});
        return mcpResult({ content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] }, id);
      }

      case "resources/list":
        return mcpResult(handleResourcesList(), id);

      case "resources/read": {
        const params = rpc.params as { uri?: string };
        if (!params?.uri) {
          return mcpError(-32602, "Invalid params — 'uri' required", id);
        }
        const resource = await handleResourceRead(params.uri);
        return mcpResult(resource, id);
      }

      case "prompts/list":
        return mcpResult({ prompts: [] }, id);

      case "ping":
        return mcpResult({}, id);

      default:
        return mcpError(-32601, `Method not found: ${method}`, id);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return mcpError(-32603, msg, id);
  }
}

// ---------------------------------------------------------------------------
// MCP method handlers
// ---------------------------------------------------------------------------

function handleInitialize() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: {},
    },
    serverInfo: {
      name: "anzsco-mcp",
      version: "1.0.0",
      description:
        "MCP server for anzsco.com.au — search and explore Australian occupation codes (ANZSCO), skilled migration visa eligibility, state nomination lists, and SkillSelect invitation rounds.",
    },
    instructions:
      "Use search_occupations first to find the right ANZSCO code for a job title or technology. Then call get_occupation, get_visa_pathway, or get_state_nomination with the code for details. Call get_latest_skillselect_round for current points cutoffs.",
  };
}

function handleToolsList() {
  return { tools: TOOLS_LIST };
}

function handleResourcesList() {
  return {
    resources: [
      {
        uri: "anzsco://occupation/261312",
        name: "Developer Programmer (ANZSCO 261312)",
        description: "Full occupation record for .NET/C# developer — lists, visas, authority, narratives.",
        mimeType: "application/json",
      },
      {
        uri: "anzsco://occupation/261313",
        name: "Software Engineer (ANZSCO 261313)",
        description: "Full occupation record for Java/backend engineers.",
        mimeType: "application/json",
      },
      {
        uri: "anzsco://skillselect/latest",
        name: "Latest SkillSelect Round",
        description: "Most recent SkillSelect invitation round data with points cutoffs.",
        mimeType: "application/json",
      },
    ],
  };
}

async function handleResourceRead(uri: string): Promise<unknown> {
  if (uri.startsWith("anzsco://occupation/")) {
    const code = uri.replace("anzsco://occupation/", "");
    const { handleToolCall: tc } = await import("./tools/dispatcher");
    const data = await tc("get_occupation", { code });
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
  if (uri === "anzsco://skillselect/latest") {
    const { handleToolCall: tc } = await import("./tools/dispatcher");
    const data = await tc("get_latest_skillselect_round", {});
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

// ---------------------------------------------------------------------------
// Manifest / discovery endpoints
// ---------------------------------------------------------------------------

function serveManifest(url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  const manifest = {
    name: "anzsco-mcp",
    displayName: "ANZSCO Occupation MCP Server",
    description:
      "AI-accessible MCP server for Australian occupation codes (ANZSCO), skilled migration visa pathways, state nomination lists, and SkillSelect invitation round data. Supports natural-language queries like '.net developer points requirement' or 'civil engineer visa 189'.",
    version: "1.0.0",
    mcpEndpoint: `${base}/`,
    transport: "json-rpc-2.0",
    discoveryUrl: `${base}/.well-known/mcp.json`,
    toolsPage: `${base}/tools`,
    tools: TOOLS_LIST.map((t) => ({ name: t.name, description: t.description })),
    maintainer: "anzsco.com.au",
    lastUpdated: "2026-06-26",
  };
  return jsonResponse(manifest, 200);
}

function serveServerCard(url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  // Smithery server-card.json — provides static metadata for auto-scanning
  // Follows MCP specification types for tools, resources, and prompts
  const card = {
    name: "anzsco-mcp",
    version: "1.0.0",
    description:
      "MCP server for anzsco.com.au — search and explore Australian occupation codes (ANZSCO), skilled migration visa eligibility, state nomination lists, and SkillSelect invitation rounds.",
    author: "anzsco.com.au",
    homepage: "https://anzsco.com.au/ai",
    transport: [{ type: "http", url: `${base}/` }],
    auth: { type: "none" },
    tools: TOOLS_LIST.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    resources: [
      {
        uri: "anzsco://occupation/{code}",
        name: "ANZSCO Occupation Record",
        description: "Full occupation record by 6-digit ANZSCO code.",
        mimeType: "application/json",
      },
      {
        uri: "anzsco://skillselect/latest",
        name: "Latest SkillSelect Round",
        description: "Most recent SkillSelect invitation round with points cutoffs.",
        mimeType: "application/json",
      },
    ],
    prompts: [],
  };
  return jsonResponse(card, 200);
}

function serveMcpDiscovery(url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  return jsonResponse(
    {
      name: "anzsco",
      displayName: "anzsco.com.au MCP Server",
      description:
        "Search and explore Australian occupation codes (ANZSCO). Supports lookups by job title, technology stack, visa subclass, and state. Returns occupation codes, visa eligibility, skills assessment authority, state nomination lists, and SkillSelect invitation history.",
      transport: "http",
      url: `${base}/`,
      schemaVersion: "2024-11-05",
      serverInfo: {
        name: "anzsco",
        version: "1.0.0",
      },
      capabilities: {
        tools: true,
        resources: true,
      },
      documentation: "https://anzsco.com.au/ai",
      vendor: {
        name: "anzsco.com.au",
        url: "https://anzsco.com.au",
      },
    },
    200
  );
}

function serveToolsHtml(): Response {
  const toolRows = TOOLS_LIST.map(
    (t) => `
    <div class="tool">
      <h3><code>${t.name}</code></h3>
      <p>${t.description}</p>
      <details>
        <summary>Input schema</summary>
        <pre>${JSON.stringify(t.inputSchema, null, 2)}</pre>
      </details>
    </div>`
  ).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANZSCO MCP — Tool Catalogue</title>
<style>
  :root { --bg: #0f1117; --card: #1a1d27; --text: #e2e8f0; --accent: #60a5fa; --border: #2d3748; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
  h1 { color: var(--accent); margin-bottom: 0.5rem; }
  .subtitle { color: #94a3b8; margin-bottom: 2rem; }
  .tool { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
  h3 { color: var(--accent); margin-bottom: 0.5rem; }
  p { color: #cbd5e1; line-height: 1.6; margin-bottom: 0.75rem; }
  details summary { cursor: pointer; color: #94a3b8; font-size: 0.875rem; }
  pre { background: #0d1117; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem; color: #a3e635; margin-top: 0.5rem; }
  .endpoint { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 2rem; }
  .endpoint code { background: #0d1117; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9rem; color: #a3e635; }
</style>
</head>
<body>
<h1>ANZSCO MCP Server</h1>
<p class="subtitle">AI-accessible Model Context Protocol server for anzsco.com.au</p>

<div class="endpoint">
  <strong>MCP Endpoint:</strong> <code>POST /</code> (JSON-RPC 2.0)<br>
  <strong>Discovery:</strong> <code>GET /.well-known/mcp.json</code><br>
  <strong>Transport:</strong> JSON-RPC 2.0 over HTTP (stateless)<br>
  <strong>Auth:</strong> None required
</div>

<h2 style="margin-bottom:1rem;color:#e2e8f0">Available Tools (${TOOLS_LIST.length})</h2>
${toolRows}
</body>
</html>`;

  return new Response(html, {
    headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// JSON-RPC envelope helpers
// ---------------------------------------------------------------------------

function mcpResult(result: unknown, id: string | number | null): unknown {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(
  code: number,
  message: string,
  id: string | number | null
): unknown {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
