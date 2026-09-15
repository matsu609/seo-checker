import { describe, expect, it } from "vitest";
import { eventDate, fetchRdapDomain, parseRdap, RDAP_ENDPOINT, registrarName } from "../rdap";

const PAYLOAD = {
  objectClassName: "domain",
  ldhName: "EXAMPLE.COM",
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2027-08-13T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2025-08-14T07:01:44Z" },
  ],
  entities: [
    { roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "サンプル レジストラ"]]] },
    { roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "だれか"]]] },
  ],
};

function okFetch(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/rdap+json" } })) as unknown as typeof fetch;
}

describe("RDAP の読み取り", () => {
  it("登録日・更新日・有効期限を ISO で取る", () => {
    expect(eventDate(PAYLOAD, "registration")).toBe("1995-08-14T04:00:00.000Z");
    expect(eventDate(PAYLOAD, "expiration")).toBe("2027-08-13T04:00:00.000Z");
    expect(eventDate(PAYLOAD, "transfer")).toBeNull();
    expect(eventDate(null, "registration")).toBeNull();
  });

  it("レジストラ名は registrar の役割から取る", () => {
    expect(registrarName(PAYLOAD)).toBe("サンプル レジストラ");
    expect(registrarName({ entities: [] })).toBeNull();
  });

  it("events が無くても落ちない", () => {
    const parsed = parseRdap("example.com", { objectClassName: "domain" });
    expect(parsed).toEqual({ domain: "example.com", registeredAt: null, updatedAt: null, expiresAt: null, registrar: null });
  });
});

describe("RDAP の取得", () => {
  it("登録ドメイン以外は投げずに invalid を返す", async () => {
    const outcome = await fetchRdapDomain("example.com/../../etc/passwd", { fetchImpl: okFetch(PAYLOAD) });
    expect(outcome.failure).toBe("invalid");
    expect(outcome.result).toBeNull();
  });

  it("登録ドメインだけを URL に付ける", async () => {
    let called = "";
    const spy = (async (url: string) => {
      called = url;
      return new Response(JSON.stringify(PAYLOAD), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await fetchRdapDomain("rdap-test-1.example", { fetchImpl: spy });
    expect(called).toBe(`${RDAP_ENDPOINT}rdap-test-1.example`);
    expect(outcome.result?.registeredAt).toBe("1995-08-14T04:00:00.000Z");
  });

  it("404 は「対応していない TLD」として扱い、報告書は止めない", async () => {
    const outcome = await fetchRdapDomain("rdap-test-2.example", { fetchImpl: okFetch({}, 404) });
    expect(outcome.failure).toBe("not-found");
    expect(outcome.message).toContain("RDAP");
  });

  it("接続できないときは network", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const outcome = await fetchRdapDomain("rdap-test-3.example", { fetchImpl: boom });
    expect(outcome.failure).toBe("network");
  });
});
