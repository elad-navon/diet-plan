# יומן תזונה – PWA למעקב תזונה

אפליקציית מעקב קלוריות ומאקרו בעברית (RTL), עם הערכת AI לארוחות והמלצות בזמן אמת.
**המפרט המחייב נמצא ב-[docs/](docs/README.md)** – יש לקרוא אותו לפני שינוי התנהגות.

## פקודות
| פקודה | תפקיד |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run verify` | כל שערי ה-CI המקומיים: typecheck → lint → format → unit → build |
| `npm test` | בדיקות Vitest (כולל בדיקת חוקי הארכיטקטורה) |
| `npm run e2e` | Playwright מול ה-build (פורט 4391 למצב מקומי, 4392 למצב שרת עם שרת מדומה; לא משתמש בשרת קיים) |
| `npx vitest run tests/db` | בדיקות בסיס הנתונים: Postgres אמיתי בתוך Vitest (PGlite, בלי Docker) |
| `npm run format` | Prettier |
| `npm run build:food-db` | בניית מאגר המזון מנתוני משרד הבריאות (`-- --refresh` להורדה מחדש) |
| `SCREENSHOTS=1 npx playwright test e2e/screens.spec.ts` | צילומי מסך לבדיקה ויזואלית (נשמרים ב-`test-results/screens`) |

## מבנה
```
src/core/      TypeScript טהור – ללא React/DOM/Supabase; זמן רק דרך core/time
src/features/  UI בלבד (לא מייבא Supabase ישירות)
src/data/      Repositories (לא מייבא מ-features): אחסון מקומי במכשיר (local/) או חשבון בשרת (supabase/) מאחורי אותם ממשקים
supabase/      migrations: הסכמה, RLS והפונקציות (ראו docs/SERVER_SETUP.md לחיבור)
tests/db/      בדיקות של ה-SQL הזה על Postgres אמיתי
```
הגבולות והאיסור על `Date` גולמי נאכפים ב-[eslint.config.js](eslint.config.js) ונבדקים ב-[tests/lint-rules.test.ts](tests/lint-rules.test.ts).

## הערות
- **ESLint 9 (לא 10)**: `eslint-plugin-jsx-a11y` (בדיקות נגישות) טרם תומך ב-ESLint 10. לשדרג כשיתמוך.
- סודות לעולם לא ב-`VITE_*` (נכנס ל-Bundle) – ראו [.env.example](.env.example).

## אפליקציית אנדרואיד
עטיפת Capacitor (`capacitor.config.json`, התיקייה `android/`) עם המזהה `com.eladnavon.diet`, שמופצת כ-APK חתום (למשל בוואטסאפ) ולא בחנות.
- **טוענת את האתר החי** (`server.url`), כך שכל פרסום של האתר מגיע לאפליקציה: גרסה חדשה מגיעה כמו באתר, דרך הודעת העדכון (`src/app/pwa.ts`). אחרי הטעינה הראשונה ה-service worker פותח אותה גם בלי רשת.
- **בתוך ה-APK** יש רק דף שגיאה קטן (`android-shell/index.html`, `server.errorPath`), שמוצג רק כשהאתר לא נגיש ואין עותק שמור.
- **ההתחברות** היא אותו קוד במייל; ההתחברות של האפליקציה נפרדת מזו של הדפדפן, ונשמרת בה.
- **הטקסט** מוצג ב-100% (`MainActivity.java`) גם כשגודל הגופן בטלפון גדול יותר.
- **האייקונים** של האתר ושל האפליקציה נוצרים כולם מ-`scripts/make-icons.mjs` (`npm run icons`).

### בנייה
| פקודה | תפקיד |
|---|---|
| `npm run android:release` | `verify`, `cap sync`, בנייה חתומה, בדיקת חתימה/מזהה/גרסה, והעתקה ל-`release/yoman-tzuna.apk` (לא נכנס לגיט) |
| `npm run android:debug` | בניית ניסיון מהירה, בלי חתימת שחרור ובלי לצרוך מספר גרסה |

דורש Java 21 ו-Android SDK עם `build-tools;36.0.0` (`JAVA_HOME` / `ANDROID_HOME`, או מיקומי ברירת המחדל), ומחוץ למאגר, ב-`C:\Elad\keys\`:
- `diet-release.jks` – מפתח החתימה. כל עדכון חייב להיות חתום בו.
- `diet-keystore.properties` – ההגדרות והסיסמה (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).
- `diet-version.json` – מונה הגרסאות (`lastVersionCode`); כל בנייה מוצלחת מעלה אותו באחד, כך שכל APK מתקין את עצמו מעל הקודם.

**לגבות את שלושתם יחד** במקום פרטי; בלי המפתח והסיסמה אי אפשר לעדכן את האפליקציה המותקנת.

### התקנה ועדכון בטלפון
שולחים את ה-APK לעצמך כ"מסמך", פותחים, ומאשרים התקנה ממקור זה. עדכון: מתקינים APK חדש מעל הקודם (אותו מפתח, מספר גרסה גבוה יותר) – הנתונים וההתחברות נשמרים. עם כבל: `adb install -r release/yoman-tzuna.apk`.

**APK חדש צריך רק** לשינויים ב-`android/`, ב-`android-shell/`, ב-`capacitor.config.json` או באייקון של האפליקציה במסך הבית. כל שאר הקוד מגיע בפרסום רגיל של האתר.
