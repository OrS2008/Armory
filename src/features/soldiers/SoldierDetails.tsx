import { ExternalLink, MessageCircle, Pencil, Printer, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Soldier } from './soldier.schema';

const Field = ({ label, value, dir }: { label: string; value: React.ReactNode; dir?: 'ltr' }) => (
  <div className="detail-field">
    <dt>{label}</dt>
    <dd dir={dir}>{value || '—'}</dd>
  </div>
);
export function SoldierDetails({ soldier, onEdit }: { soldier: Soldier; onEdit: () => void }) {
  const outside = soldier.equipment.reduce((sum, item) => sum + item.issued - item.returned, 0);
  return (
    <div className="soldier-expanded">
      <section className="detail-section actions-section">
        <h3>פעולות</h3>
        <div className="action-stack">
          <button>
            <MessageCircle />
            שליחת הודעה
          </button>
          <button onClick={onEdit}>
            <Pencil />
            עריכת פרטים
          </button>
          <button>
            <ExternalLink />
            הצגת כרטיס מלא
          </button>
          <button>
            <Printer />
            הדפסת דוח
          </button>
          <button className="danger-action">
            <Trash2 />
            העברה לארכיון
          </button>
        </div>
      </section>
      <section className="detail-section">
        <header>
          <h3>פרטים אישיים</h3>
          <StatusBadge tone={outside ? 'warning' : 'success'}>
            {outside ? `${outside} פריטים בחוץ` : 'הכול הוחזר'}
          </StatusBadge>
        </header>
        <dl className="detail-grid">
          <Field label="שם מלא" value={soldier.fullName} />
          <Field label="מספר אישי" value={soldier.personalId} dir="ltr" />
          <Field label="מחלקה" value={soldier.department} />
          <Field label="טלפון" value={soldier.phone} dir="ltr" />
          <Field
            label="תאריך אישור"
            value={
              soldier.approvedAt
                ? new Date(soldier.approvedAt).toLocaleDateString('he-IL')
                : 'טרם אושר'
            }
          />
          <Field label="הודעה" value={soldier.messageSentAt ? 'נשלחה' : 'טרם נשלחה'} />
        </dl>
      </section>
      <section className="detail-section licenses-section">
        <h3>רישיונות ומסמכים</h3>
        {[
          ['רישיון אזרחי', soldier.civilianLicense],
          ['רישיון צבאי', soldier.militaryLicense],
        ].map(([label, raw]) => {
          const license = raw as Soldier['civilianLicense'];
          return (
            <article key={label as string}>
              <div>
                <strong>{label as string}</strong>
                <small>
                  {license.number || 'לא הוזן'} ·{' '}
                  {license.expiresAt
                    ? `בתוקף עד ${new Date(license.expiresAt).toLocaleDateString('he-IL')}`
                    : 'ללא תוקף'}
                </small>
              </div>
              <StatusBadge tone={license.approved ? 'success' : 'neutral'}>
                {license.approved ? 'מאושר' : 'חסר'}
              </StatusBadge>
            </article>
          );
        })}
      </section>
      <section className="detail-section equipment-section">
        <header>
          <h3>ציוד והחזרות</h3>
          <span>{outside} בחוץ</span>
        </header>
        <div className="equipment-list">
          {soldier.equipment.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
              <strong dir="ltr">
                {item.returned}/{item.issued}
              </strong>
              <span>{item.issued === item.returned ? 'הוחזר' : 'אצל החייל'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
