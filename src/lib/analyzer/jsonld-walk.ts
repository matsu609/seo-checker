/**
 * JSON-LD を読むときの共通の道具（2026-09-23 に 3 か所の複製をまとめた）。
 * クイック診断（jsonld.ts）・サイト診断（audit/extras.ts）・ページ診断（page-report/extract.ts）・
 * FAQ ツール（faq/audit.ts）が同じ辿り方・同じ @type の読み方をする。
 */

export type JsonObject = Record<string, unknown>;

/**
 * JSON-LD のすべてのオブジェクトを深さ優先で訪ねる。
 * `@graph` 配列・`mainEntity`・`hasPart` などの入れ子や配列を区別せずに辿る。
 */
export function walkJsonLd(node: unknown, visit: (obj: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    visit(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walkJsonLd(value, visit);
    }
  }
}

/** `schema:Organization` や `https://schema.org/Organization` のような @type を素の名前にする */
export function stripTypePrefix(name: string): string {
  return name.split(/[/#:]/).pop() || name;
}

/** `@type`（文字列か配列）を素の名前の配列にする。文字列以外は捨てる */
export function typeNamesOf(type: unknown): string[] {
  const list = Array.isArray(type) ? type : type ? [type] : [];
  return list.filter((v): v is string => typeof v === "string").map(stripTypePrefix);
}

/**
 * 運営者（会社・店舗）とみなす @type（接頭辞は落として比較）。
 * schema.org の Organization / LocalBusiness とその下位の型で、歯科（Dentist）や美容室（HairSalon）など
 * 業種の型で書かれたものも運営者として数える。サイト診断の信頼（audit/extras.ts）と
 * クイック診断（jsonld.ts）で同じ一覧を使う（2026-09-23 にそろえた）。
 */
export const ORGANIZATION_TYPES: ReadonlySet<string> = new Set([
  "Organization", "Corporation", "LocalBusiness", "Store", "Restaurant", "MedicalBusiness", "ProfessionalService",
  "EducationalOrganization", "GovernmentOrganization", "NGO", "Dentist", "Physician", "Hospital", "Hotel",
  "LodgingBusiness", "FoodEstablishment", "AutoDealer", "RealEstateAgent", "LegalService", "Attorney",
  "AccountingService", "FinancialService", "HealthAndBeautyBusiness", "BeautySalon", "HairSalon", "DaySpa",
  "SportsActivityLocation", "HomeAndConstructionBusiness", "TravelAgency", "InsuranceAgency", "AutomotiveBusiness",
  "EntertainmentBusiness", "ChildCare", "Library", "School", "Church", "ShoppingCenter", "ClothingStore",
  "ElectronicsStore", "Florist", "Bakery", "CafeOrCoffeeShop", "BarOrPub",
  // nap/extract.ts が運営者として読む型のうち、schema.org に実在するもの
  "MedicalClinic", "Pharmacy", "VeterinaryCare", "ExerciseGym", "NailSalon", "Locksmith", "MovingCompany",
  "Plumber", "Electrician", "RoofingContractor", "GeneralContractor",
]);

/**
 * 「このサイトの運営者」を表しうるノードへ降りるときに通ってよいプロパティ。
 * 記事の著者（author）・社員（employee）・商品のブランド（brand）・口コミの書き手などは
 * サイトの運営者ではないので、そこに書かれた Organization / Person は運営者に数えない。
 */
const OPERATOR_EDGES = new Set(["@graph", "publisher", "isPartOf", "mainEntity", "about", "provider"]);

/**
 * 運営者の候補になるノードだけを訪ねる（2026-09-23）。
 * 最上位のノードと `@graph` の要素、そこから publisher / isPartOf / mainEntity / about / provider で
 * たどれるノードが対象。`BlogPosting.author` の Person や `Product.brand` の Organization は訪ねない。
 */
export function walkOperatorCandidates(node: unknown, visit: (obj: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkOperatorCandidates(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    visit(obj);
    for (const [key, value] of Object.entries(obj)) {
      if (OPERATOR_EDGES.has(key) && value && typeof value === "object") walkOperatorCandidates(value, visit);
    }
  }
}
