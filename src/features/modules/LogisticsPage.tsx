import { Check, Plus, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/services/api';

const str = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const num = (value: unknown) => Number(value ?? 0);
const field = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

export function FuelManagementPage() {
  const client = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const cards = useQuery({ queryKey: ['fuel-cards'], queryFn: api.fuelCards });
  const reports = useQuery({ queryKey: ['refuel-reports'], queryFn: api.refuelReports });
  const create = useMutation({
    mutationFn: api.createFuelCard,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['fuel-cards'] });
      setDialog(false);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.updateRefuelReport(id, action),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['refuel-reports'] }),
        client.invalidateQueries({ queryKey: ['fuel-cards'] }),
      ]);
    },
  });
  const cardRows = cards.data?.items ?? [];
  const reportRows = reports.data?.items ?? [];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({ cardNumber: field(data, 'cardNumber'), fuelType: field(data, 'fuelType'), holder: field(data, 'holder'), litresBalance: Number(field(data, 'litresBalance')) });
  };
  return <section className="page compact-page">
    <header className="page-title"><div><span className="eyebrow">רכב ודלק</span><h1>כרטיסי תדלוק ודיווחים</h1><p>יתרות כרטיסים ודיווחים שמחכים לאישור.</p></div><Button variant="primary" onClick={() => setDialog(true)}><Plus />הוספת כרטיס</Button></header>
    <div className="module-stats"><article><span>כרטיסים פעילים</span><strong>{cardRows.filter((x) => str(x.status) === 'active').length}</strong><small>רשומים במערכת</small></article><article><span>ליטרים זמינים</span><strong>{cardRows.reduce((sum, x) => sum + num(x.litres_balance), 0).toFixed(1)}</strong><small>בכל הכרטיסים</small></article><article><span>דיווחים ממתינים</span><strong>{reportRows.filter((x) => str(x.status) === 'pending').length}</strong><small>דורשים אישור</small></article></div>
    <section className="section-card module-table-card"><header><div><h2>כרטיסי תדלוק</h2><p>אישור דיווח מפחית אוטומטית מהיתרה.</p></div></header><div className="module-table-wrap"><table><thead><tr><th>מספר</th><th>דלק</th><th>מחזיק</th><th>יתרה</th></tr></thead><tbody>{cardRows.map((x) => <tr key={str(x.id)}><td dir="ltr">{str(x.card_number)}</td><td>{str(x.fuel_type) === 'diesel' ? 'סולר' : str(x.fuel_type) === 'gasoline' ? 'בנזין' : 'אחר'}</td><td>{str(x.holder)}</td><td><strong>{num(x.litres_balance).toFixed(1)} ל׳</strong></td></tr>)}</tbody></table></div></section>
    <section className="section-card module-table-card"><header><div><h2>דיווחי תדלוק</h2><p>בדיקה ואישור מול הכרטיס והקבלה.</p></div></header><div className="module-table-wrap"><table><thead><tr><th>מדווח</th><th>רכב</th><th>כרטיס</th><th>ליטרים</th><th>קבלה</th><th>סטטוס</th><th>פעולה</th></tr></thead><tbody>{reportRows.map((x) => <tr key={str(x.id)}><td>{str(x.reporter_name)}<small>{str(x.personal_id)}</small></td><td dir="ltr">{str(x.vehicle_number)}</td><td dir="ltr">{str(x.card_number)}</td><td>{num(x.litres)} ל׳</td><td><Button size="sm" onClick={() => window.open(`/api/v2/documents?key=${encodeURIComponent(str(x.receipt_object_key))}`, '_blank')}>צפייה</Button></td><td><StatusBadge tone={str(x.status) === 'pending' ? 'warning' : str(x.status) === 'approved' ? 'success' : 'neutral'}>{str(x.status) === 'pending' ? 'ממתין' : str(x.status) === 'approved' ? 'אושר' : 'נדחה'}</StatusBadge></td><td>{str(x.status) === 'pending' && <div className="row-actions"><Button size="sm" variant="primary" onClick={() => update.mutate({ id: str(x.id), action: 'approve' })}><Check />אישור וקיזוז</Button><Button size="sm" onClick={() => update.mutate({ id: str(x.id), action: 'reject' })}>דחייה</Button></div>}</td></tr>)}</tbody></table></div></section>
    <Dialog open={dialog} title="הוספת כרטיס תדלוק" onClose={() => setDialog(false)}><form className="dialog-form" onSubmit={submit}><label>מספר כרטיס<input name="cardNumber" required dir="ltr" /></label><label>סוג דלק<select name="fuelType" defaultValue="diesel"><option value="diesel">סולר</option><option value="gasoline">בנזין</option><option value="other">אחר</option></select></label><label>מחזיק<input name="holder" defaultValue="משרד רכב" required /></label><label>יתרה בליטרים<input name="litresBalance" type="number" min="0" step="0.1" required /></label>{create.error && <div className="login-error">{create.error.message}</div>}<div className="dialog-actions"><Button type="button" onClick={() => setDialog(false)}>ביטול</Button><Button type="submit" variant="primary">שמירת כרטיס</Button></div></form></Dialog>
  </section>;
}

export function InventoryLoansPage({ module = 'inventory', title = 'השאלות ציוד', eyebrow = 'מלאי תפעולי' }: { module?: string; title?: string; eyebrow?: string }) {
  const client = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [assetDialog, setAssetDialog] = useState(false);
  const assets = useQuery({ queryKey: ['assets', module], queryFn: () => api.assets(module) });
  const loans = useQuery({ queryKey: ['equipment-loans'], queryFn: api.equipmentLoans });
  const refresh = async () => Promise.all([client.invalidateQueries({ queryKey: ['equipment-loans'] }), client.invalidateQueries({ queryKey: ['assets', module] })]);
  const create = useMutation({ mutationFn: api.createEquipmentLoan, onSuccess: async () => { await refresh(); setDialog(false); } });
  const createAsset = useMutation({ mutationFn: api.createAsset, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['assets', module] }); setAssetDialog(false); } });
  const returned = useMutation({ mutationFn: api.returnEquipmentLoan, onSuccess: refresh });
  const rows = (loans.data?.items ?? []).filter((row) => str(row.module) === module);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); create.mutate({ assetId: field(data, 'assetId'), borrowerName: field(data, 'borrowerName'), borrowerPersonalId: field(data, 'borrowerPersonalId'), destination: field(data, 'destination'), quantity: Number(field(data, 'quantity')), note: field(data, 'note') }); };
  const submitAsset = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); createAsset.mutate({ module, name: field(data, 'name'), category: field(data, 'category'), quantity: Number(field(data, 'quantity')), serialNumber: field(data, 'serialNumber') }); };
  return <section className="page compact-page">
    <header className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>מסירה, יעד, כמות והחזרה שמעדכנת את המלאי.</p></div><div className="page-actions"><Button onClick={() => setAssetDialog(true)}><Plus />הוספת פריט</Button><Button variant="primary" onClick={() => setDialog(true)} disabled={!assets.data?.items.length}><Plus />השאלה חדשה</Button></div></header>
    <div className="module-stats"><article><span>השאלות פתוחות</span><strong>{rows.filter((x) => str(x.status) === 'open').length}</strong><small>טרם הוחזרו</small></article><article><span>יחידות בחוץ</span><strong>{rows.filter((x) => str(x.status) === 'open').reduce((sum, x) => sum + num(x.quantity), 0)}</strong><small>בכל היעדים</small></article><article><span>הוחזרו</span><strong>{rows.filter((x) => str(x.status) === 'returned').length}</strong><small>השאלות שנסגרו</small></article></div>
    <section className="section-card module-table-card"><header><div><h2>יומן השאלות</h2><p>כל השאלה נשארת ביומן גם לאחר ההחזרה.</p></div></header><div className="module-table-wrap"><table><thead><tr><th>ציוד</th><th>שואל</th><th>יעד</th><th>כמות</th><th>סטטוס</th><th>פעולה</th></tr></thead><tbody>{rows.map((x) => <tr key={str(x.id)}><td>{str(x.asset_name)}</td><td>{str(x.borrower_name)}<small>{str(x.borrower_personal_id)}</small></td><td>{str(x.destination)}</td><td>{num(x.quantity)}</td><td><StatusBadge tone={str(x.status) === 'open' ? 'warning' : 'success'}>{str(x.status) === 'open' ? 'בחוץ' : 'הוחזר'}</StatusBadge></td><td>{str(x.status) === 'open' && <Button size="sm" onClick={() => window.confirm('לאשר החזרת ההשאלה?') && returned.mutate(str(x.id))}><RotateCcw />קליטת החזרה</Button>}</td></tr>)}</tbody></table></div></section>
    <Dialog open={dialog} title="השאלת ציוד" onClose={() => setDialog(false)}><form className="dialog-form" onSubmit={submit}><label>פריט<select name="assetId" required defaultValue=""><option value="" disabled>בחירת פריט</option>{(assets.data?.items ?? []).filter((x) => x.quantity > x.issued_quantity).map((x) => <option key={x.id} value={x.id}>{x.name} — {x.quantity - x.issued_quantity} זמינים</option>)}</select></label><label>שם השואל<input name="borrowerName" required /></label><label>מספר אישי<input name="borrowerPersonalId" dir="ltr" /></label><label>יעד / משימה<input name="destination" required /></label><label>כמות<input name="quantity" type="number" min="1" required /></label><label>הערה<textarea name="note" /></label>{create.error && <div className="login-error">{create.error.message}</div>}<div className="dialog-actions"><Button type="button" onClick={() => setDialog(false)}>ביטול</Button><Button type="submit" variant="primary">אישור מסירה</Button></div></form></Dialog>
    <Dialog open={assetDialog} title={`הוספת פריט — ${title}`} onClose={() => setAssetDialog(false)}><form className="dialog-form" onSubmit={submitAsset}><label>שם הפריט<input name="name" required /></label><label>קטגוריה<input name="category" required /></label><label>כמות במלאי<input name="quantity" type="number" min="0" required /></label><label>מספר סידורי <em>לא חובה</em><input name="serialNumber" dir="ltr" /></label>{createAsset.error && <div className="login-error">{createAsset.error.message}</div>}<div className="dialog-actions"><Button type="button" onClick={() => setAssetDialog(false)}>ביטול</Button><Button type="submit" variant="primary">שמירת פריט</Button></div></form></Dialog>
  </section>;
}
