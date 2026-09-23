import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "../download";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("リンクを一時的に置いて踏み、少し待ってから URL を解放する", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const link = {
      href: "",
      download: "",
      rel: "",
      click: () => calls.push("click"),
      remove: () => calls.push("remove"),
    };
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        calls.push(`create:${tag}`);
        return link;
      },
      body: { appendChild: () => calls.push("append") },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadBlob(new Blob(["x"], { type: "text/plain" }), "a.txt");

    expect(calls).toEqual(["create:a", "append", "click", "remove"]);
    expect(link).toMatchObject({ href: "blob:test", download: "a.txt", rel: "noopener" });
    // click 直後には解放しない（ダウンロードが始まらないブラウザがある）
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
