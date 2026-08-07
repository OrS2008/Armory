import { Download, Filter, Plus, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { api } from '@/services/api';
import { moduleConfigs } from './module.config';

const submissionType: Record<string, string | undefined> = {
  approvals: undefined,
  shortages: 'shortage',
  faults: 'fault',
  armory: 'deposit',
  vehicles: 'refuel',
  equipment: 'equipment',
};
const assetModule: Record<string, string | undefined> = {
  inventory: 'inventory',
  armory: 'armory',
  communications: 'communications',
  ammunition: 'ammunition',
  vehicles: 'vehicles',
};
const labels: Record<string, string> = {
  details: 'פרטים אישיים',
  weapon: 'נשק',
  equipment: 'ציוד',
  shortage: 'חוסר',
  deposit: 'אפסון',
  refuel: 'תדלוק',
  fault: 'תקלה',
  pending: 'ממתין',
  in_progress: 'בטיפול',
  resolved: 'טופל',
  approved: 'אושר',
};

const downloadCsv = (name: string, rows: string[][]) => {
  const content =
    '\uFEFF' +
    rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `armory-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export function OperationalModulePage() {
  const { moduleId = '' } = useParams();
  const config = moduleConfigs[moduleId];
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState('');
  const liveModule = Object.prototype.hasOwnProperty.call(submissionType, moduleId);
  const assetName = assetModule[moduleId];
  const submissions = useQuery({
    queryKey: ['submissions', moduleId],
    queryFn: () => {
      const type = submissionType[moduleId];
      return api.submissions(type ? { type } : undefined);
    },
    enabled: liveModule,
  });
  const assets = useQuery({
    queryKey: ['assets', assetName],
    queryFn: () => api.assets(assetName!),
    enabled: !!assetName,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateSubmission(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissions', moduleId] }),
  });
  const create = useMutation({
    mutationFn: api.createAsset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets', assetName] });
      setDialog(false);
      setNotice('הפריט נוסף ונשמר במערכת.');
    },
  });
  const liveRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (submissions.data?.items ?? []).filter(
      (item) =>
        (!activeOnly || !['resolved', 'approved', 'archived'].includes(item.status)) &&
        (!needle ||
          `${item.full_name} ${item.personal_id} ${item.department} ${item.action_type}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [submissions.data, query, activeOnly]);
  const assetRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (assets.data?.items ?? []).filter(
      (item) =>
        !needle ||
        `${item.name} ${item.category} ${item.serial_number ?? ''}`.toLowerCase().includes(needle),
    );
  }, [assets.data, query]);
  if (!config) return null;
  const exportRows = () => {
    if (liveModule)
      downloadCsv(moduleId, [
        ['שם', 'מ״א', 'מחלקה', 'סוג', 'סטטוס'],
        ...liveRows.map((item) => [
          item.full_name,
          item.personal_id,
          item.department,
          labels[item.action_type] ?? item.action_type,
          labels[item.status] ?? item.status,
        ]),
      ]);
    else if (assetName)
      downloadCsv(moduleId, [
        ['פריט', 'קטגוריה', 'מספר סידורי', 'כמות', 'מיקום'],
        ...assetRows.map((item) => [
          item.name,
          item.category,
          item.serial_number ?? '',
          String(item.quantity),
          item.location,
        ]),
      ]);
    else downloadCsv(moduleId, [config.columns ?? [], ...(config.rows ?? [])]);
  };
  const submitAsset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assetName) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = data.get(key);
      return typeof value === 'string' ? value : '';
    };
    create.mutate({
      module: assetName,
      name: text('name'),
      category: text('category'),
      quantity: Number(text('quantity')),
      serialNumber: text('serialNumber'),
      ownerName: text('ownerName'),
    });
  };
  return (
    <section className="page module-page">
      <header className="page-title">
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        {config.primaryAction && (
          <Button
            variant="primary"
            onClick={() =>
              assetName ? setDialog(true) : setNotice('הפעולה זמינה מתוך הרשומה המתאימה בטבלה.')
            }
          >
            <Plus />
            {config.primaryAction}
          </Button>
        )}
      </header>
      {notice && (
        <div className="inline-notice" role="status">
          {notice}
          <button aria-label="סגירת הודעה" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      <div className="module-stats">
        {config.stats.map((stat) => (
          <article key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </article>
        ))}
      </div>
      <div className="module-toolbar">
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`חיפוש ב${config.title}`}
            placeholder="חיפוש ברשומות…"
          />
        </label>
        <Button aria-pressed={activeOnly} onClick={() => setActiveOnly((value) => !value)}>
          <Filter />
          {activeOnly ? 'הצגת הכול' : 'פעילים בלבד'}
        </Button>
        <Button onClick={exportRows}>
          <Download />
          ייצוא
        </Button>
      </div>
      {liveModule ? (
        <section className="section-card module-table-card">
          <header>
            <div>
              <h2>{config.title}</h2>
              <p>דיווחים שנשלחו מאזור החיילים</p>
            </div>
          </header>
          {submissions.isLoading ? (
            <div className="module-empty">
              <span>טוען רשומות…</span>
            </div>
          ) : liveRows.length ? (
            <div className="module-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>מ״א</th>
                    <th>מחלקה</th>
                    <th>סוג</th>
                    <th>סטטוס</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {liveRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.full_name}</td>
                      <td>{item.personal_id}</td>
                      <td>{item.department}</td>
                      <td>{labels[item.action_type] ?? item.action_type}</td>
                      <td>{labels[item.status] ?? item.status}</td>
                      <td>
                        <Button
                          size="sm"
                          disabled={
                            update.isPending || ['resolved', 'approved'].includes(item.status)
                          }
                          onClick={() =>
                            update.mutate({
                              id: item.id,
                              status: item.status === 'pending' ? 'in_progress' : 'resolved',
                            })
                          }
                        >
                          {item.status === 'pending'
                            ? 'העברה לטיפול'
                            : item.status === 'in_progress'
                              ? 'סגירת טיפול'
                              : 'טופל'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="module-empty">
              <span>אין רשומות להצגה כרגע.</span>
              <small>רשומות חדשות יופיעו כאן אוטומטית.</small>
            </div>
          )}
        </section>
      ) : assetName ? (
        <section className="section-card module-table-card">
          <header>
            <div>
              <h2>{config.title}</h2>
              <p>פריטים שנשמרו במסד הנתונים</p>
            </div>
          </header>
          {assets.isLoading ? (
            <div className="module-empty">
              <span>טוען מלאי…</span>
            </div>
          ) : assetRows.length ? (
            <div className="module-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>קטגוריה</th>
                    <th>מספר סידורי</th>
                    <th>כמות</th>
                    <th>מיקום</th>
                  </tr>
                </thead>
                <tbody>
                  {assetRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{item.serial_number ?? '—'}</td>
                      <td>{item.quantity}</td>
                      <td>{item.location === 'storage' ? 'במחסן' : item.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="module-empty">
              <span>אין פריטים להצגה.</span>
              <small>הוסיפו את הפריט הראשון באמצעות הכפתור למעלה.</small>
            </div>
          )}
        </section>
      ) : (
        config.columns && (
          <section className="section-card module-table-card">
            <header>
              <div>
                <h2>{config.title}</h2>
                <p>המידע העדכני במערכת</p>
              </div>
            </header>
            {config.rows?.length ? (
              <div className="module-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {config.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {config.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="module-empty">
                <span>אין רשומות להצגה כרגע.</span>
              </div>
            )}
          </section>
        )
      )}
      <div className="module-sections">
        {config.sections.map((section) => (
          <article className="section-card" key={section.title}>
            <header>
              <div>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
            </header>
            {section.action && (
              <Button
                variant="ghost"
                onClick={() =>
                  assetName
                    ? setDialog(true)
                    : setNotice(`${section.title}: הפעולה זמינה מתוך הרשומה המתאימה.`)
                }
              >
                {section.action}
              </Button>
            )}
          </article>
        ))}
      </div>
      <Dialog
        open={dialog}
        title={config.primaryAction ?? 'הוספת פריט'}
        onClose={() => setDialog(false)}
      >
        <form className="form" onSubmit={submitAsset}>
          <div className="form-grid">
            <label>
              <span>שם הפריט</span>
              <input name="name" required minLength={2} />
            </label>
            <label>
              <span>קטגוריה</span>
              <input name="category" required minLength={2} />
            </label>
            <label>
              <span>כמות</span>
              <input name="quantity" type="number" min="0" defaultValue="1" required />
            </label>
            <label>
              <span>מספר סידורי</span>
              <input name="serialNumber" />
            </label>
            <label className="field-wide">
              <span>בעלים / אחראי</span>
              <input name="ownerName" />
            </label>
          </div>
          {create.error && (
            <div className="login-error" role="alert">
              {create.error.message}
            </div>
          )}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setDialog(false)}>
              ביטול
            </Button>
            <Button variant="primary" type="submit" disabled={create.isPending}>
              {create.isPending ? 'שומר…' : 'שמירה'}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
