import { ChevronDown, Download, Filter, Plus, RefreshCw } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SoldierDetails } from './SoldierDetails';
import { SoldierForm } from './SoldierForm';
import { soldierFixtures } from './soldier.fixtures';
import type { Soldier, SoldierFormValues } from './soldier.schema';

type FilterValue = 'all' | 'outside' | 'returned' | 'pending';
export function SoldiersPage() {
  const [soldiers, setSoldiers] = useState(soldierFixtures);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Soldier | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = useMemo(
    () =>
      soldiers.filter((s) => {
        const q = query.trim().toLowerCase();
        const matches =
          !q ||
          s.fullName.toLowerCase().includes(q) ||
          s.personalId.includes(q) ||
          s.department.includes(q);
        const state =
          filter === 'all' ||
          (filter === 'pending' && s.approvalStatus === 'pending') ||
          (filter === 'outside' && s.equipmentStatus !== 'returned') ||
          (filter === 'returned' && s.equipmentStatus === 'returned');
        return matches && state;
      }),
    [soldiers, query, filter],
  );
  const exportSoldiers = () => {
    const rows = [
      ['שם', 'מ״א', 'מחלקה', 'טלפון'],
      ...visible.map((s) => [s.fullName, s.personalId, s.department, s.phone]),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
        .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'armory-soldiers.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  const save = (values: SoldierFormValues) => {
    if (editing) {
      setSoldiers((rows) =>
        rows.map((row) => (row.id === editing.id ? { ...row, ...values } : row)),
      );
      setEditing(null);
    } else {
      setSoldiers((rows) => [
        {
          ...soldierFixtures[0]!,
          ...values,
          id: crypto.randomUUID(),
          approvalStatus: 'pending',
          approvedAt: null,
          messageSentAt: null,
          equipment: [],
          equipmentStatus: 'returned',
          note: '',
        },
        ...rows,
      ]);
      setCreating(false);
    }
  };
  return (
    <section className="page soldiers-page">
      <header className="page-title">
        <div>
          <span className="eyebrow">כוח אדם וציוד</span>
          <h1>חיילים</h1>
          <p>{soldiers.length} חיילים רשומים במערכת</p>
        </div>
        <div className="page-actions">
          <Button onClick={exportSoldiers}>
            <Download />
            ייבוא / ייצוא
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            הוספת חייל
          </Button>
        </div>
      </header>
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="חיפוש לפי שם, מספר אישי או מחלקה"
        />
        <div className="filter-group" aria-label="סינון חיילים">
          {(
            [
              ['all', 'הכול'],
              ['outside', 'ציוד בחוץ'],
              ['returned', 'הוחזר'],
              ['pending', 'ממתין'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <IconButton label="הצגת ממתינים בלבד" onClick={() => setFilter('pending')}>
          <Filter />
        </IconButton>
        <IconButton
          label="רענון"
          onClick={() => {
            setQuery('');
            setFilter('all');
            setExpanded(null);
          }}
        >
          <RefreshCw />
        </IconButton>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>מ״א</th>
              <th>מחלקה</th>
              <th>מצב ציוד</th>
              <th>בחוץ</th>
              <th>אישור</th>
              <th>הודעה</th>
              <th>
                <span className="sr-only">פעולות</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const out = s.equipment.reduce((sum, item) => sum + item.issued - item.returned, 0);
              const open = expanded === s.id;
              return (
                <Fragment key={s.id}>
                  <tr className={open ? 'is-expanded' : ''}>
                    <td>
                      <button
                        className="identity-cell"
                        onClick={() => setExpanded(open ? null : s.id)}
                        aria-expanded={open}
                      >
                        <Avatar name={s.fullName} />
                        <span>
                          <strong>{s.fullName}</strong>
                          <small>{s.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1••••$2')}</small>
                        </span>
                      </button>
                    </td>
                    <td dir="ltr">{s.personalId}</td>
                    <td>{s.department}</td>
                    <td>
                      <StatusBadge tone={s.equipmentStatus === 'returned' ? 'success' : 'warning'}>
                        {s.equipmentStatus === 'returned'
                          ? 'הוחזר במלואו'
                          : s.equipmentStatus === 'partial'
                            ? 'הוחזר חלקית'
                            : 'ציוד בחוץ'}
                      </StatusBadge>
                    </td>
                    <td>
                      <strong className={out ? 'out-count' : ''}>{out}</strong>
                    </td>
                    <td>
                      <StatusBadge tone={s.approvalStatus === 'approved' ? 'success' : 'neutral'}>
                        {s.approvalStatus === 'approved' ? 'מאושר' : 'ממתין'}
                      </StatusBadge>
                    </td>
                    <td>
                      {s.messageSentAt ? (
                        <span className="sent-text">נשלחה</span>
                      ) : (
                        <span className="muted-text">טרם נשלחה</span>
                      )}
                    </td>
                    <td>
                      <IconButton
                        label={`${open ? 'סגירת' : 'פתיחת'} פרטי ${s.fullName}`}
                        onClick={() => setExpanded(open ? null : s.id)}
                      >
                        <ChevronDown className={open ? 'rotate' : ''} />
                      </IconButton>
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <SoldierDetails
                          soldier={s}
                          onEdit={() => setEditing(s)}
                          onArchive={() => {
                            if (window.confirm(`להעביר את ${s.fullName} לארכיון?`)) {
                              setSoldiers((rows) => rows.filter((row) => row.id !== s.id));
                              setExpanded(null);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty-state">
            <span aria-hidden="true">⌕</span>
            <h2>לא נמצאו חיילים</h2>
            <p>נסו לשנות את החיפוש או את הסינון.</p>
          </div>
        )}
      </div>
      <footer className="pagination">
        <span>
          מציג {visible.length} מתוך {soldiers.length}
        </span>
        <div>
          <Button size="sm" disabled>
            הקודם
          </Button>
          <button aria-current="page">1</button>
          <Button size="sm" disabled>
            הבא
          </Button>
        </div>
      </footer>
      <Dialog
        open={creating || !!editing}
        title={editing ? 'עריכת פרטי חייל' : 'הוספת חייל'}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <SoldierForm
          initial={
            editing
              ? {
                  fullName: editing.fullName,
                  personalId: editing.personalId,
                  department: editing.department,
                  phone: editing.phone,
                }
              : undefined
          }
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={save}
        />
      </Dialog>
    </section>
  );
}
