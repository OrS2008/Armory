import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
import { CSV_TEMPLATE, parsePersonnelCsv, type ParsedImport } from '@shared/csv';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/toast-context';

interface ImportOutcome {
  line: number;
  displayName: string;
  status: 'create' | 'duplicate' | 'invalid';
  reason?: string;
}

interface ImportResponse {
  dryRun: boolean;
  imported: number;
  willCreate: number;
  skipped: number;
  createdUnits: string[];
  createdQualifications: string[];
  outcomes: ImportOutcome[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Two-step import: parse and check, then commit. The check runs the real
 * server-side resolution with `dryRun`, so what the scheduler approves is
 * exactly what will be written (plan section 44).
 */
export function ImportDialog({ open, onClose, onImported }: Props) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [checked, setChecked] = useState<ImportResponse | null>(null);

  const reset = () => {
    setText('');
    setParsed(null);
    setChecked(null);
  };

  const run = useMutation({
    mutationFn: (dryRun: boolean) => {
      const rows = (parsed ?? parsePersonnelCsv(text)).rows;
      return api.post<ImportResponse>('/personnel/import', { rows, dryRun });
    },
    onSuccess: (result) => {
      setChecked(result);
      if (!result.dryRun) {
        toast.push('success', t('personnel.importDone', { count: result.imported }));
        onImported();
        reset();
        onClose();
      }
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const handleText = (value: string) => {
    setText(value);
    setChecked(null);
    setParsed(value.trim() ? parsePersonnelCsv(value) : null);
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

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${CSV_TEMPLATE}`], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personnel-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const problems = parsed?.problems ?? [];
  const skipped = (checked?.outcomes ?? []).filter((outcome) => outcome.status !== 'create');

  return (
    <Dialog
      open={open}
      size="lg"
      title={t('personnel.importTitle')}
      description={t('personnel.importHint')}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('app.cancel')}
          </Button>
          <Button
            variant="secondary"
            disabled={!parsed || parsed.rows.length === 0}
            loading={run.isPending && run.variables === true}
            onClick={() => run.mutate(true)}
          >
            {t('personnel.importCheck')}
          </Button>
          <Button
            icon={<Upload className="size-4" />}
            disabled={!checked || checked.willCreate === 0}
            loading={run.isPending && run.variables === false}
            onClick={() => run.mutate(false)}
          >
            {t('personnel.importConfirm', { count: checked?.willCreate ?? 0 })}
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
            {t('personnel.importChooseFile')}
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            {t('personnel.importTemplate')}
          </Button>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('personnel.importPaste')}
          <Textarea
            dir="ltr"
            className="min-h-32 font-mono text-xs"
            value={text}
            onChange={(event) => handleText(event.target.value)}
          />
        </label>

        {parsed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="brand">{t('personnel.importReady', { count: parsed.rows.length })}</Badge>
            {problems.length > 0 ? (
              <Badge tone="warning">
                {t('personnel.importSkipped', { count: problems.length })}
              </Badge>
            ) : null}
            <span className="text-xs text-ink-muted">
              {t('personnel.importColumns')}: {parsed.columns.join(', ') || '—'}
            </span>
          </div>
        ) : null}

        {problems.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-sm font-semibold">{t('personnel.importProblems')}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {problems.slice(0, 20).map((problem) => (
                <li key={`${problem.line}-${problem.message}`} className="text-danger">
                  {t('personnel.importLine', { line: problem.line })}: {problem.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {checked ? (
          <section className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-sunken p-3">
            <p className="text-xs text-ink-muted">{t('personnel.importDryRunNote')}</p>
            {checked.createdUnits.length > 0 ? (
              <p className="text-sm">
                {t('personnel.importNewUnits', { names: checked.createdUnits.join(', ') })}
              </p>
            ) : null}
            {checked.createdQualifications.length > 0 ? (
              <p className="text-sm">
                {t('personnel.importNewQualifications', {
                  names: checked.createdQualifications.join(', '),
                })}
              </p>
            ) : null}
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
                      <Td>{outcome.displayName}</Td>
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
