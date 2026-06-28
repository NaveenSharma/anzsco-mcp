/**
 * Tech synonym map — bundled in the Worker for zero-latency synonym lookups.
 * Source: data/tech_synonyms.json (kept in sync manually or via deploy script).
 *
 * Key = ANZSCO code (string), Value = array of synonyms (all lowercase).
 */

export const TECH_SYNONYMS: Record<string, string[]> = {
  "261312": ["developer programmer", ".net developer", ".net engineer", "c# developer", "dotnet developer", "vb.net developer", "asp.net developer", "asp.net core developer", "c sharp developer", "csharp developer", "wpf developer", "winforms developer", "blazor developer", "dotnet engineer", "net developer", "net engineer", "dotnet core"],
  "261313": ["software engineer", "java developer", "spring developer", "spring boot developer", "kotlin developer", "scala developer", "go developer", "golang developer", "rust developer", "backend engineer", "backend developer", "server side developer", "api developer", "jvm developer", "microservices developer", "software developer general"],
  "261212": ["web developer", "frontend developer", "front-end developer", "front end developer", "react developer", "vue developer", "vue.js developer", "angular developer", "javascript developer", "typescript developer", "next.js developer", "nextjs developer", "nuxt developer", "svelte developer", "css developer", "html developer", "ui developer", "client side developer", "web ui developer", "remix developer"],
  "224114": ["data scientist", "machine learning engineer", "ml engineer", "ai engineer", "python data", "tensorflow developer", "pytorch developer", "data analyst", "statistical analyst", "nlp engineer", "computer vision engineer", "ai researcher", "deep learning engineer", "data science", "applied scientist", "research scientist ml"],
  "261316": ["devops engineer", "site reliability engineer", "sre", "platform engineer", "infrastructure engineer", "kubernetes engineer", "docker engineer", "ci/cd engineer", "devsecops", "cloud engineer", "cloud infrastructure", "k8s engineer", "helm engineer", "terraform engineer", "ansible engineer", "gitops engineer"],
  "261315": ["cyber security engineer", "security engineer", "infosec", "application security", "appsec", "information security analyst", "security architect", "security specialist", "vulnerability analyst", "soc analyst", "blue team", "threat analyst", "cybersecurity analyst"],
  "261317": ["penetration tester", "ethical hacker", "red team", "pentester", "pen tester", "offensive security", "bug bounty", "exploit developer", "vulnerability researcher"],
  "263111": ["computer network engineer", "network engineer", "cisco engineer", "network admin", "network administrator", "ccna engineer", "ccnp engineer", "network specialist", "lan engineer", "wan engineer", "routing switching engineer", "network technician"],
  "261311": ["analyst programmer", "junior developer", "graduate developer", "associate developer", "entry level developer", "graduate programmer", "junior programmer", "junior software engineer"],
  "261318": ["systems programmer", "embedded systems developer", "firmware developer", "low level programmer", "systems software developer", "c developer", "c++ developer", "cpp developer", "kernel developer"],
  "261314": ["software tester", "qa engineer", "quality assurance engineer", "test automation engineer", "qa analyst", "test analyst", "sdet", "software quality engineer", "automated tester", "selenium developer", "cypress tester", "playwright tester"],
  "135101": ["ict manager", "it manager", "technology manager", "head of engineering", "vp engineering", "director of engineering", "engineering manager", "technology director"],
  "135199": ["ict project manager", "it project manager", "technical project manager", "scrum master", "agile coach", "delivery manager", "program manager technical"],
  "224111": ["actuary", "actuarial analyst", "actuarial consultant", "pricing actuary", "reserving actuary", "risk actuary"],
  "253111": ["general practitioner", "gp", "family doctor", "primary care doctor", "primary care physician", "family physician", "general practice doctor"],
  "253311": ["specialist physician", "cardiologist", "gastroenterologist", "internist", "physician specialist", "internal medicine specialist"],
  "253513": ["radiologist", "diagnostic radiologist", "interventional radiologist", "nuclear medicine physician"],
  "234111": ["accountant", "chartered accountant", "cpa", "management accountant", "financial accountant", "tax accountant", "external auditor"],
  "221111": ["financial accountant", "corporate accountant", "company accountant"],
  "233512": ["civil engineer", "structural engineer", "civil structural engineer", "roads engineer", "highways engineer", "transport infrastructure engineer"],
  "233111": ["chemical engineer", "process engineer", "chemical process engineer", "refinery engineer"],
  "233311": ["electrical engineer", "power systems engineer", "electrical design engineer", "high voltage engineer"],
  "233411": ["electronics engineer", "rf engineer", "signal processing engineer", "telecommunications engineer hardware"],
  "233511": ["mechanical engineer", "mechatronics engineer", "manufacturing engineer", "product design engineer", "hvac engineer mechanical"],
  "242111": ["secondary school teacher", "high school teacher", "secondary teacher", "stem teacher", "maths teacher"],
  "241111": ["early childhood teacher", "kindergarten teacher", "preschool teacher"],
  "251211": ["physiotherapist", "physical therapist", "physio"],
  "252111": ["pharmacist", "clinical pharmacist", "hospital pharmacist", "community pharmacist"],
  "251111": ["dietitian", "nutritionist", "clinical dietitian", "sports dietitian"],
  "271111": ["lawyer", "solicitor", "barrister", "legal practitioner", "attorney"],
  "311411": ["laboratory technician", "science technician", "chemistry technician", "pathology technician"],
  "312311": ["electrician", "electrical tradesperson", "electrical contractor", "licensed electrician"],
  "332211": ["plumber", "licensed plumber", "gasfitter", "plumbing contractor"],
};

/**
 * Levenshtein distance — fast enough for short tokens.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Score an occupation against the query string.
 * Returns { code, score } — score 0 means no match.
 *
 * Scoring bands:
 *   100 — exact synonym match
 *    80 — synonym substring match (query contains synonym or vice-versa)
 *    50 — occupation title substring match
 *    10 — shared token(s)  (per shared token)
 *     5 — fuzzy synonym match (Levenshtein ≤ 2)
 */
export function scoreOccupation(
  code: string,
  title: string,
  query: string
): number {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase();
  let score = 0;

  // Synonym map check
  const synonyms = TECH_SYNONYMS[code] ?? [];
  for (const syn of synonyms) {
    if (q === syn) { score = Math.max(score, 100); break; }
    if (q.includes(syn) || syn.includes(q)) { score = Math.max(score, 80); }
  }

  // Title substring match
  if (t.includes(q) || q.includes(t)) {
    score = Math.max(score, 50);
  }

  // Token overlap
  const qTokens = q.split(/\s+/);
  const tTokens = t.split(/\s+/);
  let tokenHits = 0;
  for (const qt of qTokens) {
    if (qt.length < 3) continue;
    if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) tokenHits++;
  }
  score += tokenHits * 10;

  // Fuzzy: check each synonym for near-matches on the full query
  if (score === 0) {
    for (const syn of synonyms) {
      if (levenshtein(q, syn) <= 2) {
        score = Math.max(score, 5);
      }
    }
  }

  return score;
}

/**
 * Fuzzy-match a query against all TECH_SYNONYMS entries.
 * Returns up to `limit` entries sorted by closest edit distance.
 * Checks each word token in a multi-word query against each synonym token.
 */
export function fuzzyMatchSynonyms(
  query: string,
  limit = 5
): Array<{ code: string; matchedSynonym: string; distance: number }> {
  const q = query.toLowerCase().trim();
  const qTokens = q.split(/\s+/);
  const results: Array<{ code: string; matchedSynonym: string; distance: number }> = [];

  for (const [code, synonyms] of Object.entries(TECH_SYNONYMS)) {
    let bestDist = Infinity;
    let bestSyn = "";
    for (const syn of synonyms) {
      // Full phrase distance
      const d = levenshtein(q, syn);
      if (d < bestDist) { bestDist = d; bestSyn = syn; }
      // Token-level: check if any single query token is close to any synonym token
      const synTokens = syn.split(/\s+/);
      for (const qt of qTokens) {
        if (qt.length < 4) continue; // skip short tokens
        for (const st of synTokens) {
          if (st.length < 4) continue;
          const td = levenshtein(qt, st);
          if (td < bestDist) { bestDist = td; bestSyn = syn; }
        }
      }
    }
    if (bestDist <= 3) {
      results.push({ code, matchedSynonym: bestSyn, distance: bestDist });
    }
  }

  return results.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

/**
 * Fuzzy-match a query against occupation titles.
 * `allOccupations` is a flat list of { code, title } pairs.
 */
export function fuzzyMatchTitles(
  query: string,
  allOccupations: Array<{ code: string; title: string }>,
  limit = 5
): Array<{ code: string; title: string; distance: number }> {
  const q = query.toLowerCase().trim();
  const qTokens = q.split(/\s+/);
  const results: Array<{ code: string; title: string; distance: number }> = [];

  for (const occ of allOccupations) {
    const t = occ.title.toLowerCase();
    let bestDist = levenshtein(q, t);

    // Also try token-level matching
    const tTokens = t.split(/\s+/);
    for (const qt of qTokens) {
      if (qt.length < 4) continue;
      for (const tt of tTokens) {
        if (tt.length < 4) continue;
        const td = levenshtein(qt, tt);
        if (td < bestDist) bestDist = td;
      }
    }

    if (bestDist <= 3) {
      results.push({ code: occ.code, title: occ.title, distance: bestDist });
    }
  }

  return results.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
