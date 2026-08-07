export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'API_ERROR',
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v2${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok)
    throw new ApiError(response.status, data?.error?.message ?? 'הפעולה נכשלה', data?.error?.code);
  return data as T;
}
export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  permissions?: string[];
};
export type SubmissionInput = {
  actionType: string;
  fullName: string;
  personalId: string;
  phone: string;
  department: string;
  payload: Record<string, string>;
};
export type Submission = {
  id: string;
  action_type: string;
  personal_id: string;
  full_name: string;
  phone: string;
  department: string;
  payload_json: string;
  status: string;
  created_at: number;
  updated_at: number;
};
export type Asset = {
  id: string;
  module: string;
  category: string;
  name: string;
  serial_number: string | null;
  owner_name: string | null;
  quantity: number;
  issued_quantity: number;
  location: string;
  status: string;
};
export type EquipmentLine = { id: string; signature_id: string; equipment_item_id: string; name: string; issued_quantity: number; returned_quantity: number };
export type LicenseRecord = { type: 'civilian' | 'military'; license_number: string; expires_at: number; status: string; document_object_key: string; document_name: string };
export type EquipmentSignature = { id: string; status: string; soldier_id: string; personal_id: string; full_name: string; phone: string; department: string; weapon_serial: string | null; amral_serial: string | null; scope_serial: string | null; soldier_note: string | null; signature_object_key: string; signed_at: number; approved_at: number | null; lines: EquipmentLine[]; licenses: LicenseRecord[] };
export type WeaponDeposit = { id:string; status:string; full_name:string; personal_id:string; phone:string; department:string; weapon_serial:string; amral_serial:string|null; scope_serial:string|null; note:string|null; created_at:number };
export type BuildingFault = { id:string; reporter_name:string; personal_id:string|null; phone:string; department:string|null; location:string; category:string; description:string; status:string; created_at:number };
export const api = {
  me: () => request<{ ok: true; user: AdminUser }>('/auth/me'),
  login: (username: string, password: string) =>
    request<{ ok: true; user: AdminUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  createSubmission: (input: SubmissionInput) =>
    request<{ ok: true; id: string; status: string }>('/submissions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  submissions: (params?: { type?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.type) search.set('type', params.type);
    if (params?.status) search.set('status', params.status);
    return request<{ ok: true; items: Submission[] }>(`/submissions?${search}`);
  },
  updateSubmission: (id: string, status: string) =>
    request<{ ok: true; status: string }>(`/submissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  assets: (module: string) =>
    request<{ ok: true; items: Asset[] }>(`/assets?module=${encodeURIComponent(module)}`),
  createAsset: (input: {
    module: string;
    name: string;
    category: string;
    quantity: number;
    serialNumber?: string;
    ownerName?: string;
  }) =>
    request<{ ok: true; id: string }>('/assets', { method: 'POST', body: JSON.stringify(input) }),
  uploadDocument: async (kind: 'signature' | 'civilian_license' | 'military_license' | 'fuel_receipt', file: Blob, name = 'document.png') => {
    const form = new FormData(); form.set('kind', kind); form.set('file', file, name);
    const response = await fetch('/api/v2/documents', { method: 'POST', body: form, credentials: 'same-origin' });
    const data = await response.json() as { ok?:boolean; key?:string; name?:string; type?:string; size?:number; error?:{message?:string} };
    if (!response.ok || !data.key) throw new ApiError(response.status, data.error?.message ?? 'העלאת המסמך נכשלה');
    return data as { ok:true; key:string; name:string; type:string; size:number };
  },
  createEquipmentSignature: (input: Record<string, unknown>) => request<{ok:true;id:string;status:string}>('/equipment-signatures',{method:'POST',body:JSON.stringify(input)}),
  equipmentSignatures: () => request<{ok:true;items:EquipmentSignature[]}>('/equipment-signatures'),
  updateEquipmentSignature: (id:string, input:Record<string,unknown>) => request<{ok:true;status?:string;returnedQuantity?:number}>(`/equipment-signatures/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
  createWeaponDeposit: (input:Record<string,unknown>) => request<{ok:true;id:string;status:string}>('/weapon-deposits',{method:'POST',body:JSON.stringify(input)}),
  weaponDeposits: () => request<{ok:true;items:WeaponDeposit[]}>('/weapon-deposits'),
  updateWeaponDeposit: (id:string,action:string) => request<{ok:true;status:string}>(`/weapon-deposits/${id}`,{method:'PATCH',body:JSON.stringify({action})}),
  createBuildingFault: (input:Record<string,unknown>) => request<{ok:true;id:string;status:string}>('/building-faults',{method:'POST',body:JSON.stringify(input)}),
  buildingFaults: () => request<{ok:true;items:BuildingFault[]}>('/building-faults'),
  updateBuildingFault: (id:string,status:string) => request<{ok:true;status:string}>(`/building-faults/${id}`,{method:'PATCH',body:JSON.stringify({status})}),
  createRefuelReport: (input:Record<string,unknown>) => request<{ok:true;id:string;status:string}>('/refuel-reports',{method:'POST',body:JSON.stringify(input)}),
  refuelReports: () => request<{ok:true;items:Array<Record<string,unknown>>}>('/refuel-reports'),
  updateRefuelReport: (id:string,action:string) => request<{ok:true;status:string}>(`/refuel-reports/${id}`,{method:'PATCH',body:JSON.stringify({action})}),
  fuelCards: () => request<{ok:true;items:Array<Record<string,unknown>>}>('/fuel-cards'),
  createFuelCard: (input:Record<string,unknown>) => request<{ok:true;id:string}>('/fuel-cards',{method:'POST',body:JSON.stringify(input)}),
  equipmentLoans: () => request<{ok:true;items:Array<Record<string,unknown>>}>('/equipment-loans'),
  createEquipmentLoan: (input:Record<string,unknown>) => request<{ok:true;id:string}>('/equipment-loans',{method:'POST',body:JSON.stringify(input)}),
  returnEquipmentLoan: (id:string) => request<{ok:true;status:string}>(`/equipment-loans/${id}`,{method:'PATCH',body:'{}'}),
  dashboard: () => request<{ok:true;metrics:{soldiers:number;pending:number;outstanding:number;faults:number;deposits:number;shortages:number;fuelCards:number;fuelLitres:number};equipment:Array<{name:string;issued:number;returned:number}>;recent:Array<{id:string;status:string;created_at:number;full_name:string;kind:string}>}>('/dashboard'),
};
