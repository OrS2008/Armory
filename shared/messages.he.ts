/**
 * Hebrew message catalogue for domain output produced on the server
 * (conflicts, API errors). UI copy lives in src/i18n; nothing in this project
 * hardcodes Hebrew inside a component or a handler.
 */
import { ErrorCodes } from './errors';
import type { AvailabilityKind, Severity } from './types';

type Params = Record<string, string | number>;

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export const errorMessages: Record<string, string> = {
  [ErrorCodes.AUTH_REQUIRED]: 'נדרשת התחברות למערכת.',
  [ErrorCodes.SESSION_EXPIRED]: 'החיבור פג. יש להתחבר מחדש.',
  [ErrorCodes.INVALID_CREDENTIALS]: 'כתובת הדוא״ל או הסיסמה שגויים.',
  [ErrorCodes.RATE_LIMITED]: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.',
  [ErrorCodes.FORBIDDEN]: 'אין לך הרשאה לבצע פעולה זו.',
  [ErrorCodes.OUT_OF_SCOPE]: 'הפעולה חורגת מתחום האחריות שהוגדר לך.',
  [ErrorCodes.NOT_FOUND]: 'הפריט המבוקש לא נמצא.',
  [ErrorCodes.VALIDATION_FAILED]: 'הנתונים שהוזנו אינם תקינים.',
  [ErrorCodes.INVALID_JSON]: 'תוכן הבקשה אינו תקין.',
  [ErrorCodes.JSON_REQUIRED]: 'נדרש תוכן מסוג JSON.',
  [ErrorCodes.CONFLICT]: 'הפעולה מתנגשת עם נתון קיים במערכת.',
  [ErrorCodes.SCHEDULING_CONFLICT]: 'קיימת התנגשות שיבוץ החוסמת את הפעולה.',
  [ErrorCodes.ALREADY_ASSIGNED]: 'האדם כבר משובץ למשימה זו.',
  [ErrorCodes.SCHEDULE_NOT_PUBLISHABLE]: 'לא ניתן לפרסם את השבצ״ק כל עוד קיימות התנגשויות חוסמות.',
  [ErrorCodes.OVERRIDE_NOT_ALLOWED]: 'הכלל הזה אינו ניתן לעקיפה.',
  [ErrorCodes.NOT_CONFIGURED]: 'המערכת טרם הוגדרה. פנו למנהל המערכת.',
  [ErrorCodes.SCHEMA_NOT_READY]: 'מסד הנתונים טרם אותחל — יש להריץ את מיגרציות מסד הנתונים.',
  [ErrorCodes.INTERNAL]: 'אירעה שגיאה בלתי צפויה. נסו שוב.',
};

export function errorMessage(code: string): string {
  return errorMessages[code] ?? errorMessages[ErrorCodes.INTERNAL]!;
}

/**
 * For responses that never reached the application — a platform error page, a
 * dropped connection. Carrying the status code turns an opaque "something went
 * wrong" into something an operator can act on.
 */
export function transportErrorMessage(status: number): string {
  if (status === 0) return 'אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.';
  return fill('השרת החזיר תשובה בלתי צפויה (שגיאה {status}). נסו שוב.', { status });
}

/** What happened, per conflict code. */
export const conflictMessages: Record<string, string> = {
  NO_OVERLAP: 'לא ניתן לשבץ את {person} למשימה זו — קיימת חפיפה עם {other} בין {from}–{to}.',
  AVAILABILITY_REQUIRED: '{person} אינו זמין בזמן המשימה — {reason} בין {from}–{to}.',
  QUALIFICATION_REQUIRED: 'ל{person} חסר הכשיר הנדרש למשימה: {qualifications}.',
  MIN_REST: '{person} מקבל {actual} שעות מנוחה בלבד לפני המשימה, במקום {required} שעות.',
  MAX_CONTINUOUS: 'משך השיבוץ הרצוף של {person} הוא {actual} שעות, מעל המותר ({required} שעות).',
  MAX_ASSIGNMENTS_PER_DAY: 'ל{person} {actual} שיבוצים בתאריך {date}, מעל המותר ({required}).',
  MAX_HOURS_IN_WINDOW:
    'ל{person} {actual} שעות שיבוץ ב־{days} הימים האחרונים, מעל המותר ({required}).',
  UNDERSTAFFED: 'המשימה {assignment} מאוישת ב־{actual} מתוך {required} אנשים.',
  OVERSTAFFED: 'המשימה {assignment} מאוישת ב־{actual} אנשים במקום {required}.',
  UNPUBLISHED_CHANGES: 'במשימה {assignment} קיימים שינויים שטרם פורסמו.',
};

/** How to resolve it, per conflict code. */
export const conflictResolutions: Record<string, string> = {
  NO_OVERLAP: 'הסירו את השיבוץ הכפול או שנו את שעות אחת המשימות.',
  AVAILABILITY_REQUIRED: 'בחרו אדם זמין או עדכנו את רישום הזמינות.',
  QUALIFICATION_REQUIRED: 'בחרו אדם בעל הכשיר הנדרש או עדכנו את דרישות סוג המשימה.',
  MIN_REST: 'הרחיקו את המשימות זו מזו או שבצו אדם אחר.',
  MAX_CONTINUOUS: 'קצרו את המשימה או פצלו אותה בין שני אנשים.',
  MAX_ASSIGNMENTS_PER_DAY: 'פזרו את השיבוצים על פני מספר ימים.',
  MAX_HOURS_IN_WINDOW: 'שבצו אדם עם עומס נמוך יותר בתקופה זו.',
  UNDERSTAFFED: 'הוסיפו אנשים למשימה או הקטינו את דרישת האיוש.',
  OVERSTAFFED: 'הסירו שיבוץ עודף או עדכנו את דרישת האיוש.',
  UNPUBLISHED_CHANGES: 'פרסמו את השבצ״ק כדי שהשינויים יגיעו למשובצים.',
};

export function conflictMessage(code: string, params: Params): string {
  return fill(conflictMessages[code] ?? 'נמצאה התנגשות בשיבוץ.', params);
}

export function conflictResolution(code: string, params: Params): string {
  return fill(conflictResolutions[code] ?? 'בדקו את פרטי השיבוץ.', params);
}

export const availabilityKindLabels: Record<AvailabilityKind, string> = {
  available: 'זמין',
  leave: 'חופשה',
  training: 'הכשרה',
  medical: 'גימלים',
  home: 'בבית',
  other: 'היעדרות מאושרת',
};

export const severityLabels: Record<Severity, string> = {
  info: 'מידע',
  warning: 'אזהרה',
  blocking: 'חוסם',
};

/** Form and payload validation messages, shared by the API and the UI forms. */
export const validationMessages = {
  required: 'שדה חובה',
  email: 'כתובת דוא״ל אינה תקינה',
  passwordTooShort: 'הסיסמה חייבת להכיל לפחות 12 תווים',
  nameTooShort: 'יש להזין שם באורך שני תווים לפחות',
  positiveNumber: 'יש להזין מספר גדול מאפס',
  nonNegative: 'יש להזין מספר שאינו שלילי',
  endBeforeStart: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
  invalidDate: 'תאריך אינו תקין',
  invalidTime: 'שעה אינה תקינה',
  tooLong: 'הטקסט ארוך מדי',
  phone: 'מספר טלפון אינו תקין',
} as const;
