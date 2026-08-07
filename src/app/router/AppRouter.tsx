import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AdminShell } from '@/app/layouts/AdminShell';
import { PublicShell } from '@/app/layouts/PublicShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SoldiersPage } from '@/features/soldiers/SoldiersPage';
import { EmptyModulePage } from '@/components/feedback/EmptyModulePage';
import { SoldierHomePage } from '@/features/public/SoldierHomePage';
import { SoldierActionPage } from '@/features/public/SoldierActionPage';
import { OperationalModulePage } from '@/features/modules/OperationalModulePage';
import { AdminLoginPage } from '@/features/auth/AdminLoginPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicShell />,
    children: [
      { index: true, element: <SoldierHomePage /> },
      { path: 'action/:actionId', element: <SoldierActionPage /> },
    ],
  },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <AdminShell />,
    errorElement: (
      <EmptyModulePage title="העמוד אינו זמין" description="אירעה שגיאה בטעינת המסך." />
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'soldiers', element: <SoldiersPage /> },
      { path: ':moduleId', element: <OperationalModulePage /> },
      { path: '*', element: <Navigate to="/admin" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
