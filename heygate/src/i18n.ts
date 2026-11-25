/**
 * Hebrew / English. The language is chosen per browser (cookie `hg_lang`),
 * falling back to the browser's Accept-Language. Pages are rendered in that
 * language and direction on the server; server messages travel as codes and
 * are translated on the way out; log entries are stored as codes and shown in
 * the viewer's language; notifications use the account's language.
 */
export type Lang = 'he' | 'en';
export const LANGS: Lang[] = ['he', 'en'];

export function pickLang(req: Request): Lang {
  const c = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)hg_lang=(he|en)(?:;|$)/);
  if (c) return c[1] as Lang;
  return /\bhe\b|\biw\b/i.test(req.headers.get('accept-language') ?? '') ? 'he' : 'en';
}

export const dirOf = (l: Lang) => (l === 'he' ? 'rtl' : 'ltr');

const fill = (s: string, args: string[]) => s.replace(/\{(\d)\}/g, (_, i: string) => args[Number(i)] ?? '');

// ------------------------------------------------------------ server messages (JSON "message")

const MSG: Record<Lang, Record<string, string>> = {
  he: {
    too_many: 'יותר מדי ניסיונות',
    signup_closed: 'ההרשמה סגורה כרגע',
    signup_cap: 'הגענו למכסת ההרשמות היומית. נסה שוב מחר',
    username_taken: 'שם המשתמש תפוס. בחר שם אחר',
    bad_username: 'שם משתמש: 3–32 תווים, אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון',
    weak_password: 'סיסמה חלשה: לפחות 10 תווים, ולא זהה לשם המשתמש',
    bad_credentials: 'שם משתמש או סיסמה שגויים',
    account_locked: 'יותר מדי ניסיונות לחשבון הזה. נסה שוב בעוד 15 דקות',
    wrong_password: 'הסיסמה הנוכחית שגויה',
    passkey_exists: 'ה-Passkey הזה כבר רשום',
    passkey_create_failed: 'יצירת ה-Passkey נכשלה. נסה שוב',
    passkey_add_failed: 'הוספת ה-Passkey נכשלה',
    max_passkeys: 'אפשר עד 10 Passkeys',
    last_passkey: 'אי אפשר למחוק את דרך הכניסה האחרונה. הגדר סיסמה או הוסף Passkey אחר קודם',
    login_failed: 'ההתחברות נכשלה',
    bad_recovery: 'קוד שחזור שגוי',
    bad_setup_code: 'קוד התקנה שגוי',
    link_failed: 'החיבור ל-PalGate נכשל (ref {0})',
    gates_failed: 'לא הצלחתי לטעון שערים מ-PalGate (ref {0})',
    bad_notify: 'כתובת התראות לא תקינה (https://ntfy.sh/...)',
    too_many_access: 'יותר מדי גישות',
    bad_code: 'קוד לא תקין',
    code_not_found: 'קוד לא נמצא או שפג תוקפו',
    not_found: 'לא נמצא',
    confirm_required: 'נדרש אישור',
    internal: 'שגיאה פנימית (ref {0})',
    unauthorized: 'נדרשת התחברות',
    forbidden: 'הבקשה נחסמה',
    // opening
    switched_off: 'כל הפתיחות מושבתות (מתג חירום)',
    access_disabled: 'הגישה הזו מושבתת',
    location_denied: 'פתיחה מהמיקום הזה אסורה',
    not_armed: 'Grok לא דרוך. דרוך אותו מהטלפון קודם',
    not_setup: 'החשבון עוד לא מחובר ל-PalGate',
    no_gate: 'לא הוגדר שער',
    hourly: 'הגעת למגבלת הפתיחות לשעה',
    gate_error: 'תקלה בשירות השער (ref {0})',
    not_paired: 'המכשיר הזה לא מצומד',
    use_post: 'הקישור הזה עובד רק מאוטומציה (POST)',
    disabled: 'מושבת',
  },
  en: {
    too_many: 'Too many attempts',
    signup_closed: 'Sign-up is closed right now',
    signup_cap: "Today's sign-up limit was reached. Please try again tomorrow",
    username_taken: 'That username is taken. Please choose another',
    bad_username: 'Username: 3–32 characters — letters, digits, dot, dash or underscore',
    weak_password: 'Weak password: at least 10 characters, and not the same as the username',
    bad_credentials: 'Wrong username or password',
    account_locked: 'Too many attempts for this account. Try again in 15 minutes',
    wrong_password: 'The current password is wrong',
    passkey_exists: 'This passkey is already registered',
    passkey_create_failed: 'Creating the passkey failed. Please try again',
    passkey_add_failed: 'Adding the passkey failed',
    max_passkeys: 'Up to 10 passkeys are allowed',
    last_passkey: "You can't remove your last way to sign in. Set a password or add another passkey first",
    login_failed: 'Sign-in failed',
    bad_recovery: 'Wrong recovery code',
    bad_setup_code: 'Wrong setup code',
    link_failed: 'Connecting to PalGate failed (ref {0})',
    gates_failed: "Couldn't load gates from PalGate (ref {0})",
    bad_notify: 'Invalid notification URL (https://ntfy.sh/...)',
    too_many_access: 'Too many access methods',
    bad_code: 'Invalid code',
    code_not_found: 'Code not found or expired',
    not_found: 'Not found',
    confirm_required: 'Confirmation required',
    internal: 'Internal error (ref {0})',
    unauthorized: 'Please sign in',
    forbidden: 'Request blocked',
    switched_off: 'Opening is switched off (emergency switch)',
    access_disabled: 'This access is disabled',
    location_denied: 'Not allowed from this location',
    not_armed: 'Grok is not armed. Arm it from your phone first',
    not_setup: 'This account is not connected to PalGate yet',
    no_gate: 'No gate configured',
    hourly: 'Hourly opening limit reached',
    gate_error: 'Gate service error (ref {0})',
    not_paired: 'This device is not paired',
    use_post: 'This link only works from an automation (POST)',
    disabled: 'Disabled',
  },
};

/** "code|arg|arg" → text in `lang`; unknown codes pass through unchanged. */
export function msg(lang: Lang, coded: string): string {
  const [code = '', ...args] = coded.split('|');
  const s = MSG[lang][code];
  return s ? fill(s, args) : coded;
}

// ------------------------------------------------------------ notifications (ntfy)

const NOTE: Record<Lang, Record<string, string>> = {
  he: {
    opened: '🚪 {0} נפתח — {1} ({2})',
    blocked_location: '⚠️ ניסיון פתיחה נחסם: {0} מ-{1} ({2})',
    blocked_unarmed: '⚠️ Grok ביקש לפתוח כשהמערכת לא דרוכה ({0})',
    hourly: '⚠️ {0}: הגיע למגבלת הפתיחות לשעה',
    test: '✅ בדיקת התראה מ-HeyGate',
    deleted: '🗑️ החשבון ב-HeyGate נמחק',
    security: '🔐 {0} ({1}, {2})',
    login_failed: '⚠️ ניסיון התחברות כושל לחשבון ({0}, {1})',
    account_locked: '🚨 החשבון ננעל ל-15 דקות אחרי ניסיונות סיסמה כושלים ({0})',
  },
  en: {
    opened: '🚪 {0} opened — {1} ({2})',
    blocked_location: '⚠️ Opening blocked: {0} from {1} ({2})',
    blocked_unarmed: '⚠️ Grok tried to open while not armed ({0})',
    hourly: '⚠️ {0}: hourly opening limit reached',
    test: '✅ Test notification from HeyGate',
    deleted: '🗑️ Your HeyGate account was deleted',
    security: '🔐 {0} ({1}, {2})',
    login_failed: '⚠️ Failed sign-in attempt ({0}, {1})',
    account_locked: '🚨 Account locked for 15 minutes after failed password attempts ({0})',
  },
};

export const note = (lang: Lang, code: string, ...args: string[]) => fill(NOTE[lang][code] ?? code, args);

// ------------------------------------------------------------ log entries ("code|arg|arg")

export const LOG: Record<Lang, Record<string, string>> = {
  he: {
    account_created: 'החשבון נוצר',
    login: 'התחברות ({0})',
    login_password: 'התחברות עם סיסמה',
    login_recovery: 'כניסה עם קוד שחזור',
    login_failed: 'ניסיון התחברות כושל',
    account_locked: 'החשבון ננעל זמנית',
    palgate_linked: 'חשבון PalGate חובר',
    palgate_unlinked: 'חשבון PalGate נותק',
    link_failed: 'חיבור PalGate נכשל ({0})',
    gates_failed: 'טעינת שערים נכשלה ({0})',
    gates_updated: 'שערים עודכנו ({0})',
    master_on: 'מתג החירום הופעל — פתיחה פעילה',
    master_off: 'מתג החירום כובה — כל הפתיחות מושבתות',
    notify_changed: 'כתובת ההתראות שונתה',
    armed: 'Grok נדרך ל-{0} דק׳ ({1})',
    channel_added: 'נוספה גישה: {0}',
    channel_updated: 'גישה עודכנה: {0}',
    channel_enabled: 'גישה הופעלה: {0}',
    channel_disabled: 'גישה הושבתה: {0}',
    channel_rotated: 'קישור הוחלף: {0}',
    channel_deleted: 'גישה נמחקה: {0}',
    device_paired: 'מכשיר חדש צומד: {0}',
    logout_all: 'ניתוק מכל המכשירים',
    passkey_added: 'נוסף Passkey: {0}',
    passkey_deleted: 'נמחק Passkey: {0}',
    recovery_new: 'נוצר קוד שחזור חדש',
    password_changed: 'הסיסמה הוגדרה / שונתה',
    // reasons for a blocked opening
    switched_off: 'מתג החירום כבוי',
    access_disabled: 'הגישה מושבתת',
    location_denied: 'מיקום לא מורשה: {0}',
    not_armed: 'Grok לא היה דרוך',
    not_setup: 'PalGate לא מחובר',
    no_gate: 'לא הוגדר שער',
    hourly: 'מגבלה שעתית',
    gate_error: 'שגיאת PalGate ({0})',
  },
  en: {
    account_created: 'Account created',
    login: 'Signed in ({0})',
    login_password: 'Signed in with password',
    login_recovery: 'Signed in with a recovery code',
    login_failed: 'Failed sign-in attempt',
    account_locked: 'Account temporarily locked',
    palgate_linked: 'PalGate account connected',
    palgate_unlinked: 'PalGate account disconnected',
    link_failed: 'PalGate connection failed ({0})',
    gates_failed: 'Loading gates failed ({0})',
    gates_updated: 'Gates updated ({0})',
    master_on: 'Emergency switch on — opening enabled',
    master_off: 'Emergency switch off — all opening disabled',
    notify_changed: 'Notification URL changed',
    armed: 'Grok armed for {0} min ({1})',
    channel_added: 'Access added: {0}',
    channel_updated: 'Access updated: {0}',
    channel_enabled: 'Access enabled: {0}',
    channel_disabled: 'Access disabled: {0}',
    channel_rotated: 'Link replaced: {0}',
    channel_deleted: 'Access deleted: {0}',
    device_paired: 'New device paired: {0}',
    logout_all: 'Signed out everywhere',
    passkey_added: 'Passkey added: {0}',
    passkey_deleted: 'Passkey removed: {0}',
    recovery_new: 'New recovery code created',
    password_changed: 'Password set / changed',
    switched_off: 'Emergency switch off',
    access_disabled: 'Access disabled',
    location_denied: 'Location not allowed: {0}',
    not_armed: 'Grok was not armed',
    not_setup: 'PalGate not connected',
    no_gate: 'No gate configured',
    hourly: 'Hourly limit',
    gate_error: 'PalGate error ({0})',
  },
};

export const defaultNames: Record<Lang, { grok: string; car: string; phone: string }> = {
  he: { grok: 'Grok', car: 'מכשיר', phone: 'אוטומציה בטלפון' },
  en: { grok: 'Grok', car: 'Device', phone: 'Phone automation' },
};

/** A stored log code ("code|arg|arg") as text. */
export function logText(lang: Lang, coded: string): string {
  const [code = '', ...args] = coded.split('|');
  const s = LOG[lang][code];
  return s ? fill(s, args) : coded;
}
