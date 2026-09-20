/**
 * SSL 証明書の期限と検証結果（サーバー専用。Node の tls で 1 回接続するだけ）。
 *
 * ページの取得（fetch）は証明書が不正だと失敗して理由が分からないので、別に見る。
 * rejectUnauthorized: false で接続し、authorizationError を「検証の失敗」として読む。
 */
import tls from "node:tls";
import type { SslCheck } from "./types";

const TIMEOUT_MS = 8_000;

export async function checkCertificate(host: string, now = new Date()): Promise<SslCheck> {
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
      socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
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
