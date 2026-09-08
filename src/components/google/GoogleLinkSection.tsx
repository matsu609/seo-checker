/**
 * 設定画面の「Google 連携」（サーバー側）。
 * 状態の取得はここで済ませ、操作だけをクライアント部品に渡す。
 * Suspense の中に置く前提なので、Google が遅くても設定画面の他は先に出る。
 */
import { loadGoogleStatus } from "@/lib/google/status";
import { GoogleLinkPanel } from "./GoogleLinkPanel";

export async function GoogleLinkSection() {
  return <GoogleLinkPanel status={await loadGoogleStatus()} />;
}
