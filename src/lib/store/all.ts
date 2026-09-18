/**
 * すべてのストアのモジュールを読み込んで登録を確定させる（副作用だけの import）。
 *
 * ストアは各機能のフォルダに分かれていて、開いている画面のぶんしか読み込まれない。
 * サーバー同期（StoreSync.tsx）は全部を対象にしたいので、ここでまとめて読み込む。
 * ストアを追加したらここにも足すこと（足し忘れると、そのストアだけ同期されず端末に残る）。
 */
import "@/lib/aio-topics/store";
import "@/lib/audit/store";
import "@/lib/keywords/store";
import "@/lib/llmo/expansion/store";
import "@/lib/llms-txt/store";
import "@/lib/page-diagnosis/store";
import "@/lib/page-report/store";
import "@/lib/rank/store";
import "@/lib/seo-analysis/store";
import "@/lib/writing/store";
import "./maps";
import "./projects";
import "./promo";
import "./replies";
import "./sidebar";
