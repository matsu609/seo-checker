import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ASSERTION_LIFETIME_SEC,
  GA4_SCOPE,
  JWT_BEARER_GRANT_TYPE,
  TOKEN_ENDPOINT,
  TOKEN_EXPIRY_MARGIN_MS,
  buildAssertion,
  clearTokenCache,
  fetchAccessToken,
  getAccessToken,
  isTokenFresh,
  parseServiceAccount,
  signJws,
} from "../auth";
import { Ga4Error, type ServiceAccount } from "../types";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ACCOUNT: ServiceAccount = {
  clientEmail: "reporter@example.iam.gserviceaccount.com",
  privateKey: PEM,
  tokenUri: TOKEN_ENDPOINT,
};

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

describe("signJws / buildAssertion", () => {
  it("node:crypto で検証できる RS256 の署名を作る", () => {
    const now = new Date("2026-09-07T00:00:00.000Z");
    const jws = buildAssertion(ACCOUNT, { now });
    const [header, payload, signature] = jws.split(".");
    expect(jws.split(".")).toHaveLength(3);

    expect(decodePart(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodePart(payload)).toEqual({
      iss: ACCOUNT.clientEmail,
      scope: GA4_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: 1788739200,
      exp: 1788739200 + ASSERTION_LIFETIME_SEC,
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("base64url は + / = を含まない", () => {
    const jws = buildAssertion(ACCOUNT, { now: new Date("2026-09-07T00:00:00.000Z") });
    expect(jws).not.toMatch(/[+/=]/);
  });

  it("署名対象が 1 文字でも違えば検証に失敗する", () => {
    const jws = signJws(
      { iss: "a@b.c", scope: GA4_SCOPE, aud: TOKEN_ENDPOINT, iat: 1, exp: 2 },
      PEM,
    );
    const [header, payload, signature] = jws.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}x`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(false);
  });

  it("秘密鍵が PEM として読めなければ config エラー", () => {
    expect(() => signJws({ iss: "a", scope: "s", aud: "u", iat: 1, exp: 2 }, "not-a-key")).toThrow(Ga4Error);
  });
});

describe("parseServiceAccount", () => {
  const json = JSON.stringify({
    type: "service_account",
    client_email: "reporter@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n",
  });

  it("生 JSON を読み、\\n を実際の改行に戻す", () => {
    const account = parseServiceAccount(json);
    expect(account.clientEmail).toBe("reporter@example.iam.gserviceaccount.com");
    expect(account.privateKey).toContain("\n");
    expect(account.privateKey).not.toContain("\\n");
    expect(account.tokenUri).toBe(TOKEN_ENDPOINT);
  });

  it("base64 でも読める", () => {
    const account = parseServiceAccount(Buffer.from(json, "utf8").toString("base64"));
    expect(account.clientEmail).toBe("reporter@example.iam.gserviceaccount.com");
  });

  it("前後の空白を無視する", () => {
    expect(parseServiceAccount(`  ${json}  `).clientEmail).toContain("@");
  });

  it("token_uri を上書きできる", () => {
    const custom = JSON.stringify({
      client_email: "a@b.c",
      private_key: "k",
      token_uri: "https://oauth2.example.test/token",
    });
    expect(parseServiceAccount(custom).tokenUri).toBe("https://oauth2.example.test/token");
  });

  it("JSON でも base64 でもなければ config エラー", () => {
    expect(() => parseServiceAccount("!!! not json !!!")).toThrow(Ga4Error);
  });

  it("client_email / private_key が無ければ config エラー", () => {
    expect(() => parseServiceAccount(JSON.stringify({ client_email: "a@b.c" }))).toThrow(
      /client_email または private_key/,
    );
  });

  it("空文字は config エラー", () => {
    expect(() => parseServiceAccount("   ")).toThrow(Ga4Error);
  });
});

describe("fetchAccessToken", () => {
  it("jwt-bearer の form を送り、access_token と失効時刻を返す", async () => {
    const now = new Date("2026-09-07T00:00:00.000Z");
    let seen: { url: string; body: string } | null = null;
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seen = { url: String(url), body: String(init?.body ?? "") };
      return new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3599 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const token = await fetchAccessToken(ACCOUNT, { fetchImpl, now });
    expect(token.token).toBe("ya29.token");
    expect(token.expiresAt).toBe(now.getTime() + 3599 * 1000);

    const request = seen as unknown as { url: string; body: string };
    expect(request.url).toBe(TOKEN_ENDPOINT);
    const params = new URLSearchParams(request.body);
    expect(params.get("grant_type")).toBe(JWT_BEARER_GRANT_TYPE);
    expect(params.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("400 は config エラー（設定ミス）にする", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT" }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(fetchAccessToken(ACCOUNT, { fetchImpl })).rejects.toMatchObject({ code: "config" });
  });

  it("access_token が無ければ upstream エラー", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchAccessToken(ACCOUNT, { fetchImpl })).rejects.toMatchObject({ code: "upstream" });
  });

  it("ネットワーク例外は upstream エラー", async () => {
    const fetchImpl = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(fetchAccessToken(ACCOUNT, { fetchImpl })).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("トークンキャッシュの期限境界", () => {
  beforeEach(() => clearTokenCache());

  function counting(expiresIn: number) {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ access_token: `token-${calls}`, expires_in: expiresIn }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls };
  }

  it("失効 5 分前より手前なら使い回す", async () => {
    const base = new Date("2026-09-07T00:00:00.000Z");
    const { fetchImpl, calls } = counting(3600);
    expect(await getAccessToken(ACCOUNT, { fetchImpl, now: base })).toBe("token-1");
    // 失効の 5 分 + 1 ミリ秒前 → まだ使える
    const justBefore = new Date(base.getTime() + 3600_000 - TOKEN_EXPIRY_MARGIN_MS - 1);
    expect(await getAccessToken(ACCOUNT, { fetchImpl, now: justBefore })).toBe("token-1");
    expect(calls()).toBe(1);
  });

  it("失効 5 分前ちょうどで取り直す", async () => {
    const base = new Date("2026-09-07T00:00:00.000Z");
    const { fetchImpl, calls } = counting(3600);
    await getAccessToken(ACCOUNT, { fetchImpl, now: base });
    const boundary = new Date(base.getTime() + 3600_000 - TOKEN_EXPIRY_MARGIN_MS);
    expect(await getAccessToken(ACCOUNT, { fetchImpl, now: boundary })).toBe("token-2");
    expect(calls()).toBe(2);
  });

  it("isTokenFresh は未取得（undefined）を false にする", () => {
    expect(isTokenFresh(undefined, 0)).toBe(false);
    expect(isTokenFresh({ token: "t", expiresAt: 10 * 60 * 1000 }, 0)).toBe(true);
    expect(isTokenFresh({ token: "t", expiresAt: TOKEN_EXPIRY_MARGIN_MS }, 0)).toBe(false);
  });

  it("clearTokenCache のあとは取り直す", async () => {
    const now = new Date("2026-09-07T00:00:00.000Z");
    const { fetchImpl, calls } = counting(3600);
    await getAccessToken(ACCOUNT, { fetchImpl, now });
    clearTokenCache();
    await getAccessToken(ACCOUNT, { fetchImpl, now });
    expect(calls()).toBe(2);
  });
});
