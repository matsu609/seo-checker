/**
 * 「計測前のイメージ」の横軸に使う日付（純関数・テスト対象）。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにして、デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるようにしてほしい」。
 *
 * **守ること: 見本の横軸は必ず「これから」の日付にする。**
 * 過去の日付で描くと、見本が「もう測った数字」に見えてしまう
 * （AI 検索モニタリング r149・順位計測 r158 で同じ判断をしている）。
 *
 * 日付はすべて日本時間で数える。Vercel のサーバーは UTC なので、
 * `new Date().getDate()` のようなローカル時刻の計算は日本の日付と 9 時間ずれる
 * （サーバーの描画とブラウザの描画で日付が食い違い、hydration のずれにもなる）。
 *
 * 見本の横軸は**すべてここを通す**（2026-09-23 に AI 検索モニタリング・順位計測の独自実装をまとめた）。
 */
import { CRON_HOUR_JST } from "@/lib/jobs/schedule";
import { addDays, jstDateKey, jstParts, nextWeekdayAtJst } from "@/lib/time/jst";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * これから来る `weekday`（0 = 日曜）の計測日を、古い順に `count` 個返す。
 *
 * 計測は定期実行（日本時間の `hour` 時。既定は 5:00）で入るので、**今日がその曜日でも、
 * 定期実行の時刻を過ぎていれば今日は「これから」ではない**（もう測った日）→ 次の週から数える。
 * 時刻より前なら今日から数える（2026-09-23。以前は時刻を見ず、測り終えた今日を未来として描いていた）。
 *
 * 例: 毎週月曜 5:00 の一斉更新なら `weekday = 1`。
 */
export function comingWeekdays(count: number, weekday: number, now = new Date(), hour = CRON_HOUR_JST): string[] {
  const first = nextWeekdayAtJst(now, weekday, hour);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(jstDateKey(addDays(first, i * 7)));
  return out;
}

/**
 * これから来る月（YYYY-MM）を、今月から古い順に `count` 個返す。
 * 月ごとに集計する数字（Google のインサイトなど）の見本に使う。
 */
export function comingMonths(count: number, now = new Date()): string[] {
  const p = jstParts(now);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(p.year, p.month - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
}

/** 目盛りの短い表記（2026-09-22 → 9/22）。ISO でなければそのまま返す */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

/** 目盛りの短い表記（2026-09 → 9 月）。ISO でなければそのまま返す */
export function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return m ? `${Number(m)} 月` : ym;
}
