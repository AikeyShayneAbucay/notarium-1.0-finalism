import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth';
import { ClientAuthService } from './client-auth';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.user ? true : router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.user?.role === 'admin' ? true : router.createUrlTree(['/dashboard']);
};

/** Portal pages require a signed-in Gmail (Google) client account. */
export const clientGuard: CanActivateFn = async () => {
  const clients = inject(ClientAuthService);
  const router = inject(Router);
  await clients.ready();
  if (clients.isClient()) return true;
  return router.createUrlTree(['/portal']);
};
