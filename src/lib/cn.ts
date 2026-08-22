import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts in the caller's favour.
 *
 * Plain clsx keeps both `w-full` and `w-24`, and which one wins is decided by
 * the order Tailwind happened to emit them in — so a component's base class
 * could silently beat the override passed in beside it.
 */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
