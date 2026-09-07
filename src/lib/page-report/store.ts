"use client";

/**
 * ページ最適化レポートの入力内容（localStorage）。
 * リロードしても URL と設定を打ち直さずに済むようにするだけの小さなストア。
 */

import { z } from "zod";
import { createStore } from "@/lib/store/createStore";

const FormSchema = z.object({
  url: z.string(),
  /** 表示速度（PageSpeed Insights）も取得するか */
  psi: z.boolean(),
  strategy: z.enum(["mobile", "desktop"]),
});

export type PageReportForm = z.infer<typeof FormSchema>;

export const pageReportFormStore = createStore<PageReportForm>("pageReportForm", FormSchema, {
  url: "",
  psi: true,
  strategy: "mobile",
});
