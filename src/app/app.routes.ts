import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards';
import { Login } from './pages/login/login';
import { Layout } from './layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { Records } from './pages/records/records';
import { Reports } from './pages/reports/reports';
import { Staff } from './pages/staff/staff';
import { DocTypes } from './pages/doctypes/doctypes';
import { ActivityLogComponent } from './pages/activity-log/activity-log';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login, data: { title: 'Sign In' } },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard, data: { title: 'Dashboard' } },
      { path: 'records', component: Records, data: { title: 'Notarization Records' } },
      { path: 'reports', component: Reports, data: { title: 'Reports' } },
      { path: 'activity-log', component: ActivityLogComponent, data: { title: 'Activity Log' } },
      { path: 'staff', component: Staff, data: { title: 'Staff Accounts' }, canActivate: [adminGuard] },
      { path: 'document-types', component: DocTypes, data: { title: 'Document Types' } },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
