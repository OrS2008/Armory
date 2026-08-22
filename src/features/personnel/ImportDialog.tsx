import {
  COLUMN_LABELS,
  CSV_TEMPLATE,
  parsePersonnelCsv,
  type ImportRow,
  type PersonnelColumn,
} from '@shared/csv';
import { t } from '@/i18n';
import {
  CsvImportDialog,
  type ImportOutcome,
  type ImportResult,
} from '@/components/import/CsvImportDialog';

interface PersonnelOutcome extends ImportOutcome {
  displayName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/** Roster import. The dialog mechanics are shared; this names the columns. */
export function ImportDialog({ open, onClose, onImported }: Props) {
  return (
    <CsvImportDialog<ImportRow, PersonnelOutcome>
      open={open}
      title={t('personnel.importTitle')}
      description={t('personnel.importHint')}
      endpoint="/personnel/import"
      templateCsv={CSV_TEMPLATE}
      templateFileName="personnel-template.csv"
      parse={parsePersonnelCsv}
      columnLabel={(column) => COLUMN_LABELS[column as PersonnelColumn] ?? column}
      outcomeName={(outcome) => outcome.displayName}
      summary={(result: ImportResult<PersonnelOutcome> & Partial<CreatedNames>) => (
        <>
          {result.createdUnits && result.createdUnits.length > 0 ? (
            <p className="text-sm">
              {t('personnel.importNewUnits', { names: result.createdUnits.join(', ') })}
            </p>
          ) : null}
          {result.createdQualifications && result.createdQualifications.length > 0 ? (
            <p className="text-sm">
              {t('personnel.importNewQualifications', {
                names: result.createdQualifications.join(', '),
              })}
            </p>
          ) : null}
        </>
      )}
      onClose={onClose}
      onImported={onImported}
    />
  );
}

/** The roster import also reports the units and qualifications it invented. */
interface CreatedNames {
  createdUnits: string[];
  createdQualifications: string[];
}
