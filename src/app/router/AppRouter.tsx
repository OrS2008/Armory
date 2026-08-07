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
import { ArmoryPage, FaultsPage, LicensesPage } from '@/features/modules/LifecycleModulePage';
import { FuelManagementPage, InventoryLoansPage } from '@/features/modules/LogisticsPage';
import { ReportsPage } from '@/features/modules/ReportsPage';

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
      { path: 'equipment', element: <SoldiersPage /> },
      { path: 'armory', element: <ArmoryPage /> },
      { path: 'faults', element: <FaultsPage /> },
      { path: 'licenses', element: <LicensesPage /> },
      { path: 'vehicles', element: <FuelManagementPage /> },
      { path: 'inventory', element: <InventoryLoansPage /> },
      { path: 'communications', element: <InventoryLoansPage module="communications" title="ציוד קשר" eyebrow="מחסן קשר" /> },
      { path: 'ammunition', element: <InventoryLoansPage module="ammunition" title="תחמושת ואלפא" eyebrow="הקצאות והחזרות" /> },
      { path: 'tzelem', element: <ReportsPage stocktake /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: ':moduleId', element: <OperationalModulePage /> },
      { path: '*', element: <Navigate to="/admin" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
