"use client";

/**
 * ページ最適化レポートの入力内容（localStorage）。
 *
 * 対象サイトは設定に登録したホームページ（利用者の指示 2026-09-16）。
 * ここに残すのは「そのサイトのどのページを見るか」だけで、空ならトップページ。
 */

import { z } from "zod";
import { createStore } from "@/lib/store/createStore";

const FormSchema = z.object({
  /** 登録サイトからのパス（例: "/service/"）。空ならトップページ */
  page: z.string(),
  /** 表示速度（PageSpeed Insights）も取得するか */
  psi: z.boolean(),
  strategy: z.enum(["mobile", "desktop"]),
});

export type PageReportForm = z.infer<typeof FormSchema>;

export const pageReportFormStore = createStore<PageReportForm>("pageReportForm", FormSchema, {
  page: "",
  psi: true,
  strategy: "mobile",
});
