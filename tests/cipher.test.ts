import { describe, expect, it } from "vitest";
import {
  applyPlan,
  applySignature,
  buildPlan,
  extractDecipherPlan,
  extractNFunction,
  parseCipherString,
  sliceFunctionBody,
  unlockUrl,
  type UnlockContext,
} from "@/lib/innertube/cipher";

const PLAYER_JS = `
var Ea={rv:function(a){a.reverse()},sl:function(a,b){a.splice(0,b)},sw:function(a,b){var c=a[0];a[0]=a[b%a.length];a[b%a.length]=c}};
Ea.FY=25;
function bcd(a){a=a.split("");Ea.sw(a,Ea.FY);Ea.rv(a,41);Ea.sl(a,3);return a.join("")}
var Xs=[function(a){a=a.split("");a.reverse();return a.join("")}];
something.get("n"))&&(b=Xs[0](b)
`;

describe("sliceFunctionBody", () => {
  it("brace-matches nested blocks and ignores braces inside strings", () => {
    const source = 'function f(a){var s="{";if(a){return "}"}return s}';
    const body = sliceFunctionBody(source, 0);
    expect(body).toBe('var s="{";if(a){return "}"}return s');
  });
});

describe("buildPlan", () => {
  it("reads reverse/splice/swap operations and resolves helper constants", () => {
    const plan = buildPlan(PLAYER_JS, "a=a.split(\"\");Ea.sw(a,Ea.FY);Ea.rv(a,41);Ea.sl(a,3);return a.join(\"\")");
    expect(plan).toEqual(["w25", "r", "s3"]);
  });
});

describe("extractDecipherPlan", () => {
  it("finds the decipher function and applies it", () => {
    const plan = extractDecipherPlan(PLAYER_JS);
    expect(plan).toEqual(["w25", "r", "s3"]);
    // deterministic transformation: swap 25 % 10 = 5, reverse, drop the first 3
    const out = applyPlan("abcdefghij", plan!);
    expect(out).toBe("gaedcbf");
  });
});

describe("parseCipherString + applySignature", () => {
  it("extracts url, s and sp", () => {
    const parsed = parseCipherString(
      "s=ABCDEF&sp=sig&url=https%3A%2F%2Fr1.googlevideo.com%2Fvideoplayback%3Fitag%3D137",
    );
    expect(parsed.s).toBe("ABCDEF");
    expect(parsed.sp).toBe("sig");
    const signed = applySignature(parsed.url!, "SIGNED", parsed.sp!);
    expect(signed).toContain("sig=SIGNED");
  });
});

describe("extractNFunction", () => {
  it("resolves an array-indexed n transform and runs it", () => {
    const transform = extractNFunction(PLAYER_JS);
    expect(transform).not.toBeNull();
    expect(transform!("abc")).toBe("cba");
  });
});

describe("unlockUrl", () => {
  it("applies the signature plan and the n transform", () => {
    const context: UnlockContext = {
      plan: ["r"],
      nTransform: (input) => `${input}-ok`,
    };
    const url = unlockUrl(
      {
        signatureCipher:
          "s=abc&sp=sig&url=https%3A%2F%2Fr1.googlevideo.com%2Fvideoplayback%3Fn%3Dxyz%26itag%3D137",
      },
      context,
    );
    expect(url).toContain("sig=cba");
    expect(url).toContain("n=xyz-ok");
  });

  it("returns null when a signature exists but no plan was extracted", () => {
    const url = unlockUrl(
      { signatureCipher: "s=abc&url=https%3A%2F%2Fr1.googlevideo.com%2Fvideoplayback" },
      { plan: null, nTransform: null },
    );
    expect(url).toBeNull();
  });
});
