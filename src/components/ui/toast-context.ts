import { createContext, use } from 'react';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}

export interface ToastApi {
  push: (tone: Toast['tone'], message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = use(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
