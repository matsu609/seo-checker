/**
 * SSL 証明書の確認で内部ネットワークに接続しない（2026-09-23）。
 *
 * 以前は tls.connect をそのまま呼んでいたので、ホームページの URL に内部のアドレスを入れると
 * 内部の :443 に接続でき、エラーの文面が画面に出ていた。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type tls from "node:tls";
import { checkCertificate } from "../ssl";

const KEEP = process.env.ALLOW_PRIVATE_HOSTS;
beforeEach(() => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
});
afterEach(() => {
  if (KEEP === undefined) delete process.env.ALLOW_PRIVATE_HOSTS;
  else process.env.ALLOW_PRIVATE_HOSTS = KEEP;
});

type Connect = (options: tls.ConnectionOptions, onConnect: () => void) => tls.TLSSocket;

/** 接続したことにするダミー（渡されたオプションを覚える） */
function fakeConnect(seen: tls.ConnectionOptions[]): Connect {
  return ((options: tls.ConnectionOptions, onConnect: () => void) => {
    seen.push(options);
    const socket = {
      authorized: true,
      authorizationError: null,
      getPeerCertificate: () => ({ valid_to: "Dec 31 00:00:00 2026 GMT" }),
      end: () => {},
      destroy: () => {},
      on: () => socket,
    };
    queueMicrotask(onConnect);
    return socket;
  }) as unknown as Connect;
}

describe("SSL 証明書の確認", () => {
  it("localhost・内部アドレスには接続せず、理由も出さない", async () => {
    const seen: tls.ConnectionOptions[] = [];
    const connect = vi.fn(fakeConnect(seen));
    for (const host of ["localhost", "intranet.local", "10.0.0.5", "127.0.0.1", "169.254.169.254", "::1", "[::1]"]) {
      expect(await checkCertificate(host, new Date("2026-09-23T00:00:00Z"), { connect })).toEqual({ validTo: null, daysLeft: null, error: null });
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it("名前を引いたアドレスが内部なら接続しない（名前を引き直して変わる手口も防ぐ）", async () => {
    const connect = vi.fn(fakeConnect([]));
    const result = await checkCertificate("rebind.example", new Date("2026-09-23T00:00:00Z"), {
      resolve: async () => {
        const { FetchError } = await import("@/lib/analyzer/fetch");
        throw new FetchError("内部ネットワークのアドレスは診断できません", "blocked_host");
      },
      connect,
    });
    expect(result.error).toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it("確かめたアドレスへ接続し、証明書の名前はホスト名で渡す", async () => {
    const seen: tls.ConnectionOptions[] = [];
    const result = await checkCertificate("sample-kobo.jp", new Date("2026-12-01T00:00:00Z"), { resolve: async () => "203.0.113.10", connect: fakeConnect(seen) });
    expect(seen[0]).toMatchObject({ host: "203.0.113.10", servername: "sample-kobo.jp", port: 443 });
    expect(result).toMatchObject({ daysLeft: 30, error: null });
  });

  it("名前を解決できないときは内部の文面を出さずに知らせる", async () => {
    const result = await checkCertificate("nothing.invalid", new Date(), {
      resolve: async () => {
        throw new Error("getaddrinfo ENOTFOUND nothing.invalid");
      },
      connect: fakeConnect([]),
    });
    expect(result.error).toBe("接続できませんでした（ホスト名を解決できませんでした）");
  });
});
