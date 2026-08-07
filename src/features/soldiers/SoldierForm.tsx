import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { soldierFormSchema, type SoldierFormValues } from './soldier.schema';

export function SoldierForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: SoldierFormValues | undefined;
  onCancel: () => void;
  onSubmit: (values: SoldierFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SoldierFormValues>({
    resolver: zodResolver(soldierFormSchema),
    defaultValues: initial ?? { fullName: '', personalId: '', department: '', phone: '' },
  });
  return (
    <form className="form" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
      <div className="form-grid">
        <label>
          <span>שם מלא</span>
          <input {...register('fullName')} autoComplete="name" aria-invalid={!!errors.fullName} />
          {errors.fullName && <small role="alert">{errors.fullName.message}</small>}
        </label>
        <label>
          <span>מספר אישי</span>
          <input
            {...register('personalId')}
            inputMode="numeric"
            dir="ltr"
            aria-invalid={!!errors.personalId}
          />
          {errors.personalId && <small role="alert">{errors.personalId.message}</small>}
        </label>
        <label>
          <span>מחלקה</span>
          <select {...register('department')} aria-invalid={!!errors.department}>
            <option value="">בחירת מחלקה</option>
            <option>מחלקה 1</option>
            <option>מחלקה 2</option>
            <option>מחלקה 3</option>
            <option>מפל״ג</option>
          </select>
          {errors.department && <small role="alert">{errors.department.message}</small>}
        </label>
        <label>
          <span>טלפון</span>
          <input
            {...register('phone')}
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
          />
          {errors.phone && <small role="alert">{errors.phone.message}</small>}
        </label>
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <Button variant="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'שומר…' : 'שמירה'}
        </Button>
      </div>
    </form>
  );
}
