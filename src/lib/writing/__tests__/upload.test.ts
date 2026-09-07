/**
 * PDF アップロードの検証（D2）。サーバーはこの関数を必ず通す。
 */
import { describe, expect, it } from "vitest";
import { base64Bytes, formatBytes, MAX_PDF_BYTES, validatePdfUpload } from "../upload";

/** 指定バイト数の「PDF」を base64 にする */
function pdfBase64(bytes: number): string {
  const buf = Buffer.alloc(Math.max(bytes, 5));
  buf.write("%PDF-", 0, "ascii");
  return buf.subarray(0, Math.max(bytes, 5)).toString("base64");
}

describe("base64Bytes", () => {
  it("パディングを考慮して実バイト数を返す", () => {
    expect(base64Bytes(Buffer.from("abc").toString("base64"))).toBe(3);
    expect(base64Bytes(Buffer.from("ab").toString("base64"))).toBe(2);
    expect(base64Bytes(Buffer.from("a").toString("base64"))).toBe(1);
    expect(base64Bytes("")).toBe(0);
  });

  it("改行が混じっていても数えられる", () => {
    const raw = Buffer.from("0123456789").toString("base64");
    expect(base64Bytes(`${raw.slice(0, 4)}\n${raw.slice(4)}`)).toBe(10);
  });
});

describe("validatePdfUpload", () => {
  it("正しい PDF を受け付ける", () => {
    const result = validatePdfUpload({ name: "資料.pdf", mediaType: "application/pdf", data: pdfBase64(1_000) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toBe(1_000);
      expect(result.name).toBe("資料.pdf");
    }
  });

  it("charset 付きの MIME も受け付け、名前が無ければ既定名にする", () => {
    const result = validatePdfUpload({ mediaType: "application/pdf; charset=binary", data: pdfBase64(10) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("参考資料.pdf");
  });

  it("PDF 以外の MIME は 415 で拒否する", () => {
    for (const mediaType of ["image/png", "text/plain", "application/octet-stream", ""]) {
      const result = validatePdfUpload({ mediaType, data: pdfBase64(10) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(415);
    }
  });

  it("5MB を超えるファイルは 413 で拒否する", () => {
    const oversize = "A".repeat(Math.ceil(((MAX_PDF_BYTES + 1_000) * 4) / 3));
    const result = validatePdfUpload({ mediaType: "application/pdf", data: `JVBERi0${oversize}` });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it("上限ちょうどは受け付ける", () => {
    const result = validatePdfUpload({ mediaType: "application/pdf", data: pdfBase64(MAX_PDF_BYTES) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toBe(MAX_PDF_BYTES);
  });

  it("中身が PDF でなければ 415（拡張子・MIME だけ PDF を名乗るファイル）", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const result = validatePdfUpload({ name: "偽物.pdf", mediaType: "application/pdf", data: png });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("空のデータ・base64 でない文字列は 422", () => {
    expect(validatePdfUpload({ mediaType: "application/pdf", data: "" })).toMatchObject({ ok: false, status: 422 });
    expect(validatePdfUpload({ mediaType: "application/pdf", data: "***" })).toMatchObject({
      ok: false,
      status: 422,
    });
  });

  it("data: URL の接頭辞を落とし、PDF 以外の data: URL は拒否する", () => {
    const ok = validatePdfUpload({
      mediaType: "application/pdf",
      data: `data:application/pdf;base64,${pdfBase64(20)}`,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.startsWith("JVBERi0")).toBe(true);

    const ng = validatePdfUpload({ mediaType: "application/pdf", data: "data:image/png;base64,iVBORw0KGgo=" });
    expect(ng).toMatchObject({ ok: false, status: 415 });
  });
});

describe("formatBytes", () => {
  it("単位を切り替える", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
