# TEST_PLAN – תוכנית בדיקות

> **סטטוס:** טיוטה לסקירה (v0.1) · **תאריך:** 2026-10-01 · **נגזר מ:** התוכנית המאושרת, חלקים H.1, H.2, H.4–H.6, I
> **מזהי סעיפים:** האותיות A–J הן מרחב שמות גלובלי בין המסמכים (ראו [README](README.md)).
> **קשור:** [SECURITY_PLAN](SECURITY_PLAN.md) · [AI_CONTRACT](AI_CONTRACT.md) · [NUTRITION_RULES](NUTRITION_RULES.md) · [DEFINITION_OF_DONE](DEFINITION_OF_DONE.md)

**מטרת המסמך:** פירמידת הבדיקות, נתוני בדיקה, נגישות/Responsive, PWA, אסטרטגיית רגרסיה (שערי CI) ומטריצת הבדיקות הקריטית (ID, Area, Scenario, Preconditions, Steps, Expected, Priority, Automation). תוכנית האבטחה נמצאת ב-SECURITY_PLAN; בדיקות ה-AI המפורטות ב-AI_CONTRACT §G.6.

---


> **היקף v1 (2026-10-01):** בדיקות ה-AI – AIQ-*, AIC-*, AIA-*, EVAL-* ובדיקות ה-Edge Function להערכה – **נדחו** (אין AI ב-v1) ונשארות כתכנון עתידי. נוספו בדיקות מאגר המזון FOOD-* (סעיף I.7). שורות "Integration – Edge" ו-"AI Eval" ב-H.1 חלות ב-v1 רק על `delete-account`, ובעתיד על ההערכה.

## H.1 Test Pyramid
| שכבה | כלי | מכסה | קצב ריצה |
|---|---|---|---|
| **Unit** (≈70%) | Vitest + fast-check | `core/nutrition` (כולל Property), `schedule`, `recommend`, `dayview`, `time` (Corpus DST/טווחי תאריך), Zod schemas, CSV sanitizer, AI post-processor | כל Commit (<30 שנ') |
| **Component** | Testing Library + jest-axe | טפסים (ולידציה, שגיאות), `ChartModel`→SVG, Sheets/Dialogs (Focus), מצבי טעינה/ריק/שגיאה | כל Commit |
| **Integration – DB** | Supabase local + **pgTAP** | מטריצת RLS (כל תא), Triggers, RPC, Idempotency, מכסה (41 מקביליות), `target_for` Parity, Audit, Cascade | כל PR |
| **Integration – Edge** | Deno test + Anthropic Mock (שרת Fake עם `ANTHROPIC_BASE_URL`) | צינור D.4, JWT, CORS, Payload, Refund, Idempotent replay, Fixtures מוקלטים | כל PR |
| **AI Eval** | `evals/runner` (מודל חי) | G.6 | שינוי prompt/model/schema/post-processing + לפני שחרור |
| **E2E** | Playwright (Chromium-Pixel + WebKit-iPhone + Desktop) | 12 מסעות CUJ בלבד (לא כל פרט) | Smoke בכל PR; מלא Nightly |
| **ויזואלי/נגישות** | Playwright `toHaveScreenshot` + axe-playwright | גרף מרכזי בכל גודל/ערכת צבע/תרחיש; כל מסך ב-axe | PR (מוגבל) + Nightly |
| **PWA/ביצועים** | Lighthouse CI + `size-limit` | Installability, תקציבי JS/LCP/INP | PR + Release |
| **אבטחה** | סריקת Bundle, `npm audit`, בדיקות Authz | SEC-* | כל PR/שבועי |
**עקרון:** כל לוגיקה שניתן להוציא ל-`core/` נבדקת ב-Unit; E2E רק לזרימות קריטיות.

## H.2 Test Data (`testing/fixtures` + `supabase/seed.sql`, Clock קבוע)
| סט | תיאור |
|---|---|
| normal | נקבה 34, 165/71, יעד 62 (V1) |
| low-calorie | נקבה 55, 155/52 (V2) + Override 1200 (V4) |
| high-calorie | זכר 28, 190/105 (V3) |
| extreme/conflict | V5, V6, V7; גובה/משקל בקצוות הטווח |
| no-meals / many-meals | 0 ארוחות · 60 ארוחות ביום · 365 ימים (≈20K שורות) לביצועי יצוא/היסטוריה |
| corrected-AI | ארוחות AI שונו (±5%, ±30%, ×2) + לא שונו |
| duplicates | אותו `id` ×N (מקביל) · אותו Payload עם `id` שונה (מותר) |
| multi-day | 30 ימים, כולל יום ללא רישום ושינוי תוכנית באמצע |
| timezone | `Asia/Jerusalem` (**2026-03-27 → יום 23ש'; 2026-10-25 → יום 25ש'**) · `America/New_York` (2026-03-08, 2026-11-01) · `Europe/London` · `Australia/Lord_Howe` (DST חצי שעה) · `Asia/Beirut` (DST בחצות) · לילה 23:59/00:00/00:01 · 2028-02-29 · 2026-12-31→2027-01-01 · סוף חודש |
| users | A ו-B (RLS) · משתמש פג-תוקף · משתמש ללא הסכמת AI |

## H.4 נגישות (דרישה – WCAG 2.2 AA) ו-Responsive
- **מקלדת:** כל הפעולות; סדר Tab הגיוני; Sheets = Dialog (Radix) עם Focus trap, `Esc`, החזרת Focus. **קורא מסך:** שמות/תיאורים לטבעת, גרף (`role=img` + `aria-describedby` לתקציר טקסטואלי + **טבלה חלופית** מאותו Model), סטטוס, כפתורי אייקון. **שגיאות:** `aria-invalid`, `aria-describedby`, אזור `aria-live`. **צבע:** לעולם לא לבדו (אייקון+טקסט); ניגודיות 4.5:1 טקסט / 3:1 גרפיקה (Tokens נבדקים); **מגע ≥44×44px**; `prefers-reduced-motion`; מצב כהה; Zoom 200% וטקסט-בלבד 200% בלי אובדן תוכן; `lang="he" dir="rtl"`, `<bdi>` למספרים/שעות.
- **רוחבים:** 320 · 360 · 390 · 430 · 768 · 1024 · 1280+. בדיקות: אין גלילה אופקית; ניווט תחתון לא חופף ל-FAB; Sheet עם מקלדת וירטואלית (`visualViewport`); שמות עבריים ארוכים (Clamp 2 שורות + מלא בפירוט); גרף קריא ב-320px (תוויות מצומצמות, אין חפיפה, יעדי מגע גדולים סביב סמנים).
- **גרף מרכזי – תרחישים:** 0 ארוחות · 1 · הרבה (סמנים חופפים) · 0 קק"ל · חריגה · חריגה קיצונית (ציר חתוך ל-2K + חץ) · 00:00 · 23:59 · בדיעבד · נמחקה · נערכה · יום DST של 23/25 שעות · RTL · כהה · מגע (הקשה על סמן) · מקלדת.

## H.5 PWA (מטריצת בדיקה)
התקנה (Chrome/Edge/Android, iOS Add-to-Home) · עדכון (גרסה חדשה ⇒ Toast, ללא רענון על טופס מלוכלך, ניקוי Cache ישן) · הסרה והתקנה מחדש (נתונים חוזרים אחרי התחברות; אין שאריות כשמנותק) · Shell Offline · ניווט Offline · ניסיון כתיבה Offline (חסום + טיוטה) · חזרת רשת (Refetch, באנר נעלם) · API לא ב-Cache (בדיקת Cache Storage) · גרסה ישנה מול סכמה חדשה (`426`) · מצב כהה · Viewport נייד · Lighthouse PWA.

## H.6 אסטרטגיית רגרסיה – מה רץ בכל שינוי
| שער | תוכן | חוסם Merge |
|---|---|---|
| 1 | `tsc --noEmit` · ESLint (כולל חוקי Date/`no-danger`/גבולות שכבות) · Prettier | ✅ |
| 2 | Unit: nutrition + recommend + time + schedule + dayview + contracts | ✅ |
| 3 | AI schema/post-processing (Fixtures) | ✅ |
| 4 | pgTAP: RLS + Triggers + RPC + מכסה | ✅ |
| 5 | Edge Function tests (Mock AI) | ✅ |
| 6 | `vite build` + בדיקת Bundle סודות + `size-limit` | ✅ |
| 7 | Playwright Smoke קריטי (CUJ 1,2,4,5,12) | ✅ |
| 8 | Nightly: E2E מלא, ויזואלי/axe מלא, Lighthouse | התראה |
| 9 | AI Eval חי (שינוי prompt/model/schema או ידני) | ✅ כששונה |

## I. Critical Test Matrix

עדיפות: **P0** קריטי · **P1** גבוה · **P2** בינוני · **P3** נמוך. אוטומציה: **U** Unit · **C** Component · **DB** pgTAP · **EF** Edge fn · **E2E** Playwright · **V** ויזואלי · **EV** AI-Eval · **M** ידני.

### I.1 מנוע תזונה
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| NUT-01 | BMR/TDEE | וקטורי BMR לשלושת המינים | – | חשב V1,V3 + לא-מציין | 1410.25 / 2102.5 / קבוע −78, סטייה ≤0.01 | P0 | U |
| NUT-02 | Plan | V1 מלא | V1 | `computePlan` | K=1390,P=122,C=133,F=41; ok; 126 ימים; סכום קלוריות ±5 | P0 | U |
| NUT-03 | Safety | V2: TDEE קרוב לרצפה | V2 | `computePlan` | `lose_not_feasible`; K<1200 לא מוחזר; הצעת שמירה | P0 | U+C |
| NUT-04 | Rate caps | V3: קצב מוגבל ע"י 30% TDEE | V3 | `computePlan` | r=0.9891; K=2540; ללא אזהרה | P0 | U |
| NUT-05 | Date mode | V6: 10 ק"ג ב-4 שבועות | – | מצב תאריך | `date_adjusted`; לא נשמר ללא אישור; תאריך מציאותי | P0 | U+E2E |
| NUT-06 | Solver | V4 low_carb · V5 conflict · ענף relaxed | – | חשב מאקרו | מצבים נכונים; ב-conflict `macros=null`; ה-UI מסתיר יעדי מאקרו | P0 | U+C |
| NUT-07 | Property | רשת קלטים תקפה (fast-check) | – | אלפי קלטים | Invariants של F.4 + K≥KMIN + K≤TDEE + אין NaN/∞ + מונוטוניות | P0 | U |
| NUT-08 | Validation | גיל 17 · BMI 18.0+ירידה · יעד BMI 18.4 · משקל 20 ק"ג | – | שליחה | חסימות עם הודעה ספציפית; לא נשמר דבר | P0 | U+E2E |
| NUT-09 | Dates | יום הולדת 29/2; יעד שחוצה 29/2/2028 | – | גיל ו-Projected | גיל נכון (1/3); ספירת ימים נכונה | P1 | U |
| NUT-10 | Stability | שקילה אחרי תוכנית | תוכנית פעילה | הוסף שקילה | `kcal_target` לא משתנה; כרטיס "חשב מחדש" רק מעל סף | P0 | U+DB |
| NUT-11 | Trend | EMA עם ימים חסרים | סדרת שקילות | חשב Trend | ערכים לפי הנוסחה; ללא קפיצות | P1 | U |
| NUT-12 | Copy | תחזית | מסך תוצאה/התקדמות | רנדר | מופיע "משוער/לא הבטחה" + חרוט; אין ניסוח מוחלט | P1 | C |

### I.2 זמן ותאריכים
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| TIME-01 | Boundary | 23:59:59.999 לעומת 00:00:00.000 (Jerusalem) | Clock קבוע | שמור 2 ארוחות | D לעומת D+1; `local_date` נכון (SQL+TS) | P0 | U+DB |
| TIME-02 | Midnight | ארוחה ב-00:01 | – | הוסף | שייכת ליום החדש; רמז UI; עריכת זמן ל-23:50 מזיזה ליום קודם | P0 | U+E2E |
| TIME-03 | DST קיץ | 2026-03-27, 02:30 בירושלים | – | בחר 02:30 | נפתר ל-03:30 (compatible); אורך יום 1380 דק'; גרף תקין | P0 | U+DB+V |
| TIME-04 | DST חורף | 2026-10-25, 01:30 כפול | – | שתי ארוחות 01:30 (ראשונה/שנייה) | Instants שונים, אותו `local_date`; ציר 1500 דק' | P0 | U+DB+V |
| TIME-05 | Parity | Corpus 5,000 רגעים × 5 אזורים | – | SQL מול TS | זהה 100% (כולל Lord_Howe, Beirut) | P0 | DB+U |
| TIME-06 | Travel | מכשיר ב-NYC, פרופיל ירושלים | – | פתח אפליקציה | Prompt; "השאר" ⇒ TZ בית; "עבור" ⇒ ארוחות חדשות ב-NYC; ישנות לא משתנות | P1 | E2E |
| TIME-07 | Clock skew | שעון מכשיר +2 שעות / −2 שעות | – | הוסף ארוחה | באנר Skew; שרת דוחה עתיד>5 דק'; `entered_at` שרת | P0 | E2E+DB |
| TIME-08 | Calendar | 29/2/2028 · 31/12/2026 23:59→1/1/2027 · סוף חודש · שבוע יום ראשון | – | שמירה/אגרגציה | ימים ושבועות נכונים; Streak חוצה שנה | P1 | U |
| TIME-09 | Backfill | ארוחה אתמול 21:00 · ארוחה לפני 32 יום | – | הוסף | הראשונה ביום אתמול עם יעד אתמול; השנייה נדחית | P1 | E2E+DB |
| TIME-10 | Lint | `Date.now()`/`new Date(` מחוץ ל-time | – | הרץ ESLint | נכשל | P1 | CI |

### I.3 המלצות וגרף
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| REC-01 | Status | R1 | K=1800, 10:00, S=0 | `recommendNext` | behind; 720/360/720 | P0 | U |
| REC-02 | Status | על המסלול (ארוחת בוקר 450 ב-08:30) | – | הרץ | on_track; מועמדים צהריים/ביניים/ערב | P0 | U |
| REC-03 | Status | R2 | S=900 ב-09:00 | הרץ | ahead; 360/180/360 | P0 | U |
| REC-04 | Over | R3 | S=1950 | הרץ | over_budget; אין הצעות; ניסוח ניטרלי ללא "פצה/צום" | P0 | U+C |
| REC-05 | End of day | R4 | 21:30 | הרץ | day_complete; נשנוש ≤R או אין הצעה אם R<150 | P0 | U |
| REC-06 | Invariants | Property | רשת מצבים | הרץ | Σbudgets ≤ max(0,R); kcal הצעה ≤ budget; אין הצעה כש-R<מינימום; `portionFactor`∈[0.5,1.5] | P0 | U |
| REC-07 | Skipped | R5 | 18:30 | הרץ | ערב 810; אין "פיצוי"; הערת אכילה מועטה | P1 | U |
| REC-08 | Missing macro | ארוחות kcal בלבד | – | הרץ | Fallback לקלוריות; תג כיסוי; ללא קריסה | P1 | U+C |
| REC-09 | Odd times | ארוחה 06:30 · ארוחה 03:00 · ארוחה אחרי החלון | – | הרץ | לא `ahead` שגוי; Slot נגזר נכון | P1 | U |
| REC-10 | Purity | עריכה/מחיקה/הוספה בדיעבד | – | שנה והחזר | פלט זהה לפני/אחרי; אין מצב נסתר | P0 | U |
| REC-11 | Excess | S=3×K | – | הרץ | Cap בגרף; הצעה לבדוק הזנה; טון ניטרלי | P1 | U+V |
| REC-12 | Seams | Filter "לא אוהב" + מועדף כמועמד | – | הזרק | מסונן/מועדף בבונוס, ללא שינוי ב-core | P2 | U |
| CHART-01 | Chart | 0 ארוחות | יום ריק | רנדר | מסדרון בלבד + מצב ריק + טבלה חלופית | P0 | V+C |
| CHART-02 | Chart | 1 ארוחה / הרבה (15 בשעה) | – | רנדר | קריא; סמנים עם יעד מגע 44px; אין חפיפת טקסט | P0 | V |
| CHART-03 | Chart | חריגה + חריגה קיצונית | S=1.2K / 3K | רנדר | קו יעד, ציר חתוך עם חץ ותווית | P0 | V |
| CHART-04 | Chart | 23:59 · 00:00 · בדיעבד · נמחקה · נערכה | – | בצע | מיקום נכון; עדכון מיידי | P0 | V+E2E |
| CHART-05 | Chart | רוחבים 320/360/390/430/768/1024/1280 × בהיר/כהה | – | Snapshot | ללא גלישה/חיתוך; תוויות מצטמצמות; Snapshot יציב | P0 | V |
| CHART-06 | A11y | טבלה חלופית ותקציר | – | קורא מסך/axe | `role=img`+תיאור; הטבלה תואמת ל-Model; Focus לסמנים במקלדת | P0 | C+M |
| CHART-07 | Chart | מגע (הקשה על סמן) | נייד | הקש | פירוט מתחת לגרף (לא Tooltip) | P1 | E2E |

### I.4 מסד נתונים, RLS, שלמות
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| RLS-01 | Matrix | כל תא ב-E.4 (8 טבלאות×4 פעולות×O/X/A) | משתמשים A,B | הרץ הכול | תואם לטבלה בדיוק | P0 | DB |
| RLS-02 | WithCheck | INSERT עם `user_id=B`; UPDATE `user_id→B` | A מחובר | בצע | נדחה | P0 | DB |
| RLS-03 | IDOR | A קורא/מעדכן/מוחק `id` של B דרך PostgREST | – | שלח | 0 שורות/אין שינוי | P0 | DB+EF |
| RLS-04 | anon | כל טבלה ו-RPC כ-anon | – | קרא/כתוב | נדחה | P0 | DB |
| RLS-05 | Writes | כתיבה ישירה ל-`profiles/target_plans/ai_*/audit_events` | A | נסה | נדחה; RPC תקין עובד | P0 | DB |
| RLS-06 | Definer | `search_path`, `user_id` מ-`auth.uid()` | – | נסה לספק `user_id` אחר | מתעלם/נדחה | P0 | DB |
| DB-01 | Trigger | ערך `local_date` מהלקוח | – | הוסף עם ערך שגוי | נדרס בערך השרת | P0 | DB |
| DB-02 | Immutable | שינוי `entered_at/ai_original/user_id` | – | UPDATE | נדחה | P0 | DB |
| DB-03 | Bounds | kcal 0/3000/3001 · שם 1/80/81 · מאקרו 500.0/500.1 · `items` 16KB+ | – | הוסף | גבולות נכונים; זהים ל-Zod (בדיקת עקביות) | P1 | DB+U |
| DB-04 | Snapshot | יום1,2=1800; שינוי ביום3→1650 | 3 ימים | `target_for` ל-3 ימים | 1800/1800/1650; Parity עם TS | P0 | DB+U |
| DB-05 | Snapshot | החלפה באותו יום · כתיבה לעבר | – | RPC | הראשונה מחליפה; השנייה נדחית; Audit שומר | P0 | DB |
| DB-06 | Caps | 61 ארוחות ביום · 201 מועדפים | – | הוסף | נדחה | P1 | DB |
| DB-07 | Audit | CRUD על ארוחה | – | בצע | `audit_events` מלא עם before/after; לא ניתן לשינוי | P1 | DB |
| DB-08 | Delete acct | מחיקת חשבון | נתונים בכל הטבלאות | `delete-account` | 0 שורות שאריות | P0 | DB+EF |
| INT-01 | Idempotency | `add_meal` אותו `id` ×2 | – | שלח | שורה אחת; אותה תשובה | P0 | DB |
| INT-02 | Concurrency | אותו `id` ×10 במקביל | – | שלח | שורה אחת | P0 | DB |
| INT-03 | Conflict | אותו `id`, Payload שונה | – | שלח | 409 `id_conflict` | P0 | DB |
| INT-04 | Timeout | הצלחה בשרת + Timeout בלקוח | – | Retry עם אותו `id` | ללא כפילות; ה-UI מתכנס | P0 | E2E+DB |
| INT-05 | Double-click | לחיצה כפולה על "שמור" | – | לחץ ×2 מהר | ארוחה אחת; כפתור חסום בזמן Pending | P0 | E2E |
| INT-06 | OCC | עריכה מקבילה ממכשירים | 2 סשנים | שניהם עורכים | השני מקבל 409; אין Lost update שקט | P1 | DB+E2E |
| INT-07 | Rollback | 500 אחרי Optimistic | – | הזרק כשל | טבעת/רשימה חוזרים; Toast | P1 | C+E2E |
| INT-08 | Atomic | כשל באמצע `apply_plan_change` | – | הזרק | לא נשמר פרופיל ולא תוכנית | P1 | DB |
| INT-09 | Undo | מחיקה כפולה · Undo · Undo אחרי עריכה מקבילה | – | בצע | Idempotent; שחזור; קונפליקט מטופל | P1 | DB+E2E |
| INT-10 | Pagination | 1,500 ארוחות → יצוא/היסטוריה | seed | יצוא | כל 1,500 (לא קטום ב-1000) | P0 | DB+E2E |

### I.5 AI, מכסה, אבטחה

> ⚠️ **סטטוס: נדחה (Deferred) – אינו חלק מ-v1.** ב-2026-10-01 הוחלט שלא לפתוח חשבון AI בתשלום (גם לא עם תקרת הוצאה). בדיקות AIQ-*, AIC-*, AIA-*, EVAL-* נשמר כתכנון מוכן להרחבה עתידית; אין לממש אותו ב-v1.

| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| AIQ-01 | Quota | 41 בקשות מקבילות (מגבלה 40) | משתמש טרי, Mock AI | שלח ×41 | בדיוק 40 הצליחו, 1 קיבלה 429; מונה=40 | P0 | EF+DB |
| AIQ-02 | Refund | כשל ספק / Timeout / Malformed | – | הפעל | מכסה מוחזרת; קלט לא תקין לא צורך | P0 | EF |
| AIQ-03 | Replay | אותו `request_id` | תגובה קיימת | שלח שוב | אותה תשובה, ללא צריכה | P0 | EF |
| AIQ-04 | Burst | 7 בקשות בדקה (מגבלה 6) | – | שלח | השביעית 429 `rate_limited` | P1 | EF |
| AIQ-05 | Breaker | תקרה גלובלית | – | חרוג | 503 + מעבר להזנה ידנית | P1 | EF+E2E |
| AIC-01 | Contract | מוטציות Schema (שדה חסר, kcal שלילי/99999, Enum שגוי) | – | הזרק | כולן נדחות ⇒ fallback בטוח | P0 | EF+U |
| AIC-02 | Malformed | המודל מחזיר טקסט חופשי | – | הזרק | ניסיון תיקון אחד ⇒ שגיאה `malformed` + Refund + ידני | P0 | EF |
| AIC-03 | Totals | סכומי מודל שגויים | – | הזרק | השרת מחשב Σ; סכומי המודל מתעלמים | P0 | EF |
| AIC-04 | Confidence | טווח 1:2.2 עם `high` | – | הזרק | מורד ל-low | P0 | EF |
| AIC-05 | Clarify | "סנדוויץ'" → תשובות → הערכה; `force_estimate` | – | 2 סבבים | ≤3 שאלות; סבב 2 לא מבקש שוב; force ⇒ ok/low | P0 | EF+E2E |
| AIC-06 | Injection | 8 מחרוזות עוינות | – | שלח | Schema תקין; אין דליפת Canary/Prompt; אין URL; אין פריטים זרים | P0 | EF+EV |
| AIC-07 | Input | ריק · רווחים · "!!!" · 501 תווים · בקרה · RTL-override · אימוג'י בלבד | – | שלח | 400, ללא מכסה וללא מודל | P0 | EF |
| AIC-08 | Not food | "אכלתי אבנים", "כדור ויטמין" | – | שלח | `not_food/unsupported` + הצעת הזנה ידנית | P1 | EV+E2E |
| AIC-09 | Quantity | "50 ביצים", "0.001 גרם" | – | שלח | `implausible_quantity`; אישור מפורש | P1 | EV+EF |
| AIA-01 | Audit | שמירה ללא שינוי / עם שינוי kcal | – | שמור | `corrected_at_save` נכון; מדדי View תואמים ל-Fixtures | P1 | DB |
| EVAL-01 | Eval | 100 תרחישים | מודל חי | `npm run eval` | עומד בכל שערי G.6 מול Baseline | P0 | EV |
| EVAL-02 | Stability | 3 הרצות | – | הרץ | סטייה ≤20% ב-≥90% | P1 | EV |
| SEC-01 | Authn | JWT פג/מזויף/none | – | קרא Edge+REST | 401 | P0 | EF+DB |
| SEC-02 | Secrets | סריקת `dist/` + Sourcemaps | build | חפש | אין `sk-ant-`/`service_role`; כל JWT = anon | P0 | CI |
| SEC-03 | XSS | `<img onerror>` / `"><script>` בשם, תיאור, פריטים | – | שמור והצג בכל מקום | מוצג כטקסט; אין ביצוע (כולל aria, Toast, יצוא) | P0 | E2E+C |
| SEC-04 | CSV | שמות המתחילים ב-`= + - @ \t` | – | יצוא | תאים מנוטרלים; פתיחה ב-Excel בעברית תקינה | P1 | U |
| SEC-05 | Payload | JSON פגום · Content-Type שגוי · 5MB | – | שלח | 400/415/413 (לא 500) | P1 | EF |
| SEC-06 | Headers | CSP/CORS | – | בדוק | נוכחים; Origin זר נחסם | P1 | CI |
| SEC-07 | Logout | התנתקות | 2 מכשירים | Logout מקומי · Global | Caches/IDB נוקו; Back לא חושף נתונים; השני נשאר (מקומי) / מבוטל (Global) | P0 | E2E |
| SEC-08 | Session | פקיעה באמצע הזנה | – | חכה לפקיעה ושמור | Refresh יחיד, אחרת כניסה והטיוטה נשמרת | P1 | E2E |
| SEC-11 | Logs | לוג Edge | – | הפעל | ללא טקסט ארוחה/אימייל | P1 | EF |

### I.6 מסעות קריטיים (Playwright), שגיאות, ייצוא, מועדפים
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| E2E-01 | CUJ1 | הרשמה (OTP)→Onboarding→יעד | משתמש חדש | השלם 4 שלבים | יעד יומי + תחזית משוערת; ניתן להתחבר שוב | P0 | E2E |
| E2E-02 | CUJ2 | הוספה ממאגר המזון | – | + → חפש "ביצה" → 2 יחידות → הוסף "לחם" → שמור | פריטים וסכום נכונים; טבעת/גרף/מאקרו מתעדכנים | P0 | E2E |
| E2E-03 | CUJ3 | שינוי כמות ועריכה | ארוחה קיימת | ערוך כמות של פריט → שמור | ערכים מחושבים מחדש; Snapshot נשמר; `version` עלה | P0 | E2E |
| E2E-04 | CUJ4 | הזנה ידנית | – | מלא טופס | תקין; ולידציות מוצגות כשגוי | P0 | E2E |
| E2E-05 | CUJ5 | מחיקה→אישור | ארוחה | לחץ מחק; בטל; לחץ מחק ואשר | "ביטול" משאיר את הארוחה; אישור מוחק אותה (בלי Undo) והתצוגה כולה מתעדכנת מיידית | P0 | E2E |
| E2E-06 | CUJ6 | המלצה | ארוחות חלקיות | פתח "היום" | סטטוס+ארוחה הבאה+שעה | P1 | E2E |
| E2E-07 | CUJ7 | עריכת פעילות | היסטוריה | שנה | יעד חדש מהיום; ימי עבר ללא שינוי | P0 | E2E |
| E2E-08 | CUJ8 | שקילה | – | הוסף | נשמר; יעד לא משתנה; Trend מתעדכן | P1 | E2E |
| E2E-09 | CUJ9 | התקדמות | 30 ימים | פתח | גרפים; "לא נרשם" לא נספר באפס | P1 | E2E |
| E2E-10 | CUJ10 | Logout→Login | – | התנתק והתחבר | הנתונים חוזרים; ללא שאריות בין | P1 | E2E |
| E2E-11 | CUJ11 | Offline→Online | – | נתק; נסה; חבר | באנר; כתיבה חסומה; טיוטה; התאוששות | P0 | E2E |
| E2E-12 | CUJ12 | מזון לא נמצא → הזנה ידנית | – | חפש מזון שאינו במאגר → "הזנה ידנית" | טופס ידני עם טקסט החיפוש כשם; שמירה מצליחה | P0 | E2E |
| ERR-01..06 | Errors | כל שורה ב-D.5 (למעט שורות AI – נדחו) | Mock | הזרק | התנהגות מחייבת; **אפשרות הזנה ידנית קיימת תמיד** | P0 | C+E2E |
| EXP-01 | Export | JSON/CSV מלאים | משתמש A | יצוא | כולל כל הטבלאות; אין נתוני B; `schema_version` | P1 | E2E+U |
| FAV-01 | Favorites | יצירה/עריכה/מחיקה/שימוש/שכפול/"אכלתי שוב"/מארוחה | – | בצע | העתקה לא קישור; RLS נשמר; תקרה 200 | P1 | E2E+DB |
| PWA-01 | Install | התקנה | HTTPS | Lighthouse+התקנה | Installable; Standalone | P0 | M+CI |
| PWA-02 | Offline | Shell+ניווט+כתיבה | מותקן | נתק | נפתח; ניווט; כתיבה חסומה+טיוטה | P0 | E2E |
| PWA-03 | Update | פריסת v2 | טופס מלוכלך | רענן | Toast; אין רענון אוטומטי; אחרי אישור – v2 ו-Cache ישן נוקה | P0 | E2E |
| PWA-06 | Cache | API ב-Cache | – | בדוק Cache Storage | אין תגובות `*.supabase.co` | P1 | E2E |
| PWA-07 | iOS | OTP ב-Standalone | iPhone | התחבר והשאר מותקן | Session נשמר | P1 | M |
| A11Y-01 | axe | כל מסך × בהיר/כהה × נייד/דסקטופ | – | הרץ axe | 0 חמורות/קריטיות | P0 | E2E |
| A11Y-02 | Keyboard | הוספת ארוחה במקלדת בלבד | – | Tab/Enter/Esc | Focus trap והחזרה; אין מלכודת | P0 | E2E |
| A11Y-03 | Status | לא בצבע בלבד | – | סימולציית עיוורון צבעים | אייקון+טקסט נוכחים | P0 | C+M |
| A11Y-04 | Targets | יעדי מגע | – | מדוד | ≥44×44px | P1 | E2E |
| A11Y-05 | Motion | `prefers-reduced-motion` | – | הפעל | ללא אנימציה | P2 | C |
| RESP-01 | Layout | 320…1280 | – | Snapshot | ללא גלישה; ניווט תחתון/FAB/Sheet תקינים; עברית ארוכה חתוכה כראוי | P0 | V |

### I.7 מאגר מזון (FOOD-*)
| ID | Area | Scenario | Preconditions | Steps | Expected | Pri | Auto |
|---|---|---|---|---|---|---|---|
| FOOD-01 | Compute | חישוב כמות→ערכים: גרם / יחידה×מספר / מנה | רשומת מזון ידועה | `computeEntry` | קלוריות לשלם, מאקרו ספרה אחת; סכום ארוחה = סכום פריטים מעוגלים; גבולות כמות נאכפים | P0 | U |
| FOOD-02 | Search | נרמול עברית: `קוטג'` / `קוטג` / `קוטג׳`, אותיות סופיות, ניקוד, רווחים כפולים | אינדקס | חפש וריאנטים | אותן תוצאות בדיוק | P0 | U |
| FOOD-03 | Search | 38 שאילתות Golden (ביצה, לחם, קוטג', חלב, אורז, חזה עוף…) ב-`tests/food-db.test.ts` | המאגר שנבנה | חפש | המזון הצפוי בין 3 הראשונים; אין חלבה לחלב ואין אורז גולמי ראשון | P0 | U |
| FOOD-04 | Build | שער איכות נתונים | CSV/API רשמי | `build-food-db` + `tests/food-db.test.ts` | ערכים בגבולות (0–900 קק"ל, מאקרו ≤105 ג'), אין כפילויות/רעש צף ביחידות, יחידת ברירת מחדל קיימת, כל מזון ב-popular קיים, פלט דטרמיניסטי וממוין; חריגי Atwater מדווחים | P0 | U |
| FOOD-05 | Snapshot | עדכון מאגר אחרי שמירת ארוחה | ארוחה שמורה | טען `food-db` חדש | ערכי הארוחה השמורה לא משתנים | P1 | U+E2E |
| FOOD-06 | Offline | חיפוש בלי רשת | מאגר ב-Cache | נתק וחפש | חיפוש עובד; שמירה חסומה עם הסבר; כשל טעינה ראשונה ⇒ הזנה ידנית | P1 | E2E |
| FOOD-07 | Perf | חיפוש וגודל | נייד בינוני | מדוד | חיפוש ≤50ms (P95); צ'אנק מאגר ≤400KB gz ולא בחבילה הראשונית | P1 | E2E+CI |
| FOOD-08 | Units | בחירת יחידה | מזון עם יחידות | פתח בורר | רק יחידות הקיימות למזון; ברירת מחדל נכונה | P1 | C |
| FOOD-09 | Attribution | ייחוס מקור | – | פתח "מקורות" | מופיעים משרד הבריאות, תאריך עדכון במקור וקישור | P2 | C |
