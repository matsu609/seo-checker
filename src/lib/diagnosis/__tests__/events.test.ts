/** イベント名の共通化（docs/dev/diagnosis-rules-spec.md §5） */
import { describe, expect, it } from "vitest";
import { buildEventMapping, describeMapping, guessCommonEvent, unmappedEvents } from "../events";

describe("自動判定", () => {
  it.each([
    ["contact_click", "primary_cta"],
    ["inquiry_button", "primary_cta"],
    ["request_quote", "primary_cta"],
    ["demo_request", "primary_cta"],
    ["consultation_click", "primary_cta"],
    ["form_start", "form_start"],
    ["contact_form_start", "form_start"],
    ["generate_lead", "form_complete"],
    ["form_submit", "form_complete"],
    ["contact_complete", "form_complete"],
    ["file_download", "document_download"],
    ["catalog_download", "document_download"],
    ["phone_click", "phone_action"],
    ["tel_click", "phone_action"],
    ["email_click", "email_action"],
    ["mailto_click", "email_action"],
    ["booking_click", "external_action"],
    ["calendar_click", "external_action"],
  ])("%s を %s に当てる", (name, expected) => {
    expect(guessCommonEvent(name)).toBe(expected);
  });

  it("日本語のイベント名も当てる", () => {
    expect(guessCommonEvent("お問い合わせクリック")).toBe("primary_cta");
    expect(guessCommonEvent("資料ダウンロード")).toBe("document_download");
  });

  it("完了を開始と取り違えない", () => {
    expect(guessCommonEvent("contact_form_submit")).toBe("form_complete");
    expect(guessCommonEvent("inquiry_start")).toBe("form_start");
  });

  it("GA4 が自動で集めるイベントは当てない", () => {
    for (const name of ["page_view", "session_start", "scroll", "user_engagement", "click"]) {
      expect(guessCommonEvent(name), name).toBeNull();
    }
  });

  it("当てはまらない名前は null", () => {
    expect(guessCommonEvent("my_custom_thing")).toBeNull();
    expect(guessCommonEvent("  ")).toBeNull();
  });
});

describe("対応表の組み立て", () => {
  const names = ["page_view", "contact_click", "form_start", "generate_lead", "catalog_download", "my_custom_thing"];

  it("イベント名の一覧から作れる", () => {
    const mapping = buildEventMapping(names);
    expect(mapping.primary_cta).toEqual(["contact_click"]);
    expect(mapping.form_start).toEqual(["form_start"]);
    expect(mapping.form_complete).toEqual(["generate_lead"]);
    expect(mapping.document_download).toEqual(["catalog_download"]);
  });

  it("人が指定した分が自動判定より優先される", () => {
    const mapping = buildEventMapping(names, { primary_cta: ["my_custom_thing"] });
    expect(mapping.primary_cta).toEqual(["my_custom_thing", "contact_click"]);
  });

  it("同じイベント名が 2 つの共通イベントに入らない", () => {
    const mapping = buildEventMapping(names, { form_complete: ["contact_click"] });
    expect(mapping.form_complete).toContain("contact_click");
    expect(mapping.primary_cta).not.toContain("contact_click");
  });

  it("当てはまらなかったイベント名を取り出せる", () => {
    const mapping = buildEventMapping(names);
    expect(unmappedEvents(names, mapping)).toEqual(["my_custom_thing"]);
  });

  it("何をどう数えたかを説明できる", () => {
    expect(describeMapping(buildEventMapping(names)).join("\n")).toContain("問い合わせフォームの完了 = generate_lead");
  });
});
