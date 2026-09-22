"use client";

/**
 * 設定画面から「お客様カルテ」への入口（進み具合つき）。
 *
 * カルテは書いてもらえないと意味がないので、設定を開いたときに必ず目に入る場所に置く
 * （利用者の決定 2026-09-21）。ここでは進み具合と「書くと何が変わるか」だけを見せ、
 * 記入は専用の画面（/karte）で行う。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { KarteResponse } from "@/app/api/karte/route";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { buttonClass } from "@/components/ui/Button";

export function KarteCard() {
  const [data, setData] = useState<KarteResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/karte", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as KarteResponse) : null))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* 入口なので、読めなければ何も出さない */
      });
    return () => {
      alive = false;
    };
  }, []);

  const p = data?.progress;
  const done = p ? p.answered >= p.total && p.total > 0 : false;

  return (
    <Card
      title="お客様カルテ"
      description="お店の強み・来てほしいお客様・よく聞かれる質問を教えていただくと、AI が書く文章（ページ改善の改修案・FAQ 案・口コミへの返信・Google マップの総評）が「お店の言葉」に変わります。全部埋めなくても、書いた分だけ変わります。"
      actions={p && <Badge tone={done ? "pass" : p.answered > 0 ? "warn" : "neutral"} icon={false}>{p.answered} / {p.total} 問</Badge>}
    >
      {p && p.total > 0 && <ProgressBar value={p.answered} max={p.total} label="記入の進み具合" className="mb-3" />}
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        「あったらいいな」と思う機能の欄もあります。いただいたご要望は必ず運営者が読み、次に作るものを決める材料にしています。
      </p>
      <Link href="/karte" className={buttonClass("primary", "sm")}>
        {p && p.answered > 0 ? "カルテを続きから書く" : "カルテを書く（5 分ほど）"}
      </Link>
    </Card>
  );
}
