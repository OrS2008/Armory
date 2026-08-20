import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/app/layouts/AppShell';
import { RequireAuth } from '@/app/router/RequireAuth';
import { ErrorState } from '@/components/ui/States';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ScheduleBoardPage } from '@/features/schedule/ScheduleBoardPage';
import { ConflictsPage } from '@/features/schedule/ConflictsPage';
import { PersonnelPage } from '@/features/personnel/PersonnelPage';
import { AvailabilityPage } from '@/features/availability/AvailabilityPage';
import { AssignmentTypesPage } from '@/features/assignments/AssignmentTypesPage';
import { ReplacementsPage } from '@/features/replacements/ReplacementsPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { MySchedulePage } from '@/features/me/MySchedulePage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <ErrorState error={new Error('route')} />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'schedule', element: <ScheduleBoardPage /> },
      { path: 'schedule/conflicts', element: <ConflictsPage /> },
      { path: 'personnel', element: <PersonnelPage /> },
      { path: 'availability', element: <AvailabilityPage /> },
      { path: 'assignment-types', element: <AssignmentTypesPage /> },
      { path: 'replacements', element: <ReplacementsPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'me', element: <MySchedulePage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
