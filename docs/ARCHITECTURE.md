# ARCHITECTURE – ארכיטקטורה

> **סטטוס:** טיוטה לסקירה (v0.1) · **תאריך:** 2026-10-01 · **נגזר מ:** התוכנית המאושרת, חלק D
> **מזהי סעיפים:** האותיות A–J הן מרחב שמות גלובלי בין המסמכים (ראו [README](README.md)).
> **קשור:** [DATA_MODEL](DATA_MODEL.md) · [AI_CONTRACT](AI_CONTRACT.md) · [SECURITY_PLAN](SECURITY_PLAN.md) · [TEST_PLAN](TEST_PLAN.md)

**מטרת המסמך:** שכבות וגבולות, מודול הזמן (Single source of truth), גישה לנתונים בצד לקוח, צינור ה-Edge Function, מטריצת שגיאות, PWA, ארכיטקטורת Offline עתידית וכותרות אבטחה.

---


## D.1 שכבות וגבולות (נאכפים ב-ESLint `import/no-restricted-paths`)
```
src/
  core/                 ← TypeScript טהור: אפס תלות ב-React / DOM / Supabase / Date גולמי
    time/               Clock, tz math, local_date, day boundaries, wall-time→instant (compatible)
    nutrition/          bmr, plan (solver), macros, trend, config (NUTRITION_CONFIG + engine_version)
    schedule/           חלונות ארוחה, מסדרון (corridor), slot inference
    recommend/          recommendNext + CandidateProvider/Filter/Scorer
    dayview/            buildDayView(meals, plan, now, tz) → DayView (טבעת, מאקרו, סטטוס, ChartModel, המלצה)
    contracts/          zod: AI request/response, meal/weight/favorite inputs, export schema  ← משותף גם ל-Edge Function
    export/             serializers JSON/CSV (+ sanitizer)
    food/               נרמול עברית, חיפוש מזון, חישוב כמות→קלוריות (טהור; ראו D.9)
  data/                 Repository interfaces + SupabaseXRepository + mutation transport + query keys
  features/ …           UI בלבד – "טיפש": מקבל DayView ולא מחשב תזונה
supabase/
  migrations/ · functions/delete-account (v1; estimate-meal נדחה) · tests/ (pgTAP) · seed.sql
evals/                  dataset.jsonl · runner · baselines/ · reports/
```
- **כלל ברזל:** UI לא מחשב קלוריות/זמן/המלצות. `core/` נבדק ביחידות בלי רשת, ומקבל `now`/`tz` כפרמטרים (אין `Date.now()` ב-core; ESLint חוסם `new Date(`, `Date.now`, `getHours` וכו' מחוץ ל-`core/time` ול-`SystemClock`).
- **Clock:** `Clock { now(): Instant }` ← `SystemClock` (משתמש ב-Skew מהשרת), `FixedClock` לבדיקות. Skew נמדד מכותרת `Date` של תגובות Supabase; |skew|>2 דק' → באנר "בדוק שעון מכשיר".
- **גרסאות:** `engine_version` (נשמר בכל `target_plans`), `contract_version` + `prompt_version` (בכל `ai_estimates`), `schema_version` (יצוא), `app_version` (שליחה ב-Header; השרת יכול להחזיר `426 client_outdated`).

## D.2 מודול זמן (Single source of truth)
**הגדרות חד-משמעיות**
- **Instant** = UTC (`timestamptz`). **Local date** = `date` ב-`tz` של הארוחה. **יום D ב-Z** = `[start(D), start(D+1))` כש-`start(D)` = הרגע המוקדם ביותר שה-local date שלו D (מטפל גם באזורים שבהם DST מדלג על 00:00, כגון `Asia/Beirut`). אורך יום: 23h / 24h / 25h (ו-23.5/24.5 ב-`Australia/Lord_Howe`).
- **instant→local:** `Intl.DateTimeFormat(tz)`; **local→instant** (`wallToInstant(date,"HH:mm",tz)`): מועמדים לפי offset לפני/אחרי; **כפול (fall-back) → ההופעה הראשונה; פער (spring-forward) → דחיפה קדימה בגודל הפער** (= Temporal `compatible`).
- **ציר גרף:** `elapsedMinutes = (instant − start(D))/60000` ⇒ ציר באורך 1380/1440/1500 דק'; תוויות = שעון קיר. חלונות הארוחה (שעון קיר) מומרים ל-Instants לכל יום.
- **חצות:** 23:59:59.999 → D; 00:00:00.000 → D+1.
- **שעון מכשיר שגוי:** `now = deviceNow + skew`; בשרת: `eaten_at > now()+5min` → 400 `eaten_at_in_future`; `entered_at` תמיד `now()` של השרת (מזהה הזנה בדיעבד).
- **נסיעה:** מזהים `Intl.resolvedOptions().timeZone` ב-Start/Focus; אם ≠ `profile.timezone` → Prompt לא חוסם ("לעבור לשעון מקומי?"). אישור = RPC לעדכון + Audit. ארוחות קיימות **לא** נגזרות מחדש. עריכת `eaten_at` מפורשת בשעון ה-TZ הנוכחי של המשתמש.
- **שרת מול לקוח:** ה-`local_date` של השרת קובע; הלקוח משתמש בחישוב מקומי רק לתצוגה אופטימית. מבחן **Parity** מריץ אותו Corpus (5,000 רגעים × 5 אזורים, כולל DST ו-Lord_Howe ו-Beirut) מול SQL ו-TS. סטיית tzdata עתידית אפשרית – השרת גובר.
- **תאריכים:** חשבון תאריכים רק על מחרוזות `YYYY-MM-DD` (הפרש ימים דרך UTC-midnight); גיל ביום הולדת 29/2 = 1/3 בשנה שאינה מעוברת.

## D.3 ארכיטקטורת נתונים בצד לקוח
- **Repository interfaces** (`MealsRepository`, `WeightsRepository`, `FavoritesRepository`, `PlansRepository`, `ProfileRepository`): ה-Hooks תלויים רק בממשק. מימוש v1: Supabase. כל Mutation נושא `id` (UUID לקוח) + `mutation_id` + `base_version` ⇒ **Idempotent מעצם הגדרתו** ומוכן ל-Outbox.
- TanStack Query: Query keys מרוכזים; Optimistic update ב-`onMutate`, Rollback ב-`onError`, `invalidate` ב-`onSettled`; `retry` רק על שגיאות רשת/5xx (3 ניסיונות, Backoff + Jitter) – **תמיד עם אותו `id`**.
- **Pagination:** כל רשימה בדפים (Keyset על `(eaten_at,id)`), מעולם לא בהנחה של <1000 שורות.
- טיוטות (טקסט AI/שדות טופס) ב-`sessionStorage`; **Logout מנקה** Query-cache המתמיד, IndexedDB, Cache Storage, sessionStorage.

## D.4 צינור ה-Edge Function `estimate-meal`

> ⚠️ **סטטוס: נדחה (Deferred) – אינו חלק מ-v1.** ב-2026-10-01 הוחלט שלא לפתוח חשבון AI בתשלום (גם לא עם תקרת הוצאה). החלק הזה נשמר כתכנון מוכן להרחבה עתידית; אין לממש אותו ב-v1.

1. CORS (Origins מורשים בלבד) · `Content-Type: application/json` · גוף ≤4KB (413/415).
2. אימות JWT (`verify_jwt`) → `user_id` **רק** מה-JWT (לעולם לא מהגוף).
3. ולידציית Zod `strict` (טקסט 2–500 תווי Unicode, NFC, ניקוי בקרה; חייב אות/ספרה) – **ללא צריכת מכסה** על קלט לא תקין (400).
4. Idempotency: `ai_estimates.id = request_id` – תגובה קיימת תקינה → מוחזרת (`x-idempotent-replay: true`), ללא צריכה.
5. בדיקת `profiles.ai_consent_at` (403 `consent_required`) · Circuit-breaker גלובלי (503 `ai_unavailable`).
6. **צריכה אטומית:** `consume_ai_quota()` – `INSERT … ON CONFLICT (user_id,bucket) DO UPDATE SET count=count+1 WHERE count < limit RETURNING count`; אין שורה → 429 `quota_exceeded` (+`resets_at`). שני Buckets: `d:YYYY-MM-DD` (UTC) ו-`m:YYYY-MM-DDTHH:MM`.
7. קריאה ל-Claude: Timeout 20s (AbortController), ניסיון חוזר אחד ל-429/5xx/overloaded, `max_tokens` 1024, Tool `report_meal_estimate` (forced).
8. Post-processing (G.4): סכומים בשרת, Atwater/צפיפות, סניטציה, הורדת Confidence לפי טווח.
9. שמירה ב-`ai_estimates` (Service role) ותשובה. **כל כשל בשלבים 7–8 ⇒ `refund_ai_quota()`** ותשובת שגיאה עם `fallback:"manual_entry"`.
10. לוגים: `request_id`, `user_hash`, סטטוס, Latency, Tokens – **ללא טקסט ארוחה וללא אימייל**.

## D.5 מטריצת שגיאות (התנהגות מחייבת)

> **v1:** שורות ה-AI ("AI לא זמין", "תשובת AI פגומה", "חריגה ממכסה", 429 של AI) נדחו יחד עם D.4. שאר השורות חלות.

| מצב | קוד/זיהוי | התנהגות צפויה בממשק | בדיקה |
|---|---|---|---|
| ולידציה | 400 `invalid_input` | הודעה ליד השדה (`aria-describedby`), `role=alert` רק לסיכום; הטופס נשמר | ERR-01 |
| לא מאומת | 401 | ניסיון Refresh יחיד → אם נכשל: מסך כניסה, **הטיוטה נשמרת** | SEC-08 |
| אין הרשאה / אין הסכמה | 403 | הודעה ייעודית; `consent_required` → דיאלוג הסכמה | ERR-02 |
| לא נמצא | 404 | מסך "לא נמצא" + חזרה להיום (ארוחה שנמחקה במכשיר אחר) | ERR-03 |
| קונפליקט | 409 | `version` → "עודכן ממכשיר אחר" + טעינה מחדש; `id_conflict` (אותו `id`, Payload שונה) → יצירת ID חדש | INT-03, INT-06 |
| מכסה / קצב | 429 | "נותרו 0 הערכות היום (מתאפס ב-HH:MM)" + **פתיחת הזנה ידנית** | ERR-04, AIQ-01 |
| שגיאת שרת | 500/502 | הודעה ידידותית + "נסה שוב" (אותו `id`) + הזנה ידנית | ERR-05 |
| Timeout | 504 / AbortError | "לוקח יותר מהרגיל" + ניסיון חוזר/ידני; מכסה מוחזרת | ERR-06 |
| Offline | `navigator.onLine=false` או Fetch נכשל | באנר "אין חיבור"; כתיבה חסומה; טיוטה נשמרת | PWA-02 |
| AI לא זמין | 503 `ai_unavailable` | מעבר אוטומטי לטופס ידני עם הטקסט שהוקלד כשם | ERR-07, E2E-12 |
| תשובת AI פגומה | `malformed` | ניסיון תיקון אחד בשרת → אחרת שגיאה + ידני; מכסה מוחזרת | AIC-02 |
| חריגה ממכסה | 429 `quota_exceeded` | כמו 429 | AIQ-01 |
> **Invariant:** אין מצב שבו המשתמש לא יכול להזין ארוחה בגלל כשל ב-AI. נאכף בבדיקת E2E ובבדיקת רכיב לכל קוד שגיאה.

## D.6 PWA
`vite-plugin-pwa` (`registerType:'prompt'`): Precache של Shell עם Revision; `navigateFallback` ל-`index.html` (denylist ל-API); **`*.supabase.co` = NetworkOnly**; ללא Runtime-cache של נתונים. Manifest (`lang:he`, `dir:rtl`, `display:standalone`, אייקונים שקופים, בלי maskable: ב-Android הוא היה מקבל רקע אטום). iOS: אין `beforeinstallprompt` ⇒ הוראות "הוסף למסך הבית"; Session ב-PWA מותקן נפרד מ-Safari ⇒ OTP בקוד (לא Link). Cache מתמיד של Query בעל `buster` = `schema_version`.

## D.7 Offline – ארכיטקטורה לעתיד (ללא שכתוב)
```
UI → Repository (interface) ─┬─ v1: SupabaseRepository (online)
                             └─ v2: OfflineFirstRepository
                                    IndexedDB (local write, optimistic) → Outbox (mutation_id, id, base_version, payload)
                                    → Sync worker (retry/backoff) → Supabase RPC (כבר Idempotent)
```
מה שכבר נדרש ב-v1 כדי לאפשר זאת: UUID לקוח, `version` בכל טבלה, RPC Idempotent, סדר פעולות לפי `client_ts`, הפרדת `entered_at`/`eaten_at`.

## D.8 אבטחת Hosting (כותרות)
`Content-Security-Policy: default-src 'self'; connect-src 'self' https://<proj>.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` · `Referrer-Policy: no-referrer` · `X-Content-Type-Options: nosniff` · `Permissions-Policy` מצומצם · HSTS.

## D.9 מאגר המזון (v1) ומנגנון הערכה עתידי
- **נכס סטטי, לא שרת:** `npm run build:food-db` (ידני, לא ב-CI; `-- --refresh` להורדה מחדש) מוריד את הטבלאות הרשמיות (מצרכים ל-100 ג', יחידות מידה, משקל ליחידה) מ-data.gov.il דרך ה-API הציבורי (נדרש User-Agent של דפדפן), מנקה אותן ב-`core/food/source.ts` (טהור ונבדק) ומפיק `src/assets/food-db/food-db.json` (~1.1MB, ~150KB gzip) + `food-db.meta.json`. **שער איכות:** מזון ללא שם/קלוריות, קלוריות מחוץ ל-0–900, מאקרו שלילי או >105 ג' ל-100 ג' מוסרים ומדווחים; הבנייה נכשלת אם הוסרו יותר מ-2%; חריגי Atwater מדווחים בלבד. הקבצים המופקים נכנסים ל-Git ⇒ ה-build אינו תלוי ברשת. נטען בעצלתיים (`import()` – צ'אנק נפרד) ונשמר ב-Cache של ה-SW.
- **`core/food` (טהור):** `normalizeHebrew`, `searchFoods(index, query, {recent})`, `computeEntry(food, quantity) → {kcal, protein, carbs, fat}`. אין DOM/רשת; נבדק ב-Unit (FOOD-01..03).
- **Seam להערכה עתידית:** ממשק `MealEstimator { estimate(text, ctx): Promise<EstimateResult> }`. ב-v1 אין מימוש מחובר. בעתיד: `EdgeFunctionEstimator` (לפי AI_CONTRACT) או `ClipboardEstimator` ("העתק והדבק") – שניהם מחזירים אותה צורת תוצאה ועוברים ולידציה (Zod) לפני כניסה לטופס. כך הוספת AI אינה משנה את ה-UI.
- **Edge Functions ב-v1:** רק `delete-account`.
