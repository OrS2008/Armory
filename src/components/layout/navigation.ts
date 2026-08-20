import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Repeat2,
  Settings,
  UserCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Permissions, type Permission } from '@shared/rbac';
import type { TranslationKey } from '@/i18n';

export interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  permission?: Permission;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
}

export const navItems: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, primary: true },
  {
    to: '/schedule',
    labelKey: 'nav.schedule',
    icon: CalendarDays,
    permission: Permissions.assignmentsRead,
    primary: true,
  },
  {
    to: '/personnel',
    labelKey: 'nav.personnel',
    icon: Users,
    permission: Permissions.personnelRead,
    primary: true,
  },
  {
    to: '/availability',
    labelKey: 'nav.availability',
    icon: UserCheck,
    permission: Permissions.availabilityRead,
  },
  {
    to: '/assignment-types',
    labelKey: 'nav.assignments',
    icon: ClipboardList,
    permission: Permissions.assignmentTypesRead,
  },
  { to: '/replacements', labelKey: 'nav.replacements', icon: Repeat2 },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, primary: true },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    icon: BarChart3,
    permission: Permissions.reportsRead,
  },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, permission: Permissions.rulesRead },
];

export const personalNavItem: NavItem = {
  to: '/me',
  labelKey: 'nav.mySchedule',
  icon: CalendarDays,
  primary: true,
};
