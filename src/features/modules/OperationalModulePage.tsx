import { Download, Filter, Plus, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
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

export function OperationalModulePage() {
  const { moduleId = '' } = useParams();
  const config = moduleConfigs[moduleId];
  const queryClient = useQueryClient();
  const liveModule = Object.prototype.hasOwnProperty.call(submissionType, moduleId);
  const submissions = useQuery({
    queryKey: ['submissions', moduleId],
    queryFn: () => {
      const type = submissionType[moduleId];
      return api.submissions(type ? { type } : undefined);
    },
    enabled: liveModule,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateSubmission(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissions', moduleId] }),
  });
  if (!config) return null;
  const liveRows = submissions.data?.items ?? [];
  return (
    <section className="page module-page">
      <header className="page-title">
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        {config.primaryAction && (
          <Button variant="primary">
            <Plus />
            {config.primaryAction}
          </Button>
        )}
      </header>
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
          <input aria-label={`חיפוש ב${config.title}`} placeholder="חיפוש ברשומות…" />
        </label>
        <Button>
          <Filter />
          סינון
        </Button>
        <Button>
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
                      <td>{item.action_type}</td>
                      <td>{item.status}</td>
                      <td>
                        <Button
                          size="sm"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: item.id,
                              status: item.status === 'pending' ? 'in_progress' : 'resolved',
                            })
                          }
                        >
                          {item.status === 'pending' ? 'העברה לטיפול' : 'סגירת טיפול'}
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
                <small>רשומות חדשות יופיעו כאן אוטומטית.</small>
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
            {section.action && <Button variant="ghost">{section.action}</Button>}
          </article>
        ))}
      </div>
    </section>
  );
}
