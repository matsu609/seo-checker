/**
 * リリース履歴。main へマージするたびに 1 件増える。純粋関数だけを置く。
 *
 * バージョン番号は「履歴の件数」で、別の場所にカウンタを持たない。
 * 数値と履歴を二重に持つと、片方の更新を忘れたときに静かにずれるため。
 * つまり releases.json に 10 件あれば、いまは r10。
 *
 * 追加は scripts/add-release.mjs が行う（HEAD のコミットと日付をそのまま記録）。
 * 手で書き足しても構わないが、commit は実在するものにすること。
 * 管理画面が「記録されたコミット」と「実際にデプロイされているコミット」を
 * 突き合わせるので、嘘を書くとそこで食い違いとして出る。
 */
import data from "./releases.json";

export interface Release {
  /** 何回目のマージか。1 始まり */
  number: number;
  /** マージ時点の main の先端（短縮 SHA） */
  commit: string;
  /** マージした日（YYYY-MM-DD） */
  date: string;
  /** 何を入れたか（1 行） */
  summary: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SHA = /^[0-9a-f]{7,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 任意の値をリリース一覧にする。壊れた行は捨てる。
 * 番号は「配列の並び順」から振る（ファイルに番号を書かせない）。
 */
export function parseReleases(value: unknown): Release[] {
  const root = isRecord(value) ? value : {};
  const rows = Array.isArray(root.releases) ? root.releases : [];
  const out: Release[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const commit = typeof raw.commit === "string" ? raw.commit.trim().toLowerCase() : "";
    const date = typeof raw.date === "string" ? raw.date.trim() : "";
    if (!SHA.test(commit) || !DATE.test(date)) continue;
    out.push({
      number: out.length + 1,
      commit,
      date,
      summary: typeof raw.summary === "string" ? raw.summary : "",
    });
  }
  return out;
}

/** 古い順のリリース一覧 */
export const RELEASES: Release[] = parseReleases(data);

/** いまのバージョン（＝マージ回数）。履歴が空なら 0 */
export function releaseCount(): number {
  return RELEASES.length;
}

/** 最新のリリース。履歴が空なら null */
export function currentRelease(): Release | null {
  return RELEASES.at(-1) ?? null;
}

/** 表示用の版名（"r10"）。0 件のときは "—" */
export function releaseLabel(number: number): string {
  return number > 0 ? `r${number}` : "—";
}

/** 新しい順に n 件 */
export function recentReleases(n: number): Release[] {
  return [...RELEASES].reverse().slice(0, n);
}
