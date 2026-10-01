# יומן תזונה – PWA למעקב תזונה

אפליקציית מעקב קלוריות ומאקרו בעברית (RTL), עם הערכת AI לארוחות והמלצות בזמן אמת.
**המפרט המחייב נמצא ב-[docs/](docs/README.md)** – יש לקרוא אותו לפני שינוי התנהגות.

## פקודות
| פקודה | תפקיד |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run verify` | כל שערי ה-CI המקומיים: typecheck → lint → format → unit → build |
| `npm test` | בדיקות Vitest (כולל בדיקת חוקי הארכיטקטורה) |
| `npm run e2e` | Playwright מול ה-build (פורט 4391, לא משתמש בשרת קיים) |
| `npm run format` | Prettier |

## מבנה
```
src/core/      TypeScript טהור – ללא React/DOM/Supabase; זמן רק דרך core/time
src/data/      Repositories + Supabase (לא מייבא מ-features)
src/features/  UI בלבד (לא מייבא Supabase ישירות)
```
הגבולות והאיסור על `Date` גולמי נאכפים ב-[eslint.config.js](eslint.config.js) ונבדקים ב-[tests/lint-rules.test.ts](tests/lint-rules.test.ts).

## הערות
- **ESLint 9 (לא 10)**: `eslint-plugin-jsx-a11y` (בדיקות נגישות) טרם תומך ב-ESLint 10. לשדרג כשיתמוך.
- סודות לעולם לא ב-`VITE_*` (נכנס ל-Bundle) – ראו [.env.example](.env.example).
