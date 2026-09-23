/**
 * SSL 証明書の期限と検証結果（サーバー専用。Node の tls で 1 回接続するだけ）。
 *
 * ページの取得（fetch）は証明書が不正だと失敗して理由が分からないので、別に見る。
 * rejectUnauthorized: false で接続し、authorizationError を「検証の失敗」として読む。
 *
 * **接続の前に、行き先が公開アドレスかを確かめる**（2026-09-23）。以前は `tls.connect` を
 * そのまま呼んでいたため、ホームページの URL に内部のホスト名・アドレスを入れると
 * 内部ネットワークの :443 に接続でき、その結果（接続できたか・エラーの文面）が画面に出ていた
 * （ページの取得は src/lib/analyzer/fetch.ts の assertPublicHost を通るのに、ここだけ抜けていた）。
 * 名前を引き直したときに内部アドレスへ変わる（DNS rebinding）ことも防ぐため、確かめたアドレスに
 * そのまま接続する（証明書の名前は servername で渡す）。
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import tls from "node:tls";
import { assertPublicHost, FetchError } from "@/lib/analyzer/fetch";
import type { SslCheck } from "./types";

const TIMEOUT_MS = 8_000;

/** IPv6 のアドレスは URL の中で [] に入れる */
function hostForUrl(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

/**
 * 接続してよい公開アドレスを 1 つ返す。内部のホスト・アドレスなら FetchError（blocked_host）。
 * 名前の段階の確認（localhost・.local・引いた全アドレス）と、実際に接続するアドレスの確認の 2 回。
 */
export async function resolvePublicAddress(host: string): Promise<string> {
  await assertPublicHost(new URL(`https://${hostForUrl(host)}/`));
  const address = isIP(host) ? host : (await lookup(host)).address;
  await assertPublicHost(new URL(`https://${hostForUrl(address)}/`));
  return address;
}

export interface CheckCertificateOptions {
  /** 接続先のアドレスを決める（テスト用に差し替えられる） */
  resolve?: (host: string) => Promise<string>;
  /** 接続（テスト用に差し替えられる） */
  connect?: (options: tls.ConnectionOptions, onConnect: () => void) => tls.TLSSocket;
}

export async function checkCertificate(rawHost: string, now = new Date(), options: CheckCertificateOptions = {}): Promise<SslCheck> {
  // URL.hostname は IPv6 を [] で包んで返すので外す
  const host = rawHost.replace(/^\[|\]$/g, "");
  let address: string;
  try {
    address = await (options.resolve ?? resolvePublicAddress)(host);
  } catch (err) {
    // 内部アドレスは「確認しなかった」として扱い、理由も出さない（到達性を調べる材料にしない。crawl と同じ扱い）
    if (err instanceof FetchError && err.code === "blocked_host") return { validTo: null, daysLeft: null, error: null };
    return { validTo: null, daysLeft: null, error: "接続できませんでした（ホスト名を解決できませんでした）" };
  }
  const connect = options.connect ?? ((o: tls.ConnectionOptions, onConnect: () => void) => tls.connect(o, onConnect));

  return new Promise((resolve) => {
    let done = false;
    const finish = (r: SslCheck) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    let socket: tls.TLSSocket | null = null;
    const timer = setTimeout(() => {
      socket?.destroy();
      finish({ validTo: null, daysLeft: null, error: "証明書の確認がタイムアウトしました" });
    }, TIMEOUT_MS);
    try {
      // 確かめたアドレスへ接続し、証明書の名前（SNI）は元のホスト名で渡す（IP アドレスは SNI に使えない）
      socket = connect({ host: address, port: 443, ...(isIP(host) ? {} : { servername: host }), rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
        clearTimeout(timer);
        const cert = socket?.getPeerCertificate();
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const daysLeft = validTo && !Number.isNaN(validTo.getTime()) ? Math.floor((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;
        const authError = socket && !socket.authorized ? socket.authorizationError : null;
        const error = authError ? `証明書の検証に失敗しました（${String(authError)}）` : null;
        socket?.end();
        finish({ validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo.toISOString() : null, daysLeft, error });
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        finish({ validTo: null, daysLeft: null, error: `接続できませんでした（${err.message}）` });
      });
    } catch (err) {
      clearTimeout(timer);
      finish({ validTo: null, daysLeft: null, error: `確認できませんでした（${err instanceof Error ? err.message : "不明"}）` });
    }
  });
}
