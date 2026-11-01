/**
 * Stream URL unlocking.
 *
 * googlevideo URLs in `adaptiveFormats` are protected in two ways:
 *  1. `signatureCipher` - the `s` param must be transformed by the decipher
 *     function inside YouTube's player JS, then sent as `sig`.
 *  2. `n` param - must be transformed by the (heavily obfuscated) `n` function,
 *     otherwise the CDN throttles or 403s the request.
 *
 * Both transforms live in `base.js`. We extract the relevant function bodies
 * and re-implement the transform plan (the same strategy as yt-dlp's
 * "jsinterp"). This is best-effort by design: if extraction fails we return
 * null and the API reports "no streams", so the UI silently falls back to the
 * official embed player instead of showing a broken video.
 *
 * Node-only (uses `new Function` on YouTube's own JS).
 */

export type DecipherPlan = string[];

/** Extract the body of the function that starts at `start` (brace matched). */
export function sliceFunctionBody(source: string, start: number): string | null {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** Resolve `NAME=function(a,b){...}` / `NAME:function(a,b){...}` definitions. */
function resolveHelper(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:var\\s+)?${escaped}\\s*[:=]\\s*function\\s*\\([^)]*\\)\\s*\\{`);
  const match = re.exec(source);
  if (!match) return null;
  return sliceFunctionBody(source, match.index + match[0].length - 1);
}

function numericValue(source: string, token: string, body: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  const re = new RegExp(`(?:var\\s+)?${token}\\s*=\\s*(\\d+)`);
  const local = re.exec(body) ?? re.exec(source);
  return local ? Number(local[1]) : null;
}

/**
 * Parse a decipher function body into an ordered list of operations:
 *   "r"      reverse
 *   "s3"     splice(0, 3)
 *   "w42"    swap(0, 42)
 */
export function buildPlan(source: string, body: string): DecipherPlan {
  const plan: DecipherPlan = [];
  const chunks = body.split(";");
  for (const chunk of chunks) {
    const statement = chunk.trim();
    if (!statement || statement.startsWith("return")) continue;
    if (/\.reverse\(\)/.test(statement)) {
      plan.push("r");
      continue;
    }
    const splice = /\.splice\(0\s*,\s*([A-Za-z0-9_$]+)\)/.exec(statement);
    if (splice) {
      const value = numericValue(source, splice[1] as string, body);
      if (value != null) plan.push(`s${value}`);
      continue;
    }
    const swap = /\[0\];[^;]*\[0\]\s*=\s*[A-Za-z0-9_$]+\s*\[\s*([A-Za-z0-9_$]+)\s*%\s*[A-Za-z0-9_$]+\.length\s*\]/.exec(
      statement,
    );
    if (swap) {
      const value = numericValue(source, swap[1] as string, body);
      if (value != null) plan.push(`w${value}`);
      continue;
    }
    // helper call: NAME(a, 3) / NAME(a, b)
    const call = /([A-Za-z0-9_$]{1,4})\s*\(\s*[A-Za-z0-9_$]+\s*,\s*([A-Za-z0-9_$.]+)\s*\)/.exec(statement);
    if (call) {
      const helper = resolveHelper(source, call[1] as string);
      if (helper) {
        if (/\.reverse\(\)/.test(helper)) plan.push("r");
        else if (/\.splice\(0\s*,/.test(helper)) {
          const value = numericValue(source, call[2] as string, helper);
          if (value != null) plan.push(`s${value}`);
        } else if (/\[0\];/.test(helper)) {
          const value = numericValue(source, call[2] as string, helper);
          if (value != null) plan.push(`w${value}`);
        }
      }
    }
  }
  return plan;
}

/** Locate and parse the signature decipher function in player JS. */
export function extractDecipherPlan(playerJs: string): DecipherPlan | null {
  const anchors: number[] = [];
  const re = /\.split\(""\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(playerJs)) !== null) anchors.push(match.index);

  for (const anchor of anchors) {
    const fnStart = playerJs.lastIndexOf("function", anchor);
    if (fnStart < 0) continue;
    const body = sliceFunctionBody(playerJs, fnStart);
    if (!body) continue;
    if (!/\.join\(""\)/.test(body)) continue;
    const plan = buildPlan(playerJs, body);
    // A plausible decipher plan is at least one operation and only known ops.
    if (plan.length && plan.every((op) => /^[rsw]\d*$/.test(op))) return plan;
  }
  return null;
}

export function applyPlan(signature: string, plan: DecipherPlan): string {
  let chars = signature.split("");
  for (const op of plan) {
    const kind = op[0];
    const value = Number.parseInt(op.slice(1), 10);
    if (kind === "r") {
      chars.reverse();
    } else if (kind === "s") {
      chars = chars.slice(value);
    } else if (kind === "w") {
      const index = chars.length ? value % chars.length : 0;
      const first = chars[0];
      chars[0] = chars[index] as string;
      chars[index] = first as string;
    }
  }
  return chars.join("");
}

export type ParsedCipher = { url?: string; s?: string; sp?: string };

/** Parse the `signatureCipher` / `cipher` query string. */
export function parseCipherString(cipher: string): ParsedCipher {
  const out: ParsedCipher = {};
  for (const pair of cipher.split("&")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx);
    const value = decodeURIComponent(pair.slice(idx + 1));
    if (key === "url") out.url = value;
    else if (key === "s") out.s = value;
    else if (key === "sp") out.sp = value;
  }
  return out;
}

export function applySignature(url: string, signature: string, sp: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(sp, signature);
  return parsed.toString();
}

/**
 * Extract the `n` transform. The function is usually referenced as
 * `.get("n"))&&(b=NAME[0](b)` or `(b=NAME(b)` and defined elsewhere as a plain
 * function or in an array of functions. We brace-match the candidate and
 * evaluate it in an isolated Function scope.
 */
export function extractNFunction(playerJs: string): ((input: string) => string) | null {
  const reference =
    /\.get\("n"\)\)?&&\(b=([A-Za-z0-9_$]+)(?:\[(\d+)\])?\(b\)/.exec(playerJs) ??
    /\.get\("n"\)\)?&&\([a-zA-Z]=([A-Za-z0-9_$]+)(?:\[(\d+)\])?\([a-zA-Z]\)/.exec(playerJs);
  if (!reference) return null;

  const [, name, arrayIndex] = reference;
  let candidateSource: string | null = null;

  if (arrayIndex != null) {
    const arrayRe = new RegExp(`(?:var\\s+)?${name}\\s*=\\s*\\[`);
    const arrayMatch = arrayRe.exec(playerJs);
    if (arrayMatch) {
      const open = arrayMatch.index + arrayMatch[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let i = open; i < playerJs.length; i++) {
        if (playerJs[i] === "[") depth++;
        else if (playerJs[i] === "]") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > 0) {
        const arraySource = playerJs.slice(open + 1, end);
        const wanted = Number(arrayIndex);
        // split top-level function entries
        const entries: string[] = [];
        let current = "";
        let localDepth = 0;
        for (const ch of arraySource) {
          if (ch === "{" || ch === "(" || ch === "[") localDepth++;
          if (ch === "}" || ch === ")" || ch === "]") localDepth--;
          if (ch === "," && localDepth === 0) {
            entries.push(current);
            current = "";
            continue;
          }
          current += ch;
        }
        if (current.trim()) entries.push(current);
        candidateSource = entries[wanted]?.trim() ?? null;
      }
    }
  } else {
    const fnRe = new RegExp(`(?:var\\s+)?${name}\\s*[:=]\\s*function\\s*\\([^)]*\\)\\s*\\{`);
    const fnMatch = fnRe.exec(playerJs);
    if (fnMatch) {
      const body = sliceFunctionBody(playerJs, fnMatch.index + fnMatch[0].length - 1);
      if (body) candidateSource = `function(a){${body}}`;
    }
  }

  if (!candidateSource) return null;

  try {
    // Isolated scope: YouTube's own function, evaluated once, never persisted.
    const factory = new Function(`"use strict"; return (${candidateSource});`) as () => unknown;
    const fn = factory();
    if (typeof fn !== "function") return null;
    return (input: string) => String((fn as (value: string) => unknown)(input));
  } catch {
    return null;
  }
}

export type UnlockContext = {
  plan: DecipherPlan | null;
  nTransform: ((input: string) => string) | null;
};

export function createUnlockContext(playerJs: string | null): UnlockContext {
  if (!playerJs) return { plan: null, nTransform: null };
  return {
    plan: safeExtract(playerJs),
    nTransform: safeExtractN(playerJs),
  };
}

function safeExtract(playerJs: string): DecipherPlan | null {
  try {
    return extractDecipherPlan(playerJs);
  } catch {
    return null;
  }
}

function safeExtractN(playerJs: string): ((input: string) => string) | null {
  try {
    return extractNFunction(playerJs);
  } catch {
    return null;
  }
}

/** Apply signature + n transforms to a raw format object. */
export function unlockUrl(
  raw: { url?: string; signatureCipher?: string; cipher?: string },
  context: UnlockContext,
): string | null {
  const cipherString = raw.signatureCipher ?? raw.cipher;
  let url = raw.url ?? null;
  let signature: string | null = null;
  let sp = "sig";

  if (!url && cipherString) {
    const parsed = parseCipherString(cipherString);
    url = parsed.url ?? null;
    signature = parsed.s ?? null;
    sp = parsed.sp ?? "sig";
  }
  if (!url) return null;

  if (signature && context.plan) {
    url = applySignature(url, applyPlan(signature, context.plan), sp);
  } else if (signature && !context.plan) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const n = parsed.searchParams.get("n");
    if (n && context.nTransform) {
      parsed.searchParams.set("n", context.nTransform(n));
      url = parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}
