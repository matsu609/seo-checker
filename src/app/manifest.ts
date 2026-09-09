/**
 * PWA マニフェスト。ホーム画面に追加したときの名前とアイコンを決める。
 *
 * アイコンの元は src/app/icon.svg（サイドバーの LogoMark と同じ形）。
 * PNG は scripts/generate-icons.mjs で作り直せる。
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SEO Checker | 無料AIO診断 と SEO/LLMO ツール",
    short_name: "SEO Checker",
    description:
      "URL を入れるだけで AI 検索（AIO）対策の状況を診断し、報告書として PDF 出力できるツールです。",
    start_url: "/",
    display: "standalone",
    lang: "ja",
    background_color: "#eef1f4",
    // サイドバーと同じブランド色。アドレスバーの色もこれに合う
    theme_color: "#0b3547",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
