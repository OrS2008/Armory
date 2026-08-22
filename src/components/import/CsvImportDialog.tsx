import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
import type { RowProblem } from '@shared/csv';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { downloadCsv } from '@/lib/download';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/toast-context';

export interface ParsedFile<TRow> {
  rows: TRow[];
  problems: RowProblem[];
  columns: string[];
}

export interface ImportOutcome {
  line: number;
  status: string;
  reason?: string;
}

export interface ImportResult<TOutcome extends ImportOutcome> {
  dryRun: boolean;
  imported: number;
  willCreate: number;
  skipped: number;
  outcomes: TOutcome[];
}

interface Props<TRow, TOutcome extends ImportOutcome> {
  open: boolean;
  title: string;
  description: string;
  /** API path, relative to the versioned base. */
  endpoint: string;
  templateCsv: string;
  templateFileName: string;
  parse: (text: string) => ParsedFile<TRow>;
  columnLabel: (column: string) => string;
  outcomeName: (outcome: TOutcome) => string;
  /** Anything the specific import wants to say about a checked run. */
  summary?: (result: ImportResult<TOutcome>) => ReactNode;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Two-step import: parse and check, then commit. The check runs the real
 * server-side resolution with `dryRun`, so what the scheduler approves is
 * exactly what will be written (plan section 44).
 *
 * The roster and the availability sheet differ only in how a line is parsed
 * and what a skipped line is called, so both go through here.
 */
export function CsvImportDialog<TRow, TOutcome extends ImportOutcome>({
  open,
  title,
  description,
  endpoint,
  templateCsv,
  templateFileName,
  parse,
  columnLabel,
  outcomeName,
  summary,
  onClose,
  onImported,
}: Props<TRow, TOutcome>) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedFile<TRow> | null>(null);
  const [checked, setChecked] = useState<ImportResult<TOutcome> | null>(null);

  const reset = () => {
    setText('');
    setParsed(null);
    setChecked(null);
  };

  const run = useMutation({
    mutationFn: (dryRun: boolean) => {
      const rows = (parsed ?? parse(text)).rows;
      return api.post<ImportResult<TOutcome>>(endpoint, { rows, dryRun });
    },
    onSuccess: (result) => {
      setChecked(result);
      if (!result.dryRun) {
        toast.push('success', t('import.done', { count: result.imported }));
        onImported();
        reset();
        onClose();
      }
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The dry run is what turns "66 rows parsed" into "66 rows the server will
   * accept", and the import button depends on it. Running it automatically
   * removes a step where the dialog showed a count and an import button reading
   * zero at the same time, with nothing saying which to believe.
   */
  // Latest-ref, so the debounced check calls the current mutation rather than
  // one captured when the timer was set.
  const runRef = useRef<(dryRun: boolean) => void>(() => {});
  useEffect(() => {
    runRef.current = (dryRun: boolean) => run.mutate(dryRun);
  });

  const handleText = (value: string) => {
    setText(value);
    setChecked(null);
    const result = value.trim() ? parse(value) : null;
    setParsed(result);

    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (result && result.rows.length > 0) {
      checkTimer.current = setTimeout(() => runRef.current(true), 400);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsText always yields a string; the union also covers readAsArrayBuffer.
      const result = reader.result;
      handleText(typeof result === 'string' ? result : '');
    };
    reader.readAsText(file, 'utf-8');
  };

  const downloadTemplate = () => downloadCsv(templateFileName, templateCsv);

  useEffect(
    () => () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    },
    [],
  );

  const problems = parsed?.problems ?? [];
  const skipped = (checked?.outcomes ?? []).filter((outcome) => outcome.status !== 'create');

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      size="lg"
      title={title}
      description={description}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('app.cancel')}
          </Button>
          <Button
            variant="secondary"
            disabled={!parsed || parsed.rows.length === 0}
            loading={run.isPending && run.variables === true}
            onClick={() => run.mutate(true)}
          >
            {t('import.check')}
          </Button>
          <Button
            icon={<Upload className="size-4" />}
            disabled={!checked || checked.willCreate === 0}
            loading={run.isPending && run.variables === false}
            onClick={() => run.mutate(false)}
          >
            {checked ? t('import.confirm', { count: checked.willCreate }) : t('import.awaitCheck')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<FileUp className="size-4" />}
            onClick={() => fileInput.current?.click()}
          >
            {t('import.chooseFile')}
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            {t('import.template')}
          </Button>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('import.paste')}
          <Textarea
            aria-label={t('import.paste')}
            dir="ltr"
            className="min-h-32 font-mono text-xs"
            value={text}
            onChange={(event) => handleText(event.target.value)}
          />
        </label>

        {parsed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={checked ? 'success' : 'brand'}>
              {checked
                ? t('import.ready', { count: checked.willCreate })
                : t('import.parsed', { count: parsed.rows.length })}
            </Badge>
            {run.isPending && run.variables === true ? (
              <span className="text-xs text-ink-muted">{t('import.checking')}</span>
            ) : null}
            {problems.length > 0 ? (
              <Badge tone="warning">{t('import.skipped', { count: problems.length })}</Badge>
            ) : null}
            <span className="text-xs text-ink-muted">
              {t('import.columns')}: {parsed.columns.map(columnLabel).join(', ') || '—'}
            </span>
          </div>
        ) : null}

        {problems.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-sm font-semibold">{t('import.problems')}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {problems.slice(0, 20).map((problem) => (
                <li key={`${problem.line}-${problem.message}`} className="text-danger">
                  {t('import.line', { line: problem.line })}: {problem.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {checked ? (
          <section className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-sunken p-3">
            <p className="text-xs text-ink-muted">{t('import.dryRunNote')}</p>
            {summary?.(checked)}
            {skipped.length > 0 ? (
              <TableWrapper>
                <thead>
                  <tr>
                    <Th>{t('personnel.name')}</Th>
                    <Th>{t('audit.details')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {skipped.slice(0, 20).map((outcome) => (
                    <tr key={outcome.line}>
                      <Td>{outcomeName(outcome)}</Td>
                      <Td className="text-warning">{outcome.reason ?? ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            ) : null}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
