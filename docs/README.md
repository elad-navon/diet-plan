# docs – מפרט אפליקציית הדיאטה (PWA)

> **סטטוס:** שלב Spec בלבד – **לא נכתב קוד.** כל המסמכים בגרסת טיוטה v0.1 (2026-10-01) וממתינים לסקירה ואישור.
> המסמכים נגזרו מהתוכנית המאושרת (Review הנדסי מלא). לאחר האישור נתחיל בשלב 1 לפי [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md).

## שינוי היקף – 2026-10-01 (החלטת המשתמש)
**v1 ללא AI וללא חשבון בתשלום.** הזנת אוכל = חיפוש ב[מאגר התזונה הלאומי](https://data.gov.il/dataset/nutrition-database) (משרד הבריאות, חינמי) + הזנה ידנית + מועדפים. כל מה שקשור להערכת AI (חוזה, מכסות, Eval, Edge Function) **נדחה** ונשאר כתכנון עתידי. אפשרות עתידית נוספת: "העתק והדבק" ל-Claude הרגיל (בלי חשבון API).

| מסמך | מה השתנה |
|---|---|
| PRODUCT_SPEC | B5, D-03..05 נדחו, D-21..24 חדשים, סעיף C.3 (הזנה ממאגר מזון), מסעות CUJ 2/3/12 |
| AI_CONTRACT | **כולו נדחה** |
| ARCHITECTURE | D.4 נדחה; D.9 חדש (מאגר מזון + `MealEstimator`); רק `delete-account` נשאר כ-Edge Function |
| DATA_MODEL | טבלאות AI נדחו; `meals.source` ו-`items` מעודכנים; E.6 חדש |
| TEST_PLAN | AIQ/AIC/AIA/EVAL נדחו; FOOD-* חדשים; E2E-02/03/12 עודכנו |
| SECURITY_PLAN | חלקי ה-AI נדחו (אין צד שלישי ב-v1) |
| IMPLEMENTATION_PLAN | שלב 4 הוחלף במאגר מזון; דרישות מקדימות עודכנו |

## המסמכים
| מסמך | תוכן | סעיפי מקור |
|---|---|---|
| [PRODUCT_SPEC](PRODUCT_SPEC.md) | החלטות מחייבות, הזנה ידנית, עריכה/מחיקה/Undo, מועדפים, יצוא, Offline ב-v1, מסעות קריטיים, מחוץ ל-v1 | B, C, C.2, J.4 |
| [ARCHITECTURE](ARCHITECTURE.md) | שכבות, מודול זמן, צינור Edge Function, מטריצת שגיאות, PWA, Offline עתידי | D |
| [DATA_MODEL](DATA_MODEL.md) | טבלאות, Triggers/RPC, Snapshot יעדים, מטריצת RLS, מדדי AI | E |
| [NUTRITION_RULES](NUTRITION_RULES.md) | נוסחאות, פותר מאקרו, מצבי בטיחות, מנוע המלצות, וקטורי בדיקה | F |
| [AI_CONTRACT](AI_CONTRACT.md) | **נדחה (לא ב-v1)** – חוזה הערכת AI, Eval, Audit | G |
| [TEST_PLAN](TEST_PLAN.md) | פירמידה, נתוני בדיקה, נגישות/Responsive, PWA, שערי CI, מטריצת בדיקות קריטית | H.1, H.2, H.4–H.6, I |
| [SECURITY_PLAN](SECURITY_PLAN.md) | בדיקות אבטחה ופרטיות + נספחים רלוונטיים | H.3 (+D.4, D.8, E.4, G.5, A6) |
| [DEFINITION_OF_DONE](DEFINITION_OF_DONE.md) | קריטריוני "גמור" לכל Feature | J.2 |
| [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) | שלבי מימוש 0–10 עם שערי יציאה | J.1, J.3 |
| [REVIEW_FINDINGS](REVIEW_FINDINGS.md) | 51 הבעיות שנמצאו בתוכנית המקורית (P-01…P-51) | A |

> המסמכים 9–10 (IMPLEMENTATION_PLAN, REVIEW_FINDINGS) נוספו לשמונת המסמכים המבוקשים, כדי שתוכנית המימוש ומזהי הבעיות (P-xx) יהיו ניתנים לאיתור.

## מרחב מזהים גלובלי
סעיפים מסומנים באותיות **A–J** (למשל `F.4`, `D.5`, `E.4`) – המזהה ייחודי בכל המסמכים, והמסמך שבו הוא נמצא מופיע בטבלה למעלה.
| קידומת | משמעות | | קידומת | משמעות |
|---|---|---|---|---|
| `P-xx` | בעיה שנמצאה (REVIEW_FINDINGS) | | `D-xx` | החלטה מומלצת (PRODUCT_SPEC §C) |
| `B1–B4` | החלטות שאושרו ע"י המשתמש | | `V1–V7`, `R1–R7` | וקטורי בדיקה (NUTRITION_RULES) |
| `NUT-`, `TIME-`, `REC-`, `CHART-` | בדיקות ליבה/גרף | | `RLS-`, `DB-`, `INT-` | בדיקות מסד נתונים ושלמות |
| `AIQ-`, `AIC-`, `AIA-`, `EVAL-` | בדיקות AI | | `SEC-`, `ERR-`, `EXP-`, `FAV-` | אבטחה, שגיאות, יצוא, מועדפים |
| `PWA-`, `A11Y-`, `RESP-`, `E2E-` | PWA, נגישות, Responsive, מסעות | | | |

## החלטות שאושרו (B)
Email OTP · יעדי ירידה + שמירה בלבד ב-v1 · גבול יום בחצות 00:00 · Git + GitHub Actions · **ללא AI בתשלום (B5)**.

## מה חשוב לבדוק בסקירה
1. **קבועים ורצפות** – NUTRITION_RULES §F.1 (רצפות 1200/1350/1500, גירעון ≤30%, פרוטאין, סף פחמימות).
2. **כללי הזמן** – ARCHITECTURE §D.2 (חצות, DST, נסיעות, שעון מכשיר).
3. **Snapshot יעדים** – DATA_MODEL §E.2 (שינוי מתחיל מהיום, עבר לא משתנה).
4. **רשימת שאילתות החיפוש (Golden)** – תיווצר בשלב 4 (FOOD-03); נבקש ממך לסקור אותה לפני הקפאה.
5. **מטריצת RLS** – DATA_MODEL §E.4 (כתיבה ישירה לפרופיל/תוכניות/ארוחות חסומה; רק דרך RPC).
6. **דרישות מקדימות** – IMPLEMENTATION_PLAN: פרויקט Supabase (חינמי), אירוח חינמי, חשבון GitHub (אופציונלי). **לא נדרש:** חשבון/מפתח Anthropic או כרטיס אשראי.
