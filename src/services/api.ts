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
};
