import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, PackageOpen, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { soldierFixtures } from '@/features/soldiers/soldier.fixtures';
export function DashboardPage() {
  const total = soldierFixtures.length,
    pending = soldierFixtures.filter((s) => s.approvalStatus === 'pending').length,
    out = soldierFixtures.reduce(
      (sum, s) => sum + s.equipment.reduce((n, i) => n + i.issued - i.returned, 0),
      0,
    );
  return (
    <section className="page">
      <header className="page-title dashboard-title">
        <div>
          <span className="eyebrow">יום שישי, 7 באוגוסט</span>
          <h1>בוקר טוב, אור</h1>
          <p>הנה תמונת המצב התפעולית העדכנית.</p>
        </div>
      </header>
      <div className="metrics">
        <article>
          <span>
            <Users />
          </span>
          <div>
            <small>סה״כ חיילים</small>
            <strong>{total}</strong>
            <p>רשומים במערכת</p>
          </div>
        </article>
        <article>
          <span>
            <Clock3 />
          </span>
          <div>
            <small>ממתינים לאישור</small>
            <strong>{pending}</strong>
            <p>דורשים טיפול</p>
          </div>
        </article>
        <article>
          <span>
            <PackageOpen />
          </span>
          <div>
            <small>פריטים בחוץ</small>
            <strong>{out}</strong>
            <p>אצל חיילים</p>
          </div>
        </article>
        <article>
          <span>
            <AlertTriangle />
          </span>
          <div>
            <small>בקשות חוסר</small>
            <strong>0</strong>
            <p>אין בקשות פתוחות</p>
          </div>
        </article>
      </div>
      <div className="dashboard-grid">
        <section className="section-card">
          <header>
            <div>
              <h2>דורש טיפול</h2>
              <p>משימות לפי דחיפות</p>
            </div>
            <Link to="/admin/soldiers">
              לכל החיילים <ArrowLeft />
            </Link>
          </header>
          <div className="task-list">
            <article>
              <span className="task-icon warning">
                <Clock3 />
              </span>
              <div>
                <strong>אישור רישום של נועם לוי</strong>
                <small>מחלקה 1 · התקבל היום</small>
              </div>
              <StatusBadge tone="warning">ממתין</StatusBadge>
            </article>
            <article>
              <span className="task-icon success">
                <CheckCircle2 />
              </span>
              <div>
                <strong>אין בקשות חוסר פתוחות</strong>
                <small>הכול מטופל כרגע</small>
              </div>
              <StatusBadge tone="success">תקין</StatusBadge>
            </article>
          </div>
        </section>
        <section className="section-card activity-card">
          <header>
            <div>
              <h2>פעילות אחרונה</h2>
              <p>אירועים מהמערכת</p>
            </div>
          </header>
          <ol>
            <li>
              <span />
              <div>
                <strong>ציוד אושר לאור שמחון</strong>
                <small>לפני 12 דקות</small>
              </div>
            </li>
            <li>
              <span />
              <div>
                <strong>החזרה מלאה ליובל כהן</strong>
                <small>לפני שעה</small>
              </div>
            </li>
            <li>
              <span />
              <div>
                <strong>רישום חדש התקבל</strong>
                <small>היום, 09:14</small>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </section>
  );
}
