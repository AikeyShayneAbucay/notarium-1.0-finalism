import { Routes } from '@angular/router';
import { authGuard, adminGuard, clientGuard } from './core/guards';
import { Login } from './pages/login/login';
import { Layout } from './layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { Records } from './pages/records/records';
import { Reports } from './pages/reports/reports';
import { Staff } from './pages/staff/staff';
import { DocTypes } from './pages/doctypes/doctypes';
import { ActivityLogComponent } from './pages/activity-log/activity-log';
import { AppointmentsPage } from './pages/appointments/appointments';
import { PortalLayout } from './portal/portal-layout';
import { PortalWelcome } from './portal/welcome';
import { PortalBook } from './portal/book';
import { PortalMyAppointments } from './portal/my-appointments';

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
      { path: 'appointments', component: AppointmentsPage, data: { title: 'Appointment Management' } },
      { path: 'reports', component: Reports, data: { title: 'Reports' } },
      { path: 'activity-log', component: ActivityLogComponent, data: { title: 'Activity Log' } },
      { path: 'staff', component: Staff, data: { title: 'Staff Accounts' }, canActivate: [adminGuard] },
      { path: 'document-types', component: DocTypes, data: { title: 'Document Types' } },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'portal',
    component: PortalLayout,
    children: [
      { path: '', component: PortalWelcome, data: { title: 'NOTARIX — Online Appointments' } },
      { path: 'book', component: PortalBook, canActivate: [clientGuard], data: { title: 'Book Appointment' } },
      {
        path: 'appointments',
        component: PortalMyAppointments,
        canActivate: [clientGuard],
        data: { title: 'My Appointments' },
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
