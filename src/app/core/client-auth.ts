import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase';
import { environment } from '../../environments/environment';

export interface ClientAccount {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

/** Returns true when the email is a personal Google account (Gmail). */
export function isGmailAddress(email: string): boolean {
  const e = (email || '').trim().toLowerCase();
  return e.endsWith('@gmail.com') || e.endsWith('@googlemail.com');
}

@Injectable({ providedIn: 'root' })
export class ClientAuthService {
  private sb = inject(SupabaseService);

  /** Signed-in Google client, or null while loading / signed out. */
  readonly account = signal<ClientAccount | null>(null);
  /** True until the initial session check finishes. */
  readonly loading = signal(true);

  private readyResolve!: (val: boolean) => void;
  private readonly readyPromise = new Promise<boolean>((resolve) => {
    this.readyResolve = resolve;
  });

  constructor() {
    this.sb.client.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
      this.loading.set(false);
      this.readyResolve(this.isClient());
    });
    this.sb.client.auth.getSession().then(({ data }) => {
      this.applySession(data.session);
      this.loading.set(false);
      this.readyResolve(this.isClient());
    });
  }

  /** Resolves when the initial Supabase session check has finished. */
  async ready(): Promise<boolean> {
    return this.readyPromise;
  }

  private applySession(session: import('@supabase/supabase-js').Session | null): void {
    if (!session?.user) {
      this.account.set(null);
      return;
    }
    const email = session.user.email ?? '';
    const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta['full_name'] === 'string' && meta['full_name']) ||
      (typeof meta['name'] === 'string' && meta['name']) ||
      email.split('@')[0];
    const avatar = typeof meta['avatar_url'] === 'string' ? meta['avatar_url'] : '';
    this.account.set({ id: session.user.id, email, name, avatarUrl: avatar });
  }

  /** Valid client session = signed in with a Gmail account. */
  isClient(): boolean {
    const acc = this.account();
    return !!acc && isGmailAddress(acc.email);
  }

  /**
   * Starts the Google OAuth flow. The browser is redirected to Google and
   * back to the portal after consent. Returns an error message, or null.
   */
  async signInWithGoogle(): Promise<string | null> {
    try {
      // Pre-check the public auth settings so an unconfigured provider shows
      // a friendly message in the app instead of Supabase's raw JSON error.
      const settings = await this.providerSettings();
      if (settings && settings.google === false) {
        return 'provider is not enabled';
      }

      const { error } = await this.sb.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/portal/appointments',
        },
      });
      if (error) return error.message;
      return null; // browser redirects to Google
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Unable to start Google sign-in.';
    }
  }

  /** Reads the public /auth/v1/settings endpoint (null when unreachable). */
  private async providerSettings(): Promise<{ google: boolean } | null> {
    try {
      const base = environment.supabaseUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/auth/v1/settings`, {
        headers: { apikey: environment.supabasePublishableKey },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { external?: Record<string, boolean> };
      return { google: !!body.external?.['google'] };
    } catch {
      return null;
    }
  }

  /**
   * Signs out a non-Gmail (e.g. staff) session so the visitor can retry
   * with a Google account. Returns to the welcome page afterwards.
   */
  async signOut(): Promise<void> {
    this.account.set(null);
    await this.sb.client.auth.signOut();
  }
}
