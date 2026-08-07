export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'API_ERROR') { super(message); }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v2${path}`, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json().catch(() => null) as {error?:{message?:string;code?:string}} | null;
  if (!response.ok) throw new ApiError(response.status, data?.error?.message ?? 'הפעולה נכשלה', data?.error?.code);
  return data as T;
}
export type AdminUser = { id:string; username:string; displayName:string; role:'admin'|'editor'|'viewer'; permissions?:string[] };
export type SubmissionInput = { actionType:string; fullName:string; personalId:string; phone:string; department:string; payload:Record<string,string> };
export const api = {
  me: () => request<{ok:true;user:AdminUser}>('/auth/me'),
  login: (username:string,password:string) => request<{ok:true;user:AdminUser}>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  logout: () => request<{ok:true}>('/auth/logout',{method:'POST'}),
  createSubmission: (input:SubmissionInput) => request<{ok:true;id:string;status:string}>('/submissions',{method:'POST',body:JSON.stringify(input)}),
};
