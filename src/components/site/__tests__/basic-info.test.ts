import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BasicInfoNotice, missingFields, type BasicInfo } from "../BasicInfoNotice";

const FULL: BasicInfo = {
  name: "サンプル歯科クリニック",
  phone: "03-1234-5678",
  address: "東京都千代田区丸の内1-1-1",
  website: "https://sample-dental.jp/",
};

function render(over: Partial<Parameters<typeof BasicInfoNotice>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(BasicInfoNotice, {
      value: FULL,
      overridden: false,
      onChange: () => {},
      onReset: () => {},
      action: createElement("button", null, "調べる"),
      ...over,
    }),
  );
}

describe("missingFields", () => {
  it("既定では店名だけが必須", () => {
    expect(missingFields(FULL)).toEqual([]);
    expect(missingFields({ ...FULL, name: "  " })).toEqual(["name"]);
    // 電話・住所・サイトが空でも止めない
    expect(missingFields({ name: "店名", phone: "", address: "", website: "" })).toEqual([]);
  });

  it("必須項目は呼び出し側で足せる", () => {
    expect(missingFields({ ...FULL, website: "" }, ["name", "website"])).toEqual(["website"]);
  });
});

describe("BasicInfoNotice（設定から取り込む帯）", () => {
  it("設定の値をそのまま出し、入力し直さなくてよいと伝える", () => {
    const html = render();
    expect(html).toContain("設定から取り込み済み");
    expect(html).toContain("ここで入力し直す必要はありません");
    for (const v of Object.values(FULL)) expect(html).toContain(v);
  });

  it("**入力欄は既定で畳んでおく**（フォームを主役にしない）", () => {
    const html = render();
    expect(html).toContain("この回だけ別の値で調べる");
    // details が open ではない = 最初は閉じている
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("設定へ直しに行く導線を常に出す", () => {
    expect(render()).toContain("/settings#business");
  });

  it("足りない必須項目があれば、設定への登録を促す", () => {
    const html = render({ value: { ...FULL, name: "" } });
    expect(html).toContain("店名・屋号が設定に登録されていません");
    expect(html).toContain("設定で基本情報を登録する");
  });

  it("サイトが必須で足りないときはホームページ登録にも誘導する", () => {
    const html = render({ value: { ...FULL, website: "" }, requires: ["name", "website"] });
    expect(html).toContain("設定でホームページを登録する");
  });

  it("未登録の項目は「未登録」と出す（空欄で黙らない）", () => {
    expect(render({ value: { ...FULL, address: "" } })).toContain("未登録");
  });

  it("上書き中はそれと分かるようにし、戻す手段を出す", () => {
    const html = render({ overridden: true });
    expect(html).toContain("この回だけ上書き中");
    expect(html).toContain("設定の値に戻す");
    expect(html).toContain("設定には保存されません");
  });

  it("上書きしていなければ「戻す」は出さない", () => {
    expect(render()).not.toContain("設定の値に戻す");
  });
});
