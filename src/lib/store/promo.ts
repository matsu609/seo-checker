/**
 * 料金プランの画面で確認した割引コード（ブラウザに保存）。
 *
 * 入力欄（PromoCodeField）と「申し込む」ボタン（PlanCheckoutButton）が別のコンポーネントなので、
 * ここを通して受け渡す。コードは確認済みのものだけ入れる。サーバーが Checkout を作るときにもう一度検証する。
 */
import { z } from "zod";
import { createStore } from "./createStore";

export const PromoCodeStateSchema = z.object({
  /** 正規化済みのコード（空 = なし） */
  code: z.string(),
  /** 画面に出す説明 */
  label: z.string(),
});

export type PromoCodeState = z.infer<typeof PromoCodeStateSchema>;

export const EMPTY_PROMO_CODE: PromoCodeState = { code: "", label: "" };

export const promoCodeStore = createStore<PromoCodeState>("promoCode", PromoCodeStateSchema, EMPTY_PROMO_CODE);
