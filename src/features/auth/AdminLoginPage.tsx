import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';

export function AdminLoginPage() {
  const navigate=useNavigate(); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [authenticated,setAuthenticated]=useState(false);
  if(authenticated) return <Navigate to="/admin" replace />;
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setLoading(true);setError('');const data=new FormData(event.currentTarget);try{await api.login(String(data.get('username')),String(data.get('password')));setAuthenticated(true);navigate('/admin',{replace:true});}catch(cause){setError(cause instanceof Error?cause.message:'ההתחברות נכשלה');}finally{setLoading(false);}};
  return <main className="login-page"><section className="login-card"><header><span className="brand-mark"><ShieldCheck /></span><div><span>Armory</span><h1>כניסה לפאנל הניהול</h1><p>התחברו עם חשבון מורשה כדי לצפות במידע התפעולי.</p></div></header><form onSubmit={submit}><label><span>שם משתמש</span><input name="username" autoComplete="username" required autoFocus /></label><label><span>סיסמה</span><input name="password" type="password" autoComplete="current-password" minLength={10} required /></label>{error&&<div className="login-error" role="alert">{error}</div>}<Button variant="primary" type="submit" disabled={loading}><LockKeyhole />{loading?'מתחבר…':'כניסה מאובטחת'}</Button></form></section></main>;
}
