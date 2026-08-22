import {
  AVAILABILITY_COLUMN_LABELS,
  AVAILABILITY_CSV_TEMPLATE,
  parseAvailabilityCsv,
  type AvailabilityColumn,
  type AvailabilityImportRow,
} from '@shared/csv';
import { t } from '@/i18n';
import { CsvImportDialog, type ImportOutcome } from '@/components/import/CsvImportDialog';

interface AvailabilityOutcome extends ImportOutcome {
  person: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/** Availability import: a leave sheet, straight from the file it arrives in. */
export function AvailabilityImportDialog({ open, onClose, onImported }: Props) {
  return (
    <CsvImportDialog<AvailabilityImportRow, AvailabilityOutcome>
      open={open}
      title={t('availability.importTitle')}
      description={t('availability.importHint')}
      endpoint="/availability/import"
      templateCsv={AVAILABILITY_CSV_TEMPLATE}
      templateFileName="availability-template.csv"
      parse={parseAvailabilityCsv}
      columnLabel={(column) => AVAILABILITY_COLUMN_LABELS[column as AvailabilityColumn] ?? column}
      outcomeName={(outcome) => outcome.person}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
