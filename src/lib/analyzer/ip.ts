import { isIP } from "node:net";

/**
 * SSRF 対策の「公開アドレスかどうか」の判定。`fetch.ts` の `assertPublicHost` から使う。
 *
 * 2026-09-23 に作り直した。以前は IPv6 を文字列の前方一致で見ていたため、
 * WHATWG URL が `[::ffff:127.0.0.1]` を `::ffff:7f00:1` に正規化すると
 * IPv4 埋め込みを取り出せず、`http://[::ffff:169.254.169.254]/` のような
 * 内部アドレスを素通りさせていた。ここでは IPv6 を必ず 8 つの 16 ビット値に
 * 展開してから、埋め込まれた IPv4（mapped / compat / NAT64 / 6to4 / Teredo）を
 * 取り出して IPv4 の判定にかける。
 */

/** IPv4 を 4 つの数値に分ける。形式が違えば null */
function parseIPv4(ip: string): [number, number, number, number] | null {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts as [number, number, number, number];
}

/**
 * 公開インターネットに無い IPv4 か。
 * 対象: 0/8・10/8・100.64/10（CGNAT）・127/8・169.254/16（クラウドのメタデータを含む）・
 * 172.16/12・192.0.0/24・192.0.2/24・192.168/16・198.18/15（ベンチマーク）・
 * 198.51.100/24・203.0.113/24（文書用）・224/4（マルチキャスト）・240/4（予約。ブロードキャストを含む）
 */
export function isPrivateIPv4(ip: string): boolean {
  const p = parseIPv4(ip);
  // 形式が読めないものは安全側（非公開）に倒す
  if (!p) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * IPv6 を 8 つの 16 ビット値に展開する。末尾が IPv4 表記（`::ffff:1.2.3.4`）でも読む。
 * ゾーン ID（`fe80::1%eth0`）は外してから読む。形式が違えば null。
 */
export function expandIPv6(ip: string): number[] | null {
  const bare = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (isIP(bare) !== 6) return null;
  let text = bare.toLowerCase();
  // 末尾の IPv4 表記は 16 ビット 2 つに直す
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    const p = parseIPv4(v4[1]);
    if (!p) return null;
    const hi = ((p[0] << 8) | p[1]).toString(16);
    const lo = ((p[2] << 8) | p[3]).toString(16);
    text = `${text.slice(0, v4.index)}${hi}:${lo}`;
  }
  const [head, tail] = text.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (tail === undefined ? missing !== 0 : missing < 0) return null;
  const parts = [
    ...headParts,
    ...Array.from({ length: tail === undefined ? 0 : missing }, () => "0"),
    ...tailParts,
  ].map((h) => parseInt(h, 16));
  if (parts.length !== 8 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    return null;
  }
  return parts;
}

/** 16 ビット値 2 つを IPv4 の文字列にする */
function v4From(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/** 公開インターネットに無い（またはその IPv4 を包んだ）IPv6 か */
export function isPrivateIPv6(ip: string): boolean {
  const h = expandIPv6(ip);
  // 形式が読めないものは安全側（非公開）に倒す
  if (!h) return true;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  const upper5Zero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;

  // ::ffff:0:0/96（IPv4-mapped）→ 中の IPv4 で判定
  if (upper5Zero && h5 === 0xffff) return isPrivateIPv4(v4From(h6, h7));
  // ::/96（IPv4-compatible。:: と ::1 もここに入り、0.0.0.0/8 として止まる）
  if (upper5Zero && h5 === 0) return isPrivateIPv4(v4From(h6, h7));
  // ::ffff:0:0:0/96（SIIT の IPv4-translated）→ 中の IPv4 で判定
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0xffff && h5 === 0) {
    return isPrivateIPv4(v4From(h6, h7));
  }
  // 64:ff9b::/96（NAT64 の既定プレフィックス）→ 中の IPv4 で判定
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return isPrivateIPv4(v4From(h6, h7));
  }
  // 64:ff9b:1::/48（NAT64 のローカル用プレフィックス）は組織内でしか意味を持たない
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 1) return true;
  // 2002::/16（6to4）→ 2〜3 番目の 16 ビットが IPv4
  if (h0 === 0x2002) return isPrivateIPv4(v4From(h1, h2));
  // 2001:0::/32（Teredo）→ 末尾 32 ビットを反転したものがクライアントの IPv4
  if (h0 === 0x2001 && h1 === 0) {
    return isPrivateIPv4(v4From(h6 ^ 0xffff, h7 ^ 0xffff)) || isPrivateIPv4(v4From(h2, h3));
  }
  // 2001:db8::/32（文書用）
  if (h0 === 0x2001 && h1 === 0x0db8) return true;
  // 100::/64（破棄専用）
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true;
  // fc00::/7（ULA）
  if ((h0 & 0xfe00) === 0xfc00) return true;
  // fe80::/10（リンクローカル）と fec0::/10（旧サイトローカル）
  if ((h0 & 0xffc0) === 0xfe80 || (h0 & 0xffc0) === 0xfec0) return true;
  // ff00::/8（マルチキャスト）
  if ((h0 & 0xff00) === 0xff00) return true;
  return false;
}

/** IP アドレスの文字列が公開インターネットに無いか。IP でなければ false（ホスト名は別に解決する） */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0];
  const v = isIP(bare);
  if (v === 4) return isPrivateIPv4(bare);
  if (v === 6) return isPrivateIPv6(bare);
  return false;
}
