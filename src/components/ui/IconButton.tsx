import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import clsx from 'clsx';
type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>;
export function IconButton({ label, className, children, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={clsx('icon-button', className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
