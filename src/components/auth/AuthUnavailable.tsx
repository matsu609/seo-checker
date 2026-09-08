/**
 * Clerk のキーが未設定のときに、ログイン画面の代わりに出す案内。
 * 他の連携（RequiresNotice）と同じく「何を設定すれば使えるか」を書く。
 */
import Link from "next/link";
import { Callout } from "@/components/ui/Callout";

export function AuthUnavailable() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Callout tone="warn" title="ログインは設定されていません">
        <p>
          このアプリはまだ Clerk のキーが設定されていないため、ログインを使えません。
          現在はすべての機能がログイン無しで開けます。
        </p>
        <p className="mt-2">
          有効にするには <code className="rounded-sm bg-surface px-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> と{" "}
          <code className="rounded-sm bg-surface px-1">CLERK_SECRET_KEY</code> を .env.local に設定して、
          サーバーを再起動してください。
        </p>
        <p className="mt-2">
          <Link href="/" className="text-accent underline">
            無料診断に戻る
          </Link>
        </p>
      </Callout>
    </div>
  );
}
