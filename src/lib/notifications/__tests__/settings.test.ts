import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS, parseNotificationSettings, wantsEmail } from "../settings";

describe("通知の設定", () => {
  it("壊れた値は既定（メールあり）に戻す", () => {
    expect(parseNotificationSettings(undefined)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(parseNotificationSettings({ email: "yes" })).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(parseNotificationSettings({ email: false, address: "", monthlyReport: true, alerts: true }).email).toBe(false);
  });

  it("種類ごとの可否", () => {
    const s = { email: true, address: "", monthlyReport: false, alerts: true };
    expect(wantsEmail(s, "report")).toBe(false);
    expect(wantsEmail(s, "alert")).toBe(true);
    expect(wantsEmail({ ...s, email: false }, "alert")).toBe(false);
  });
});
