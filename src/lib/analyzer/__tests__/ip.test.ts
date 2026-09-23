import { describe, expect, it } from "vitest";
import { assertPublicHost, decodeBody } from "../fetch";
import { expandIPv6, isPrivateAddress, isPrivateIPv4, isPrivateIPv6 } from "../ip";

/**
 * SSRF 対策のアドレス判定（2026-09-23 に作り直した）。
 * 以前は IPv6 を文字列で見ていたため、WHATWG URL が `[::ffff:127.0.0.1]` を
 * `::ffff:7f00:1` に正規化すると内部アドレスを素通りさせていた。
 */

describe("expandIPv6", () => {
  it("省略形・IPv4 表記・ゾーン ID を 8 つの 16 ビット値に展開する", () => {
    expect(expandIPv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(expandIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("::ffff:7f00:1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(expandIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(expandIPv6("2001:db8::1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(expandIPv6("not-an-ip")).toBeNull();
  });
});

describe("isPrivateIPv4", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("%s は非公開", (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1", "198.20.0.1", "223.255.255.255"])(
    "%s は公開",
    (ip) => {
      expect(isPrivateIPv4(ip)).toBe(false);
    },
  );
});

describe("isPrivateIPv6", () => {
  it.each([
    ["::", "未指定"],
    ["::1", "ループバック"],
    ["::ffff:7f00:1", "IPv4-mapped（URL が正規化した 127.0.0.1）"],
    ["::ffff:127.0.0.1", "IPv4-mapped（ドット表記）"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped の 169.254.169.254"],
    ["::7f00:1", "IPv4-compatible の 127.0.0.1"],
    ["::ffff:0:a00:1", "IPv4-translated の 10.0.0.1"],
    ["64:ff9b::a00:1", "NAT64 の 10.0.0.1"],
    ["64:ff9b::7f00:1", "NAT64 の 127.0.0.1"],
    ["64:ff9b:1::1", "NAT64 のローカル用"],
    ["2002:7f00:1::1", "6to4 の 127.0.0.1"],
    ["2002:c0a8:101::1", "6to4 の 192.168.1.1"],
    ["2001:0:4136:e378:8000:63bf:80ff:fffe", "Teredo のクライアントが 127.0.0.1"],
    ["fe80::1", "リンクローカル"],
    ["febf::1", "リンクローカルの末尾"],
    ["fec0::1", "旧サイトローカル"],
    ["fc00::1", "ULA"],
    ["fd12:3456::1", "ULA"],
    ["ff02::1", "マルチキャスト"],
    ["2001:db8::1", "文書用"],
    ["100::1", "破棄専用"],
  ])("%s（%s）は非公開", (ip) => {
    expect(isPrivateIPv6(ip)).toBe(true);
  });

  it.each([
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "::ffff:808:808",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("%s は公開", (ip) => {
    expect(isPrivateIPv6(ip)).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("角括弧つき・ホスト名を区別する", () => {
    expect(isPrivateAddress("[::1]")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("example.com")).toBe(false);
  });
});

describe("assertPublicHost（URL の正規化を通したあと）", () => {
  it.each([
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/latest/meta-data/",
    "http://[::7f00:1]/",
    "http://[64:ff9b::10.0.0.1]/",
    "http://[2002:a9fe:a9fe::]/",
    "http://[fe80::1]/",
    "http://[fec0::1]/",
    "http://[::]/",
    "http://0.0.0.0/",
    "http://0x7f.1/",
    "http://2130706433/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://255.255.255.255/",
    "http://localhost./",
  ])("%s を blocked_host で止める", async (raw) => {
    await expect(assertPublicHost(new URL(raw))).rejects.toMatchObject({
      name: "FetchError",
      code: "blocked_host",
    });
  });

  it("中断済みのシグナルでは DNS を待たずに timeout で返す", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      assertPublicHost(new URL("https://example.invalid/"), controller.signal),
    ).rejects.toMatchObject({ name: "FetchError", code: "timeout" });
  });
});

describe("decodeBody の文字コード", () => {
  // 「日本」を Shift_JIS / EUC-JP にしたバイト列
  const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]);
  const eucjp = new Uint8Array([0xc6, 0xfc, 0xcb, 0xdc]);

  it("引用符つきの charset を読む", () => {
    expect(decodeBody(sjis, 'text/html; charset="Shift_JIS"')).toBe("日本");
  });

  it("euc_jp のような下線のラベルも読む", () => {
    expect(decodeBody(eucjp, "text/html; charset=euc_jp")).toBe("日本");
  });

  it("ヘッダーに無ければ meta charset を読む", () => {
    const html = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="euc-jp">'),
      ...eucjp,
    ]);
    expect(decodeBody(html, "text/html")).toBe('<meta charset="euc-jp">日本');
  });
});
