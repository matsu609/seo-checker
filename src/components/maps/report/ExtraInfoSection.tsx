/**
 * Google マップから取れる付加情報（r28）。表示だけ。有料の報告書にだけ出す。
 * 追加カテゴリ・属性（設備・サービス）・価格帯・口コミ依頼リンク・Google の AI 要約・警告。
 */
import { Callout } from "@/components/ui/Callout";
import { EmptyLine, ReportSection, SubHeading } from "@/components/free/report-parts";
import type { PlaceDetail } from "@/lib/maps/types";

export function ExtraInfoSection({ detail, number }: { detail: PlaceDetail; number: number }) {
  const attributes = detail.attributes ?? [];
  const on = attributes.filter((a) => a.value);
  const off = attributes.filter((a) => !a.value);
  const links = detail.links ?? null;
  const notFetched = detail.attributes === undefined;

  return (
    <ReportSection number={number} title="Google マップの付加情報" lead="検索の絞り込みや表示に使われる項目です。属性は Google が返したものだけを表示します。">
      {notFetched ? (
        <EmptyLine>この報告書は r28 より前に取得したものです。次回の一斉更新から表示されます。</EmptyLine>
      ) : (
        <div className="space-y-5">
          {detail.consumerAlert && (
            <Callout tone="fail" title="Google の警告が出ています">
              {detail.consumerAlert}
            </Callout>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-[13px] @md:grid-cols-2">
            <div>
              <dt className="text-[11px] text-muted">メインカテゴリ / 追加カテゴリ</dt>
              <dd className="mt-0.5 text-ink">
                {detail.category ?? "—"}
                {detail.extraTypes && detail.extraTypes.length > 0 ? (
                  <span className="text-muted"> ／ 追加: {detail.extraTypes.join(", ")}</span>
                ) : (
                  <span className="text-muted"> ／ 追加カテゴリなし</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">価格帯</dt>
              <dd className="mt-0.5 text-ink">{detail.price ?? "未設定（飲食店以外は表示されないことがあります）"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">住所の詳しさ</dt>
              <dd className="mt-0.5 text-ink">
                {detail.hasBuilding === true ? "ビル名・階まで登録あり" : detail.hasBuilding === false ? "ビル名・階の登録なし（路面店なら不要）" : "—"}
                {detail.serviceArea && <span className="text-muted">（出張型ビジネスとして登録）</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">地図上の位置</dt>
              <dd className="mt-0.5 text-ink tabular-nums">
                {detail.location ? `${detail.location.lat.toFixed(5)}, ${detail.location.lng.toFixed(5)}` : "—"}
              </dd>
            </div>
          </dl>

          <div>
            <SubHeading note={`${attributes.length} 個が設定済み`}>属性（設備・サービス）</SubHeading>
            {attributes.length === 0 ? (
              <EmptyLine>属性が設定されていません。</EmptyLine>
            ) : (
              <ul className="flex flex-wrap gap-1.5 text-[12px]">
                {on.map((a) => (
                  <li key={a.key} className="rounded-sm border border-line bg-surface px-2 py-0.5 text-ink">
                    ✓ {a.label}
                  </li>
                ))}
                {off.map((a) => (
                  <li key={a.key} className="rounded-sm border border-line px-2 py-0.5 text-muted line-through">
                    {a.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {links && (
            <div>
              <SubHeading note="来店客に渡す口コミ依頼のリンクなど">Google マップのリンク</SubHeading>
              <ul className="space-y-1 text-[13px]">
                {links.writeReview && (
                  <li>
                    <span className="font-bold text-ink">口コミを書く（依頼用）:</span>{" "}
                    <a href={links.writeReview} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                      {links.writeReview}
                    </a>
                  </li>
                )}
                {links.reviews && (
                  <li>
                    <span className="text-muted">口コミ一覧:</span>{" "}
                    <a href={links.reviews} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                      {links.reviews}
                    </a>
                  </li>
                )}
                {links.photos && (
                  <li>
                    <span className="text-muted">写真一覧:</span>{" "}
                    <a href={links.photos} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                      {links.photos}
                    </a>
                  </li>
                )}
                {links.directions && (
                  <li>
                    <span className="text-muted">経路案内:</span>{" "}
                    <a href={links.directions} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                      {links.directions}
                    </a>
                  </li>
                )}
              </ul>
              <p className="mt-1 text-[11px] text-muted">「口コミを書く」のリンクを QR コードにして店頭やレシートに載せると、口コミの依頼がしやすくなります。</p>
            </div>
          )}

          {detail.aiSummary && (
            <div>
              <SubHeading note="Google が口コミなどから生成した要約">Google の AI 要約</SubHeading>
              <p className="text-[13px] leading-relaxed text-ink">{detail.aiSummary}</p>
            </div>
          )}
        </div>
      )}
    </ReportSection>
  );
}
