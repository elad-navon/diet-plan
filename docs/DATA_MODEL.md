# DATA_MODEL – מודל נתונים

> **סטטוס:** טיוטה לסקירה (v0.1) · **תאריך:** 2026-10-01 · **נגזר מ:** התוכנית המאושרת, חלק E
> **מזהי סעיפים:** האותיות A–J הן מרחב שמות גלובלי בין המסמכים (ראו [README](README.md)).
> **קשור:** [ARCHITECTURE](ARCHITECTURE.md) · [SECURITY_PLAN](SECURITY_PLAN.md) · [AI_CONTRACT](AI_CONTRACT.md) · [TEST_PLAN](TEST_PLAN.md)

**מטרת המסמך:** טבלאות, אילוצים, Triggers/RPC, מנגנון Daily Target Snapshot (תוכניות יעד עם תאריך תחילת תוקף), מטריצת RLS ומדדי AI.

---


מוסכמות: PK מסוג `uuid` (בארוחות/שקילות/מועדפים נוצר בלקוח); `user_id uuid not null default auth.uid() references auth.users on delete cascade`; `created_at/updated_at timestamptz`; `version int` (מוגדל ב-Trigger); **`ENABLE`+`FORCE ROW LEVEL SECURITY` בכל טבלה**; הרשאות `anon` נשללות; פונקציות `SECURITY DEFINER` עם `set search_path = ''`, `REVOKE ALL FROM public, anon`, `GRANT EXECUTE` ל-`authenticated` בלבד ומקבלות `user_id` **רק** מ-`auth.uid()`.

## E.1 טבלאות

> **היקף v1 (2026-10-01):** הטבלאות `ai_estimates`, `ai_quota_counters`, `ai_global_counters`, העמודות `profiles.ai_consent_*` ו-`meals.ai_estimate_id / ai_original / corrected_at_save`, והפונקציות `consume/refund/get_ai_quota` – **נדחו** ואינן נכללות ב-migrations של v1 (migration עתידי יוסיף אותן). `meals.source ∈ {food_db, manual, favorite, copy}` (הערך `ai` שמור לעתיד). `meals.items[]` שומר Snapshot: `{ food_id?, food_db_version?, name, grams, unit?, count?, kcal, protein_g?, carbs_g?, fat_g? }`. בהתאם, ב-v1 יש **6 טבלאות**: profiles, target_plans, weight_entries, meals, favorites, audit_events.

**`profiles`** (שורה למשתמש; זהות/הסכמות בלבד – לא יעדים)
`user_id PK` · `sex ∈ {female,male,unspecified}` · `birth_date` · `height_cm numeric(4,1) 120..230` · `timezone text` (מאומת מול `pg_timezone_names`) · `ai_consent_at`, `ai_consent_version` · `disclaimer_ack_at` · `created_at/updated_at/version`. גיל ≥18 נאכף ב-RPC.

**`target_plans`** ⭐ (Daily Target Snapshot – מוגדר ב-E.2) — Append-only לוגית
`id` · `user_id` · `effective_from date` · `UNIQUE(user_id, effective_from)` · `engine_version` · `reason ∈ {onboarding,profile_edit,goal_edit,activity_edit,schedule_edit,recalc}` ·
קלטים: `inputs jsonb` (מין, גיל, גובה, משקל, פעילות, יעד מבוקש) + עמודות לשאילתות: `goal_type ∈ {lose,maintain,gain}`, `activity_level`, `start_weight_kg`, `start_date`, `target_weight_kg`, `weekly_rate_kg`, `projected_date` ·
תוצאות: `bmr`, `tdee`, `kcal_target int 1200..6000`, `protein_g/carbs_g/fat_g int null`, `macro_state ∈ {ok,relaxed,low_carb,conflict}`, `plan_state ∈ {ok,adjusted_rate,lose_not_feasible,date_adjusted}`, `warnings jsonb` ·
`meal_schedule jsonb` (3–6 Slots; חלונות לא חופפים; משקלים סכומם 1±0.001; מאומת ב-RPC).

**`weight_entries`**: `id`, `user_id`, `local_date` (נגזר בשרת), `measured_at`, `tz`, `weight_kg numeric(4,1) 30..350`, `UNIQUE(user_id, local_date)` (שקילה מאוחרת באותו יום מחליפה), `version`. שינוי >3 ק"ג מהשקילה האחרונה → אישור בממשק.

**`meals`**
`id` (UUID לקוח) · `user_id` · `eaten_at timestamptz` · `tz` · `local_date date` (Trigger) · `slot ∈ {breakfast,lunch,snack,dinner,other}` · `name 1..80` · `description ≤500` (טקסט חופשי מקורי) · `kcal int 0..3000` · `protein_g/carbs_g/fat_g numeric(5,1) null 0..500` (all-or-none) · `items jsonb` (≤30 פריטים, ≤16KB) · `source ∈ {ai,manual,favorite,copy}` · `ai_estimate_id → ai_estimates` · `favorite_id → favorites ON DELETE SET NULL` · **`ai_original jsonb`** (Snapshot בלתי-משתנה של סכומי ה-AI: kcal/macros/status/overall_confidence) · `corrected_at_save boolean` (Trigger בהוספה: האם הסכומים הסופיים ≠ המקור) · `entered_at default now()` (שרת, Immutable) · `deleted_at` · `version`.
אינדקסים: `(user_id, local_date) WHERE deleted_at IS NULL`, `(user_id, eaten_at, id)`.

**`favorites`**: `id`, `user_id`, `name 1..80`, `kcal`, מאקרו (null), `items`, `tags text[]` (הכנה להתאמה אישית), `use_count`, `last_used_at`, `created_from_meal_id`, `version`; תקרה 200.

**`ai_estimates`** (כתיבה: שרת בלבד): `id = request_id`, `user_id`, `input_text`, `input_hash`, `language`, `context jsonb`, `contract_version`, `model`, `prompt_version`, `status ∈ {ok,needs_clarification,not_food,unsupported,failed}`, `error_code`, `response jsonb`, `tokens_in/out`, `latency_ms`, `created_at`.

**`ai_quota_counters`**: `(user_id, bucket text) PK`, `count`; גישה רק דרך `consume_ai_quota / refund_ai_quota / get_ai_quota`. **`ai_global_counters`** לנתיב הגנה גלובלי.

**`audit_events`**: `id bigint identity`, `user_id`, `entity`, `entity_id`, `action`, `before jsonb`, `after jsonb`, `at`. נכתב **רק** ע"י Trigger (`SECURITY DEFINER`) על `profiles, target_plans, weight_entries, meals, favorites`; אירועי AI מגיעים מ-`ai_estimates`.

## E.2 Daily Target Snapshot – תכנון ובדיקה
**מנגנון:** `target_plans` מגורסאות לפי `effective_from`. יעד יום D (וכן לוח הארוחות שלו) = השורה עם `effective_from` הגדול ביותר ≤ D. אין שורות-יום ואין "חורים" בימים שלא נפתחו.
**כללים:** כתיבה רק דרך `apply_plan_change()`; מותר להוסיף/להחליף שורה עם `effective_from ≥ היום (ב-TZ המשתמש)`; **שורה בעבר לעולם לא משתנה** (נאכף ב-RPC + Trigger). ימים לפני התוכנית הראשונה = "ללא יעד" (מוצגת צריכה בלי סטטוס).
**דוגמה:** יום 1 ו-2: 1800 → ביום 3 המשתמש משנה רמת פעילות ⇒ שורה חדשה `effective_from=יום 3, kcal=1650` ⇒ `target_for(יום1)=1800`, `target_for(יום2)=1800`, `target_for(יום3)=1650`; היסטוריית ימים 1–2 אינה משתנה. שינוי חוזר באותו יום מחליף את שורת יום 3 בלבד (Audit שומר את הקודמת).
**Trajectory:** קטעי מסלול לפי כל תוכנית (`start_weight/date → target`) – שינוי יעד פותח קטע חדש מהמשקל (Trend) באותו תאריך.
**פונקציות:** SQL `target_for(user, date)` + TS `resolvePlanForDate(plans, date)` – נבדקות ב-**Parity**.
**בדיקות:** DB-04, DB-05, NUT-10 (שקילה לא משנה יעד), E2E-07.

## E.3 Triggers / RPC
| רכיב | תפקיד |
|---|---|
| `derive_local_date` (BEFORE INSERT/UPDATE of eaten_at, tz) | `local_date=(eaten_at AT TIME ZONE tz)::date`; ולידציית tz; חלון זמן (≤ now+5m, ≥ now−31d בהוספה/שינוי זמן) |
| `guard_immutable` | חוסם שינוי `user_id, created_at, entered_at, ai_original, ai_estimate_id, source` |
| `bump_version` | `version+1`, `updated_at` |
| `limit_rows` | ≤60 ארוחות פעילות/יום; ≤200 מועדפים |
| `audit_row_change` | כתיבת `audit_events` לכל INSERT/UPDATE/DELETE |
| RPC `add_meal(p jsonb)` | `INSERT … ON CONFLICT (id) DO NOTHING` → החזרת השורה; אם קיימת ושדות ה-Payload שונים → `409 id_conflict` |
| RPC `apply_plan_change(p jsonb)` | טרנזקציה: עדכון פרופיל + הוספת/החלפת `target_plans` + ולידציה (טווחי kcal, מאקרו, לוח ארוחות, גיל≥18) |
| RPC `consume_ai_quota / refund_ai_quota / get_ai_quota` | אטומי (ראו D.4) |
| Edge `delete-account` | Service role; מחיקת `auth.users` ⇒ CASCADE; אימות שאין שאריות |

## E.4 מטריצת RLS (O=בעלים, X=משתמש אחר מאומת, A=anon) — **כל תא הוא בדיקה אוטומטית (pgTAP)**

> **v1:** שורות `ai_estimates` ו-`ai_quota_counters` נדחו; בדיקת RLS-01 מכסה את 6 הטבלאות של v1.

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | O✓ X✗ A✗ | ✗ ישיר (RPC בלבד) | ✗ ישיר (RPC בלבד) | ✗ (מחיקת חשבון בלבד) |
| target_plans | O✓ X✗ A✗ | ✗ ישיר (RPC) | ✗ ישיר (RPC) | ✗ |
| weight_entries | O✓ X✗ A✗ | O✓ X✗ A✗ (`WITH CHECK user_id=auth.uid()`) | O✓ X✗ A✗; `user_id` Immutable | O✓ X✗ A✗ |
| meals | O✓ X✗ A✗ | ✗ ישיר; O✓ דרך `add_meal` | O✓ X✗ A✗ (+`version`, שדות Immutable) | ✗ (Soft delete = UPDATE) |
| favorites | O✓ X✗ A✗ | O✓ X✗ A✗ | O✓ X✗ A✗ | O✓ X✗ A✗ |
| ai_estimates | O✓ X✗ A✗ | ✗ (שרת בלבד) | ✗ | ✗ |
| ai_quota_counters | ✗ ישיר (O דרך `get_ai_quota`) | ✗ | ✗ | ✗ |
| audit_events | O✓ X✗ A✗ | ✗ (Trigger בלבד) | ✗ | ✗ |
**בדיקות נוספות:** העברת שורה (`UPDATE user_id=B`) נדחית · `INSERT` עם `user_id=B` נדחה · IDOR דרך PostgREST לפי `id` ידוע מחזיר 0 שורות · RPC לא ניתן להרצה ע"י `anon` · משתמש עם JWT פג/מזויף → 401.

## E.5 מדדי AI (Views – ל-service role בלבד, `REVOKE` מ-authenticated)

> ⚠️ **סטטוס: נדחה (Deferred) – אינו חלק מ-v1.** ב-2026-10-01 הוחלט שלא לפתוח חשבון AI בתשלום (גם לא עם תקרת הוצאה). החלק הזה נשמר כתכנון מוכן להרחבה עתידית; אין לממש אותו ב-v1.

`ai_success_rate` = ok÷כלל · `clarification_rate` · `failure_rate` לפי `error_code` · `low_confidence_rate` (overall=low) · `correction_rate` = שיעור ארוחות `source=ai` ש-`corrected_at_save` · `avg_correction_magnitude` = ממוצע `|final−orig|/orig` (קלוריות) + חציון + P90 · `saved_unchanged_rate` · `p95_latency` · `quota_hit_rate` · Drift לפי `model/prompt_version`.

## E.6 מאגר המזון (נכס סטטי, לא טבלה)
קובץ JSON מגורסא (`food-db.<hash>.json`) + `food-db.meta.json`, מופקים ע"י `scripts/build-food-db` (ראו ARCHITECTURE D.9). רשומה: `{ id, name, kcal100, protein100, carbs100, fat100, kind: 'food'|'recipe', units: [{ name, grams }], defaultUnit? }`. מקור: המאגר התזונתי הלאומי (משרד הבריאות; *Other (Open)*; עדכון אחרון במקור 2023-03-21). ערכי ארוחה נשמרים כ-Snapshot ב-`meals.items` ואינם מקושרים למאגר.
