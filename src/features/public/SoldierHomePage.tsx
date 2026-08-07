import { ArrowLeft, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { soldierActions } from './actions';

export function SoldierHomePage() {
  return (
    <section className="soldier-home">
      <div className="soldier-hero">
        <span className="hero-badge">
          <ShieldCheck /> אזור חיילים
        </span>
        <h1>מה תרצו לעשות?</h1>
        <p>בחרו פעולה, מלאו את הפרטים הנדרשים ושלחו לטיפול. התהליך קצר ומותאם גם לטלפון.</p>
        <div className="hero-notes">
          <span>
            <Clock3 /> 2–3 דקות למילוי
          </span>
          <span>
            <CheckCircle2 /> הפרטים נשמרים בצורה מאובטחת
          </span>
        </div>
      </div>
      <div className="action-grid" aria-label="פעולות לחייל">
        {soldierActions.map(({ id, title, description, icon: Icon, accent }) => (
          <Link className={`action-card accent-${accent}`} to={`/action/${id}`} key={id}>
            <span className="action-card-icon">
              <Icon />
            </span>
            <span className="action-card-copy">
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <span className="action-arrow" aria-hidden="true">
              <ArrowLeft />
            </span>
          </Link>
        ))}
      </div>
      <aside className="help-strip">
        <span>
          <strong>לא בטוחים במה לבחור?</strong>
          <small>פנו למנהל הציוד ביחידה לפני שליחת דיווח.</small>
        </span>
      </aside>
    </section>
  );
}
