import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { soldierActions } from './actions';

const formString = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

const specificFields: Record<string, { label: string; placeholder: string; type?: string }[]> = {
  details: [{ label: 'רישיון נהיגה', placeholder: 'סוגי הרישיונות שברשותכם' }],
  weapon: [
    { label: 'מספר נשק', placeholder: 'הקלידו את המספר שעל הנשק' },
    { label: 'מספר כוונת / אקילה', placeholder: 'אם קיים' },
  ],
  equipment: [{ label: 'ציוד שקיבלתם', placeholder: 'לדוגמה: קסדה, ווסט, 5 מחסניות' }],
  shortage: [{ label: 'מה חסר?', placeholder: 'פרטו את הציוד והכמות הדרושה' }],
  deposit: [{ label: 'מספר הנשק', placeholder: 'הקלידו את המספר שעל הנשק' }],
  refuel: [
    { label: 'מספר רכב', placeholder: 'מספר הרכב' },
    { label: 'כמות בליטרים', placeholder: 'לדוגמה: 42', type: 'number' },
  ],
  fault: [{ label: 'תיאור התקלה', placeholder: 'מיקום מדויק, מה קרה ומתי הבחנתם בתקלה' }],
};

export function SoldierActionPage() {
  const { actionId } = useParams();
  const action = soldierActions.find((item) => item.id === actionId);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  if (!action || !actionId) return <Navigate to="/" replace />;
  const Icon = action.icon;
  const fields = specificFields[actionId] ?? [];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    const data = new FormData(event.currentTarget);
    const baseKeys = new Set(['fullName', 'personalId', 'phone', 'department']);
    const payload: Record<string, string> = {};
    data.forEach((value, key) => {
      if (!baseKeys.has(key) && typeof value === 'string') payload[key] = value;
    });
    try {
      await api.createSubmission({
        actionType: actionId,
        fullName: formString(data, 'fullName'),
        personalId: formString(data, 'personalId'),
        phone: formString(data, 'phone'),
        department: formString(data, 'department'),
        payload,
      });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'שליחת הטופס נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="action-page">
      <Link className="back-link" to="/">
        <ArrowRight /> חזרה לכל הפעולות
      </Link>
      <header className="action-page-header">
        <span className={`action-card-icon accent-${action.accent}`}>
          <Icon />
        </span>
        <div>
          <span className="eyebrow">טופס לחייל</span>
          <h1>{action.title}</h1>
          <p>{action.description}</p>
        </div>
      </header>
      {submitted ? (
        <div className="submission-card" role="status">
          <span>
            <CheckCircle2 />
          </span>
          <h2>הפרטים נקלטו</h2>
          <p>הדיווח נשמר והועבר להמשך טיפול.</p>
          <Link className="button button-primary" to="/">
            חזרה למסך הראשי
          </Link>
        </div>
      ) : (
        <form className="public-form" onSubmit={submit}>
          <div className="form-section">
            <header>
              <span>1</span>
              <div>
                <h2>זיהוי ויצירת קשר</h2>
                <p>כדי שנוכל לשייך את הדיווח ולחזור אליכם.</p>
              </div>
            </header>
            <div className="form-grid">
              <label>
                <span>שם מלא</span>
                <input name="fullName" autoComplete="name" required placeholder="שם פרטי ומשפחה" />
              </label>
              <label>
                <span>מספר אישי</span>
                <input
                  name="personalId"
                  inputMode="numeric"
                  dir="ltr"
                  required
                  minLength={6}
                  placeholder="7–8 ספרות"
                />
              </label>
              <label>
                <span>טלפון</span>
                <input
                  name="phone"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  required
                  placeholder="05X-XXXXXXX"
                />
              </label>
              <label>
                <span>מחלקה</span>
                <select name="department" required defaultValue="">
                  <option value="" disabled>
                    בחרו מחלקה
                  </option>
                  <option>מחלקה 1</option>
                  <option>מחלקה 2</option>
                  <option>מחלקה 3</option>
                  <option>מפל״ג</option>
                </select>
              </label>
            </div>
          </div>
          <div className="form-section">
            <header>
              <span>2</span>
              <div>
                <h2>פרטי הבקשה</h2>
                <p>מלאו פרטים מדויקים ככל האפשר.</p>
              </div>
            </header>
            <div className="form-grid">
              {fields.map((field) => (
                <label className={fields.length === 1 ? 'field-wide' : ''} key={field.label}>
                  <span>{field.label}</span>
                  <textarea name={field.label} required placeholder={field.placeholder} />
                </label>
              ))}
              <label className="field-wide">
                <span>
                  הערה נוספת <em>לא חובה</em>
                </span>
                <textarea name="note" placeholder="כל מידע נוסף שיעזור לנו לטפל בפנייה" />
              </label>
            </div>
          </div>
          <div className="privacy-note">
            <Info />
            <span>
              <strong>לפני השליחה</strong> ודאו שהפרטים נכונים. אין להזין מידע מסווג.
            </span>
          </div>
          {submitError && (
            <div className="login-error" role="alert">
              {submitError}
            </div>
          )}
          <div className="public-form-actions">
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'שולח…' : 'שליחת הטופס'}
            </Button>
            <Link className="button" to="/">
              ביטול
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
