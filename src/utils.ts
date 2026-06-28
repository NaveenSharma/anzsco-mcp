/**
 * Shared utilities for the anzsco-mcp Cloudflare Worker.
 */

export const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(
  code: number,
  message: string,
  id: string | number | null
): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } }, 200);
}

/** Fetch from the Anzsco API with 5-min CF edge cache. */
export async function apiFetch(path: string): Promise<unknown> {
  const url = `https://anzsco.com.au/api${path}`;
  const res = await fetch(url, {
    cf: {
      cacheTtl: 300,       // 5-minute edge cache
      cacheEverything: true,
    } as RequestInitCfProperties,
    headers: { "User-Agent": "anzsco-mcp/1.0" },
  });

  if (!res.ok) {
    throw new Error(`API fetch failed: ${res.status} ${url}`);
  }
  return res.json();
}

/** Wrap tool output in the standard envelope. */
export function toolResult(
  data: unknown,
  source: string,
  lastUpdated?: string
): ToolResult {
  return {
    ok: true,
    data,
    source,
    lastUpdated: lastUpdated ?? new Date().toISOString().split("T")[0],
  };
}

export interface ToolResult {
  ok: boolean;
  data: unknown;
  source: string;
  lastUpdated: string;
  error?: string;
}

export function toolError(message: string): ToolResult {
  return {
    ok: false,
    data: null,
    source: "anzsco-mcp",
    lastUpdated: new Date().toISOString().split("T")[0],
    error: message,
  };
}
