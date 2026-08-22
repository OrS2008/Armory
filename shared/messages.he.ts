/**
 * Hebrew message catalogue for domain output produced on the server
 * (conflicts, API errors). UI copy lives in src/i18n; nothing in this project
 * hardcodes Hebrew inside a component or a handler.
 */
import { ErrorCodes } from './errors';
import type { AvailabilityKind, Role, Severity } from './types';

type Params = Record<string, string | number>;

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export const errorMessages: Record<string, string> = {
  [ErrorCodes.AUTH_REQUIRED]: 'נדרשת התחברות למערכת.',
  [ErrorCodes.SESSION_EXPIRED]: 'החיבור פג. יש להתחבר מחדש.',
  [ErrorCodes.INVALID_CREDENTIALS]: 'שם המשתמש או הסיסמה שגויים.',
  [ErrorCodes.RATE_LIMITED]: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.',
  [ErrorCodes.FORBIDDEN]: 'אין לך הרשאה לבצע פעולה זו.',
  [ErrorCodes.OUT_OF_SCOPE]: 'הפעולה חורגת מתחום האחריות שהוגדר לך.',
  [ErrorCodes.NOT_FOUND]: 'הפריט המבוקש לא נמצא.',
  [ErrorCodes.VALIDATION_FAILED]: 'הנתונים שהוזנו אינם תקינים.',
  [ErrorCodes.INVALID_JSON]: 'תוכן הבקשה אינו תקין.',
  [ErrorCodes.JSON_REQUIRED]: 'נדרש תוכן מסוג JSON.',
  [ErrorCodes.CONFLICT]: 'הפעולה מתנגשת עם נתון קיים במערכת.',
  [ErrorCodes.EMAIL_TAKEN]: 'שם המשתמש הזה כבר תפוס.',
  [ErrorCodes.LAST_ADMIN]:
    'זהו מנהל המערכת הפעיל האחרון. מנו מנהל נוסף לפני שמורידים לו הרשאה או מבטלים אותו.',
  [ErrorCodes.SELF_LOCKOUT]: 'אי אפשר לשנות לעצמך את ההרשאה או לבטל את המשתמש שלך.',
  [ErrorCodes.WRONG_PASSWORD]: 'הסיסמה הנוכחית שגויה.',
  [ErrorCodes.MFA_REQUIRED]: 'נדרש קוד אימות דו־שלבי.',
  [ErrorCodes.MFA_INVALID]: 'הקוד שגוי או שפג תוקפו. נסו קוד חדש מהאפליקציה.',
  [ErrorCodes.MFA_NOT_SET_UP]: 'האימות הדו־שלבי לא הוגדר עדיין.',
  [ErrorCodes.SCHEDULING_CONFLICT]: 'קיימת התנגשות שיבוץ החוסמת את הפעולה.',
  [ErrorCodes.ALREADY_ASSIGNED]: 'האדם כבר משובץ למשימה זו.',
  [ErrorCodes.ROLE_TAKEN]: 'התפקיד הזה כבר תפוס במשימה. שבצו כלוחם, או פנו קודם את התפקיד.',
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
  QUALIFICATION_MISSING_ROLE:
    'במשימה {assignment} חסר {qualification} — נדרשים {required}, משובצים {actual}.',
  MIN_REST: '{person} מקבל {actual} שעות מנוחה בלבד לפני המשימה, במקום {required} שעות.',
  MAX_CONTINUOUS: 'משך השיבוץ הרצוף של {person} הוא {actual} שעות, מעל המותר ({required} שעות).',
  MAX_ASSIGNMENTS_PER_DAY: 'ל{person} {actual} שיבוצים בתאריך {date}, מעל המותר ({required}).',
  MAX_HOURS_IN_WINDOW:
    'ל{person} {actual} שעות שיבוץ ב־{days} הימים האחרונים, מעל המותר ({required}).',
  UNDERSTAFFED: 'המשימה {assignment} מאוישת ב־{actual} מתוך {required} אנשים.',
  OVERSTAFFED: 'המשימה {assignment} מאוישת ב־{actual} אנשים במקום {required}.',
  DUPLICATE_ASSIGNMENT:
    'המשימה {assignment} מופיעה פעמיים באותן שעות ({from}–{to}). ככל הנראה נוצרה כפילות.',
  UNPUBLISHED_CHANGES: 'במשימה {assignment} קיימים שינויים שטרם פורסמו.',
  EXCLUSIVE_QUALIFICATION:
    '{person} מוגדר {qualification} ומשובץ אך ורק למשימות {qualification}. {assignment} אינה כזו.',
  ROLE_QUALIFICATION: '{person} משובץ בתפקיד {qualification} אך אינו מחזיק בהכשיר הזה.',
  ROLE_TAKEN: 'תפקיד {qualification} כבר תפוס במשימה {assignment} — {other} ממלא אותו.',
  PRE_DEPARTURE_REST:
    '{person} יוצא ב־{from}. המשימה מסתיימת {actual} שעות לפני היציאה בלבד, במקום {required}.',
  EXCLUDED_QUALIFICATION:
    '{person} מסומן {qualification}, ולמשימת {assignment} לא משבצים מי שמסומן כך.',
  NOT_SCHEDULABLE: '{person} מסומן {qualification} ואינו משובץ למשימות.',
};

/** How to resolve it, per conflict code. */
export const conflictResolutions: Record<string, string> = {
  NO_OVERLAP: 'הסירו את השיבוץ הכפול או שנו את שעות אחת המשימות.',
  AVAILABILITY_REQUIRED: 'בחרו אדם זמין או עדכנו את רישום הזמינות.',
  QUALIFICATION_REQUIRED: 'בחרו אדם בעל הכשיר הנדרש או עדכנו את דרישות סוג המשימה.',
  QUALIFICATION_MISSING_ROLE: 'שבצו למשימה אדם בעל הכשיר {qualification}.',
  MIN_REST: 'הרחיקו את המשימות זו מזו או שבצו אדם אחר.',
  MAX_CONTINUOUS: 'קצרו את המשימה או פצלו אותה בין שני אנשים.',
  MAX_ASSIGNMENTS_PER_DAY: 'פזרו את השיבוצים על פני מספר ימים.',
  MAX_HOURS_IN_WINDOW: 'שבצו אדם עם עומס נמוך יותר בתקופה זו.',
  UNDERSTAFFED: 'הוסיפו אנשים למשימה או הקטינו את דרישת האיוש.',
  OVERSTAFFED: 'הסירו שיבוץ עודף או עדכנו את דרישת האיוש.',
  DUPLICATE_ASSIGNMENT: 'בטלו את אחד העותקים — ביטול משימה מתועד ואינו מוחק את השני.',
  UNPUBLISHED_CHANGES: 'פרסמו את השבצ״ק כדי שהשינויים יגיעו למשובצים.',
  EXCLUSIVE_QUALIFICATION: 'שבצו אותו למשימת {qualification}, או הסירו ממנו את ההכשיר הייעודי.',
  ROLE_QUALIFICATION: 'בחרו אדם המחזיק בהכשיר, או שבצו אותו כלוחם.',
  ROLE_TAKEN: 'הסירו קודם את {other} מהתפקיד, או שבצו את האדם כלוחם.',
  PRE_DEPARTURE_REST: 'הקדימו את המשימה, או שבצו אדם שאינו יוצא בסמוך לה.',
  EXCLUDED_QUALIFICATION:
    'בחרו אדם אחר, או הסירו את {qualification} מרשימת הפסילות של סוג המשימה בהגדרות ← סוגי משימות.',
  NOT_SCHEDULABLE: 'אם יש לשבצו בכל זאת, הסירו ממנו את הסימון {qualification} במסך כוח האדם.',
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

/** The seat a person fills in a crew when no qualification names it. */
/**
 * The audit trail stores machine codes; a duty officer reading it should not
 * have to know that PERSONNEL_ASSIGNED is a person being put on a shift.
 */
export const auditActionLabels: Record<string, string> = {
  LOGIN: 'התחברות',
  LOGIN_FAILED: 'ניסיון התחברות שנכשל',
  LOGOUT: 'התנתקות',
  PERSONNEL_CREATED: 'הוספת איש כוח אדם',
  PERSONNEL_UPDATED: 'עדכון פרטי איש כוח אדם',
  PERSONNEL_ARCHIVED: 'העברת איש כוח אדם לארכיון',
  UNIT_CREATED: 'יצירת מסגרת',
  UNIT_UPDATED: 'עדכון מסגרת',
  QUALIFICATION_CREATED: 'יצירת הכשיר',
  QUALIFICATION_UPDATED: 'עדכון הכשיר',
  AVAILABILITY_CREATED: 'רישום זמינות',
  AVAILABILITY_UPDATED: 'עדכון זמינות',
  AVAILABILITY_DECIDED: 'החלטה בבקשת זמינות',
  ASSIGNMENT_TYPE_CREATED: 'יצירת סוג משימה',
  ASSIGNMENT_TYPE_UPDATED: 'עדכון סוג משימה',
  ASSIGNMENT_CREATED: 'יצירת משימה',
  ASSIGNMENT_UPDATED: 'עדכון משימה',
  ASSIGNMENT_CANCELLED: 'ביטול משימה',
  ASSIGNMENT_DELETED: 'מחיקת משימה',
  PERSONNEL_ASSIGNED: 'שיבוץ למשימה',
  PERSONNEL_UNASSIGNED: 'הסרה משיבוץ',
  ASSIGNMENT_OVERRIDE: 'עקיפת כלל שיבוץ',
  ASSIGNMENT_ACKNOWLEDGED: 'אישור קבלת משימה',
  SCHEDULE_CREATED: 'יצירת שבצ״ק',
  SCHEDULE_PUBLISHED: 'פרסום שבצ״ק',
  RULE_UPDATED: 'עדכון כלל שיבוץ',
  REPLACEMENT_REQUESTED: 'בקשת החלפה',
  REPLACEMENT_DECIDED: 'החלטה בבקשת החלפה',
  USER_CREATED: 'יצירת משתמש',
  USER_UPDATED: 'עדכון משתמש',
};

export const auditEntityLabels: Record<string, string> = {
  user: 'משתמש',
  personnel: 'איש כוח אדם',
  unit: 'מסגרת',
  qualification: 'הכשיר',
  availability: 'זמינות',
  assignment: 'משימה',
  assignment_type: 'סוג משימה',
  schedule: 'שבצ״ק',
  scheduling_rule: 'כלל שיבוץ',
  replacement: 'בקשת החלפה',
};

export function auditActionLabel(action: string): string {
  return auditActionLabels[action] ?? action;
}

export function auditEntityLabel(entityType: string): string {
  return auditEntityLabels[entityType] ?? entityType;
}

/** Account roles, and what each one may actually do. */
export const roleLabels: Record<Role, string> = {
  system_admin: 'מנהל מערכת',
  company_commander: 'מפקד פלוגה',
  unit_scheduler: 'משבץ',
  soldier: 'חייל',
  viewer: 'צופה',
};

export const roleDescriptions: Record<Role, string> = {
  system_admin: 'הכול, כולל ניהול משתמשים והגדרות המערכת.',
  company_commander: 'יצירת משימות, שיבוץ, פרסום שבצ״ק, שינוי כללים וצפייה ביומן הפעולות.',
  unit_scheduler: 'יצירת משימות ושיבוץ אנשים — בלי פרסום ובלי שינוי כללים.',
  soldier: 'רואה את השבצ״ק שלו, מאשר קבלת משימה ומבקש החלפה.',
  viewer: 'צפייה בלבד, בלי לשנות דבר.',
};

export const DEFAULT_CREW_ROLE = 'לוחם';

/**
 * What each rule actually does, in the words a duty officer would use. The
 * settings screen used to print the rule's machine code under its name, which
 * told the reader nothing they could not already see.
 */
export const ruleDescriptions: Record<string, string> = {
  NO_OVERLAP: 'אדם לא יכול להיות בשתי משימות שחופפות בזמן.',
  AVAILABILITY_REQUIRED: 'מי שרשום כלא זמין — חופשה, גימלים, קורס — לא ישובץ בשעות האלה.',
  QUALIFICATION_REQUIRED: 'משימה שדורשת הכשיר תאויש רק במי שמחזיק בו.',
  MIN_REST: 'כמה זמן מנוחה חייב לעבור בין סוף משימה לתחילת הבאה.',
  MAX_CONTINUOUS: 'אורך הרצף המרבי של משמרות צמודות לאותו אדם, גם אם הן משימות שונות.',
  MAX_ASSIGNMENTS_PER_DAY: 'כמה משימות אפשר להטיל על אדם אחד באותו יום.',
  MAX_HOURS_IN_WINDOW: 'תקרת שעות מצטברת לאדם בתוך חלון של כמה ימים.',
  UNDERSTAFFED: 'התרעה על משימה שחסרים בה אנשים להשלמת התקן.',
  OVERSTAFFED: 'התרעה על משימה שמשובצים בה יותר אנשים מהנדרש.',
  EXCLUSIVE_QUALIFICATION:
    'מי שמוגדר בהכשיר ייעודי (חמ״ל) יעשה רק את המשימות שלו, ורק הוא יעשה אותן.',
  ROLE_QUALIFICATION: 'מי שמשובץ כנהג או כמפקד חייב להחזיק בהכשיר של אותו תפקיד.',
  ROLE_TAKEN: 'בכל משימה יש מקום אחד לנהג ומקום אחד למפקד.',
  PRE_DEPARTURE_REST: 'כמה שעות לפני יציאה הביתה כבר לא משבצים את החייל.',
  DUPLICATE_ASSIGNMENT: 'התרעה על שתי משימות זהות באותו מקום ובאותן שעות.',
  UNPUBLISHED_CHANGES: 'התרעה על שינויים שנעשו אחרי הפרסום וטרם פורסמו מחדש.',
  EXCLUDED_QUALIFICATION:
    'סוג משימה יכול לפסול סימונים: למשימת סיור לא משבצים מי שמסומן מבצעים, ולש״ג לא משבצים מפקד.',
  NOT_SCHEDULABLE: 'מי שמסומן מפלג אינו נכנס לסבב המשימות כלל.',
};

export const severityLabels: Record<Severity, string> = {
  info: 'מידע',
  warning: 'אזהרה',
  blocking: 'חוסם',
};

/** Form and payload validation messages, shared by the API and the UI forms. */
export const validationMessages = {
  passwordMismatch: 'הסיסמאות אינן זהות.',
  mfaCode: 'יש להזין קוד בן שש ספרות.',
  passwordUnchanged: 'הסיסמה החדשה זהה לנוכחית.',
  required: 'שדה חובה',
  identifier: 'שם משתמש או דוא״ל אינם תקינים',
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
  rangeTooLong: 'הטווח ארוך מדי — אפשר לפרוס עד 180 ימים בפעולה אחת',
  shiftHours: 'אורך משמרת חייב להתחלק ב־24 שעות ללא שארית',
} as const;
