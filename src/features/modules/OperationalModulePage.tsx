import { Download, Filter, Plus, Search } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { moduleConfigs } from './module.config';

export function OperationalModulePage() {
  const { moduleId = '' } = useParams();
  const config = moduleConfigs[moduleId];
  if (!config) return null;
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
      {config.columns && (
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
                    {config.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
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
