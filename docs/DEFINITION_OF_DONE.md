# DEFINITION_OF_DONE – הגדרת 'גמור'

> **סטטוס:** טיוטה לסקירה (v0.1) · **תאריך:** 2026-10-01 · **נגזר מ:** התוכנית המאושרת, חלק J.2
> **מזהי סעיפים:** האותיות A–J הן מרחב שמות גלובלי בין המסמכים (ראו [README](README.md)).
> **קשור:** [TEST_PLAN](TEST_PLAN.md) (§H.6 שערי רגרסיה) · [SECURITY_PLAN](SECURITY_PLAN.md) · [PRODUCT_SPEC](PRODUCT_SPEC.md)

**מטרת המסמך:** קריטריונים שחייבים להתקיים לכל Feature לפני Merge. Feature אינו Complete על סמך Happy-path בלבד. שערי ה-CI המחייבים מוגדרים ב-TEST_PLAN §H.6.

---


## J.2 Definition of Done
Feature **אינו Complete** על סמך Happy-path בלבד. כולם נדרשים (חוסמים Merge):
| קטגוריה | קריטריון |
|---|---|
| Functional | עומד בקריטריוני הקבלה ב-PRODUCT_SPEC, כולל מקרי קצה שצוינו |
| Unit | כל לוגיקה ב-`core/` מכוסה (כולל Property היכן שרלוונטי); אין `Date.now()` |
| Integration | DB/RLS/RPC/Edge שנוגעים בפיצ'ר נבדקים (pgTAP/Deno) |
| Error states | כל קוד שגיאה רלוונטי מטופל לפי D.5; **הזנה ידנית נשארת זמינה** |
| Loading states | Skeleton/Disabled ל-Pending; מניעת שליחה כפולה |
| Empty states | מצב ריק ברור עם קריאה לפעולה |
| Security | RLS נבדק; קלט מסונן/מוגבל; אין סודות; XSS נבדק בשדות החדשים |
| Accessibility | axe 0 חמורות; מקלדת; קורא מסך; לא צבע בלבד; מגע ≥44px; Reduced-motion |
| Responsive | נבדק ב-320/360/390/430/768/1024/1280 |
| RTL | כיוון, Bidi למספרים/שעות, אייקונים מראה היכן שנדרש |
| Regression | נוספה בדיקה שהייתה נכשלת בלי הפיצ'ר; שערי H.6 ירוקים; תיעוד עודכן |
