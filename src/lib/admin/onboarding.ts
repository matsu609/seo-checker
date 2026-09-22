/**
 * 管理アカウントを追加したあと、その方が使いはじめるまでの道のり（純粋関数だけ）。
 *
 * マスター画面の「管理アカウント」（/admin/accounts）に出す案内の中身をここに置く。
 * 画面（AgencyFlowCard）は並べるだけにして、**文言と URL はここ 1 か所**で持つ。
 * 運用メモ（docs/dev/OPERATIONS.md の「管理アカウントを使いはじめる手順」）と同じ内容にする。
 *
 * 道のりが 2 本あるのは、追加したときの相手の状態で分かれるため（src/lib/admin/agencies.ts）。
 *   invited  … まだ登録していない方。Clerk から招待メールが飛ぶ
 *   promoted … すでに登録済みの方。**メールは飛ばない**（ここで待たせてしまう事故が 2026-09-21 に起きた）
 *
 * 招待リンクを踏んでも、このアプリの登録フォームは Clerk のチケットを扱わない（自前フォーム）。
 * 「ふつうに登録 → ログイン時に /start が招待を拾う」という作りなので（claimAgencyInvitation、r137）、
 * **招待したアドレスと同じアドレスで登録してもらう**ことが要になる。案内でもそこを太く書く。
 */
import { FREE_HOME_PATH, MANAGER_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/landing";
import { OPERATOR, SERVICE_NAME } from "@/lib/legal/operator";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

/** 無料クイック診断（デモ用・別タブ）。サイドバーの「管理者用」に出る 2 本 */
const FREE_STORE_PATH = "/meo";

/** 追加したときの 2 つの入口。AddAgencyResult["kind"] と同じ言葉にそろえる */
export type AgencyEntry = "invited" | "promoted";

/** 絶対 URL（案内文はメールや LINE で渡すので、相対パスでは役に立たない） */
export function appUrl(path: string): string {
  return `${PUBLIC_APP_ORIGIN}${path}`;
}

export interface AgencyStep {
  /** 1 から始まる通し番号 */
  n: number;
  /** 誰の作業か */
  actor: "運用者" | "ご本人";
  /** 何をするか（見出し） */
  title: string;
  /** 具体的な中身 */
  detail: string;
  /** 開く場所（無い手順は null） */
  url: string | null;
  /** つまずきやすい点（無ければ null） */
  pitfall: string | null;
}

/**
 * 使いはじめるまでの手順。
 *
 * 1 手順目だけは運用者（= この画面を開いている人）の作業。2 手順目からがご本人の作業で、
 * 最後は必ず「顧客管理をブックマークする」で終える（今後の入口がここしかないため）。
 */
export function agencyFlowSteps(entry: AgencyEntry): AgencyStep[] {
  const accounts = appUrl("/admin/accounts");
  const clients = appUrl(MANAGER_PATH);

  if (entry === "promoted") {
    return [
      {
        n: 1,
        actor: "運用者",
        title: "この画面でメールアドレスを追加する",
        detail:
          "「◯◯ を管理アカウントにしました」と出たら、その時点で権限は付いています。すでに登録済みの方なので、招待メールは送られません。",
        url: accounts,
        pitfall: "メールが届くのを待たないこと。届かないのが正しい動きです。",
      },
      {
        n: 2,
        actor: "ご本人",
        title: "いちどログアウトして、ログインし直す",
        detail:
          "権限が切り替わるのはログインし直したときです。すでに開いている画面があれば、閉じてから入り直してください。",
        url: appUrl(SIGN_IN_PATH),
        pitfall: "パスワードはいままでどおり（変更も再登録も要りません）。",
      },
      {
        n: 3,
        actor: "ご本人",
        title: "顧客管理の画面に着く",
        detail:
          "ログインすると自動で「顧客管理」に着きます。左のサイドバーが「管理者用」だけになっていれば切り替わっています。",
        url: clients,
        pitfall:
          "無料診断や料金プランの画面に着くときは、まだ切り替わっていません。もう一度ログインし直すか、運用者に同じアドレスを追加し直してもらってください。",
      },
      {
        n: 4,
        actor: "ご本人",
        title: "顧客管理をブックマークする",
        detail: "今後の入口はここだけです。ツール・設定・料金プランは管理アカウントでは開きません。",
        url: clients,
        pitfall: null,
      },
    ];
  }

  return [
    {
      n: 1,
      actor: "運用者",
      title: "この画面でメールアドレスを追加する",
      detail:
        "「◯◯ に招待メールを送りました」と出れば、Clerk から招待メールが届きます。届かないときのために、追加した直後だけ画面に出る招待リンクを控えておいてください。",
      url: accounts,
      pitfall: "招待リンクは招待そのものです。ご本人以外には渡さないでください。",
    },
    {
      n: 2,
      actor: "ご本人",
      title: "招待メール（1 通目）を開いてリンクを押す",
      detail: "差出人は Clerk です。メールが見つからないときは、運用者から招待リンクを直接受け取ってください。",
      url: null,
      pitfall: "迷惑メールに入ることがあります（2026-09-21 に実際に起きました）。",
    },
    {
      n: 3,
      actor: "ご本人",
      title: "登録フォームに 6 項目を入力する",
      detail:
        "担当者名・メールアドレス・会社名・電話番号・店舗の種類・パスワードの 6 つです。会社名と店舗の種類は管理アカウントでは使わないので、ご自身の所属をそのまま入れてかまいません。",
      url: appUrl(SIGN_UP_PATH),
      pitfall:
        "招待されたのと同じメールアドレスで登録してください（別のアドレスだと管理アカウントになりません）。パスワードは 8 文字以上で、英字と数字を混ぜてください（流出したことのあるパスワードは Clerk が弾きます）。",
    },
    {
      n: 4,
      actor: "ご本人",
      title: "確認コード（2 通目のメール）を入力する",
      detail: "登録を押すと 6 桁の確認コードが届きます。入力するとそのままログイン状態になります。",
      url: null,
      pitfall: "招待メールとは別のメールです。期限が切れたときは登録からやり直してください。",
    },
    {
      n: 5,
      actor: "ご本人",
      title: "顧客管理の画面に着く",
      detail:
        "ログインすると自動で「顧客管理」に着きます。左のサイドバーが「管理者用」だけになっていれば切り替わっています。",
      url: clients,
      pitfall:
        "無料診断や料金プランの画面に着いたときは、いちどログインし直してください（そのときに招待を拾います）。それでも直らないときは、運用者に同じアドレスを追加し直してもらってください。",
    },
    {
      n: 6,
      actor: "ご本人",
      title: "顧客管理をブックマークする",
      detail: "今後の入口はここだけです。ツール・設定・料金プランは管理アカウントでは開きません。",
      url: clients,
      pitfall: null,
    },
  ];
}

export interface AgencyEntryPoint {
  /** したいこと */
  purpose: string;
  /** どこから開くか */
  where: string;
  /** 直接の URL（画面の中からしか開けないものは null） */
  url: string | null;
}

/** ログインしたあと、今後どこから何を開くか（ツールの入口を含む） */
export function agencyEntryPoints(): AgencyEntryPoint[] {
  return [
    {
      purpose: "毎日の入口（ブックマークはここ）",
      where: "サイドバー「管理者用」→ 顧客管理",
      url: appUrl(MANAGER_PATH),
    },
    {
      purpose: "お客様のツール画面を見る・操作する",
      where: "顧客管理 → そのお客様の行の「この方の画面を見る」（代理ログイン。終わったら画面下の帯から自分に戻る）",
      url: null,
    },
    {
      purpose: "割引・機能の開放・契約状況の確認",
      where: "顧客管理 → そのお客様の行",
      url: null,
    },
    {
      purpose: "デモで無料診断を見せる（サイト）",
      where: "サイドバー「管理者用」→ 無料クイック診断（サイト）。別タブで開きます",
      url: appUrl(FREE_HOME_PATH),
    },
    {
      purpose: "デモで無料診断を見せる（店舗）",
      where: "サイドバー「管理者用」→ 無料クイック診断（店舗）。別タブで開きます",
      url: appUrl(FREE_STORE_PATH),
    },
  ];
}

/** 管理アカウントでは開かない画面（開いたときに何が出るか） */
export function agencyClosedDoors(): { label: string; result: string }[] {
  return [
    {
      label: "ツール（AI 検索モニタリング・SEO・MEO・サイテーション）・設定・料金プラン",
      result: "サイドバーに出ません。URL を直接開くと「この画面は管理アカウントでは使いません」の案内が出ます。",
    },
    {
      label: "マスター画面・管理アカウント・ご意見・不具合（マスターアカウント用のタブ）",
      result: "サイドバーに出ません。URL を直接開くと 404 になります。",
    },
    {
      label: "お客様のプラン変更・ご意見への返答",
      result: "運用者（マスター）だけの操作です。管理アカウントからはできません。",
    },
  ];
}

export interface GuideMessageInput {
  entry: AgencyEntry;
  /** 追加したメールアドレス */
  email: string;
  /** 招待リンク（invited で画面に出ているときだけ。無ければ登録フォームの URL を案内する） */
  inviteUrl?: string | null;
}

/**
 * ご本人にそのまま渡せる案内文（メール・LINE に貼る用）。
 *
 * 画面の手順と同じことを、相手が読む順で書く。**同じメールアドレスで登録すること**と
 * **今後の入口は顧客管理だけ**の 2 点は、どちらの道のりでも必ず入れる。
 */
export function agencyGuideMessage({ entry, email, inviteUrl }: GuideMessageInput): string {
  const clients = appUrl(MANAGER_PATH);
  const lines: string[] = [`【${SERVICE_NAME}】管理アカウントのご案内`, ""];

  if (entry === "invited") {
    lines.push(
      `${email} 宛に管理アカウントをご用意しました。次の手順でお使いいただけます。`,
      "",
      "1. 下のリンクから登録してください（ご本人専用のリンクです。他の方には渡さないでください）",
      `   ${inviteUrl || appUrl(SIGN_UP_PATH)}`,
      `2. 登録は 6 項目です。かならず ${email} で登録してください（別のアドレスだと管理アカウントになりません）。`,
      "   パスワードは 8 文字以上、英字と数字を混ぜてください。",
      "3. 6 桁の確認コードがメールで届きます。入力するとそのままログインします。",
      "4. ログインすると「顧客管理」の画面に着きます。今後の入口はここだけです。",
      `   ${clients}`,
    );
  } else {
    lines.push(
      `${email} のアカウントを管理アカウントに切り替えました。新しい登録も招待メールもありません。`,
      "",
      "1. いちどログアウトして、ログインし直してください（切り替わるのはログインし直したときです）。",
      `   ${appUrl(SIGN_IN_PATH)}`,
      "2. ログインすると「顧客管理」の画面に着きます。今後の入口はここだけです。",
      `   ${clients}`,
    );
  }

  lines.push(
    "",
    "◾ できること",
    "・お客様の契約状況・ご利用状況の確認",
    "・割引、機能の開放",
    "・お客様の画面を見る（顧客管理の「この方の画面を見る」）",
    "",
    "◾ 使わない画面",
    "・ツール・設定・料金プランは管理アカウントでは開きません（お客様の画面を確かめるときは「この方の画面を見る」をお使いください）。",
    "",
    `ご不明な点は ${OPERATOR.email ?? "運営"} までご連絡ください。`,
  );

  return lines.join("\n");
}
