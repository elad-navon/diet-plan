# SECURITY_PLAN – תוכנית אבטחה ופרטיות

> **סטטוס:** טיוטה לסקירה (v0.1) · **תאריך:** 2026-10-01 · **נגזר מ:** התוכנית המאושרת, חלק H.3 + נספחים מ-D.4, D.8, E.4, G.5, A6
> **מזהי סעיפים:** האותיות A–J הן מרחב שמות גלובלי בין המסמכים (ראו [README](README.md)).
> **קשור:** [ARCHITECTURE](ARCHITECTURE.md) · [DATA_MODEL](DATA_MODEL.md) · [AI_CONTRACT](AI_CONTRACT.md) · [TEST_PLAN](TEST_PLAN.md)

**מטרת המסמך:** מטריצת בדיקות אבטחה (Authentication, Authorization/IDOR, Injection, Abuse, סודות, Headers, תלויות, פרטיות), ובנספחים: צינור ה-Edge Function, כותרות Hosting, מטריצת RLS וטיפול בקלט עוין.

---


> **היקף v1 (2026-10-01):** אין קריאה לשירות AI או לצד שלישי בתשלום. בדיקות Prompt-injection, מכסת AI, Circuit-breaker והסכמת AI (AIQ-*, AIC-06, חלקי SEC-02/SEC-11 הקשורים למפתח Anthropic) **נדחו**. נשארות כל בדיקות ה-Authentication/Authorization/RLS/XSS/CSV/Headers/תלויות/סודות (`service_role`) והפרטיות (מחיקת חשבון, יצוא). שטח התקיפה והפרטיות פשוטים יותר: אף טקסט של המשתמש אינו נשלח לצד שלישי.

## H.3 תוכנית אבטחה
| תחום | בדיקות | מזהים |
|---|---|---|
| **Authentication** | JWT לא תקין/פג/מזויף/Algorithm none ⇒ 401 (Edge+PostgREST); Logout מנקה Session ו-Caches; פקיעת Session באמצע הזנה ⇒ Refresh יחיד/מסך כניסה + טיוטה; מכשירים מרובים (Logout מקומי לא מנתק אחר; Global מבטל Refresh Tokens – מגבלה מתועדת: Access token חי עד שעה); OTP: Rate limit, הודעות גנריות (אין Enumeration) | SEC-01, 07, 08, 09 |
| **Authorization / IDOR** | A לא קורא/מעדכן/מוחק של B בכל הטבלאות (פרופיל, ארוחות, שקילות, מועדפים, תוכניות, AI); ניחוש `id` ידוע; העברת `user_id` בגוף בקשה; `user_id` מ-JWT בלבד ב-Edge | RLS-01..06 |
| **Injection** | XSS/HTML ב-`name/description/items/assumptions` בכל מקום (רשימה, גרף, aria, Toast, יצוא); Prompt injection (G.6-N); CSV injection; JSON פגום; Content-Type שגוי; Payload 5MB; Unicode/RTL-override | SEC-03, 04, 05, AIC-06 |
| **Abuse** | מכסת AI אטומית; Burst; Circuit-breaker; תקרות שורות/גודל; Rate Limit לכניסה | AIQ-*, DB-06 |
| **סודות** | אין `sk-ant-` / `service_role` ב-`dist/`+Sourcemaps; כל JWT ב-Bundle הוא `role=anon`; `.env` לא ב-Repo (gitleaks) | SEC-02 |
| **Transport/Headers** | CSP/HSTS/Frame/Referrer; CORS מורשה בלבד | SEC-06 |
| **תלויות** | `npm audit` + Lockfile + Dependabot | SEC-10 |
| **פרטיות** | הסכמת AI לפני שימוש ראשון; מחיקת חשבון מוחקת הכול; יצוא; לוגים ללא תוכן/אימייל; מדיניות פרטיות (נתוני בריאות = רגישים; ייעוץ משפטי) | DB-08, SEC-11 |

## נספחים (מועתקים מהמסמכים המקוריים לנוחות; המקור המחייב נשאר במסמך המצוין)

### A6. אבטחה ופרטיות
| ID | הבעיה | הסיכון | החלטה | בדיקה |
|---|---|---|---|---|
| P-37 🔴 | RLS כללי ("user_id = auth.uid()") | חסר WITH CHECK → העברת שורות, עדכון user_id; SECURITY DEFINER לא מאובטח | מטריצת RLS לכל טבלה/פעולה (E.4), `WITH CHECK`, עמודות Immutable, `search_path` קבוע, `anon` חסום, כתיבה ל-`profiles/target_plans/ai_*` רק דרך RPC/שרת | RLS-01..06 |
| P-38 🟠 | יצוא CSV | CSV/Formula injection; Excel בעברית | Prefix `'` לתאים המתחילים ב-`= + - @ \t \r`; UTF-8 BOM; CRLF | SEC-04 |
| P-39 🟠 | SW עלול לשמור תגובות API | דליפת נתונים במכשיר משותף; נתונים מיושנים | API = NetworkOnly; Cache נוקה ב-Logout; Query-cache מתמיד רק לנתונים ממוקדים ומנוקה בהתנתקות | PWA-06, SEC-07 |
| P-40 🟠 | Auth: Magic-link/OAuth ב-PWA של iOS שוברים Session; SMTP ברירת מחדל של Supabase מוגבל מאוד | משתמשים לא מצליחים להתחבר | **Email OTP (קוד 6 ספרות)** + SMTP מותאם; Google OAuth בהמשך | PWA-07, E2E-01 |
| P-41 🟠 | אין מחיקת חשבון/יצוא נתונים | פרטיות (נתוני בריאות = רגישים) | Edge Function `delete-account` + יצוא JSON/CSV; מדיניות פרטיות; להתייעץ עם יועץ משפטי (תיקון 13 לחוק הגנת הפרטיות) | DB-08 |
| P-42 🟡 | סודות ב-Bundle | דליפת מפתח Anthropic/Service role | סריקת `dist/` ו-sourcemaps ב-CI; מפתחות רק כ-Secrets בשרת | SEC-02 |
| P-43 🟡 | חסרות כותרות אבטחה | XSS/Clickjacking | CSP, `frame-ancestors 'none'`, Referrer/Permissions-Policy; ESLint `react/no-danger` | SEC-06 |

### D.4 צינור ה-Edge Function `estimate-meal`

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

### D.8 אבטחת Hosting (כותרות)
`Content-Security-Policy: default-src 'self'; connect-src 'self' https://<proj>.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` · `Referrer-Policy: no-referrer` · `X-Content-Type-Options: nosniff` · `Permissions-Policy` מצומצם · HSTS.

### E.4 מטריצת RLS (O=בעלים, X=משתמש אחר מאומת, A=anon) — **כל תא הוא בדיקה אוטומטית (pgTAP)**
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

### G.5 Post-processing בשרת (לפני תשובה)

> ⚠️ **סטטוס: נדחה (Deferred) – אינו חלק מ-v1.** ב-2026-10-01 הוחלט שלא לפתוח חשבון AI בתשלום (גם לא עם תקרת הוצאה). החלק הזה נשמר כתכנון מוכן להרחבה עתידית; אין לממש אותו ב-v1.

סכומים = Σ פריטים (מתעלמים מסכומי המודל) · Atwater: `|kcal−(4P+4C+9F)| > max(25, 0.2·kcal)` ⇒ `macro_kcal_mismatch` + הורדת Confidence · צפיפות: `kcal ≤ 9.2·grams` אחרת `density_clamped` · גבולות: פריט ≤3000 קק"ל, כמות ≤3000 ג'/מ"ל, יחידות ≤50 · כפילויות פריטים מאוחדות/מסומנות · שמות: הסרת תגיות/בקרה/URL, ≤60 תווים · ריק/לא תקין ⇒ ניסיון תיקון **אחד** אחרת `malformed` + Refund.
**קלט עוין:** טקסט המשתמש עטוף ב-`<meal_text>` עם Escape ל-`<`/`>`; המודל מקבל הנחיה לראות בו נתונים בלבד; פלט רק דרך Tool; Canary token בפרומפט – נוכחותו בפלט ⇒ כישלון בדיקה. מניפולציה של הערכים פוגעת רק במשתמש עצמו (אין חשיפה בין משתמשים) והמספרים נחסמים בגבולות לעיל.
