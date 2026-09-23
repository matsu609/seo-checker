/**
 * NDJSON（1 行 1 JSON）で進捗と結果を流す応答の共通部品（サーバー専用）。
 * 読む側はブラウザの `crawl/client.ts` の readNdjson。
 *
 * 2026-09-23 に 5 つのルート（site / site-audit / page-diagnosis/chat / seo-analysis/analyze /
 * seo-analysis/collect）の複製をまとめた。以前は一部のルートが
 * - `X-Content-Type-Options: nosniff` を付けていなかった
 * - クライアントが切断したあとに enqueue して例外を出していた（chat・collect）
 * ので、ここでは「閉じたら二度と書かない」send と共通のヘッダーを必ず使う。
 */

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  // nginx 系のプロキシが応答を溜め込まないように
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

function line(obj: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(obj)}\n`);
}

export interface NdjsonSink<T> {
  /** 1 行書く。切断・終了のあとは何もしない（例外を出さない） */
  send(event: T): void;
  /** 切断・終了したか */
  readonly closed: boolean;
}

export interface NdjsonOptions {
  /** クライアントが読むのをやめた（切断した）とき */
  onCancel?: () => void;
}

/**
 * `run` の中で `sink.send()` した行を流す応答を返す。`run` が終われば（例外でも）ストリームを閉じる。
 * `run` の例外は各ルートで error 行に直してから投げない前提。漏れたものはログに残して閉じる。
 */
export function ndjsonResponse<T>(run: (sink: NdjsonSink<T>) => Promise<void>, options: NdjsonOptions = {}): Response {
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sink: NdjsonSink<T> = {
        send(event: T) {
          if (closed) return;
          try {
            controller.enqueue(line(event));
          } catch {
            // 既に閉じられている（クライアント切断）
            closed = true;
          }
        },
        get closed() {
          return closed;
        },
      };
      try {
        await run(sink);
      } catch (err) {
        console.error("[ndjson] unhandled error", err);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      }
    },
    cancel() {
      closed = true;
      options.onCancel?.();
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}

/** 1 行だけの NDJSON 応答（キャッシュ命中など） */
export function ndjsonSingle(event: unknown): Response {
  return new Response(`${JSON.stringify(event)}\n`, { headers: NDJSON_HEADERS });
}
