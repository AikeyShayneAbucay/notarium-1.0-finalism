import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClientAuthService, isGmailAddress } from '../core/client-auth';
import { SettingsService } from '../core/settings';
import { UiIcon } from '../shared/icon';
import { LogoMark } from '../shared/logo';

@Component({
  selector: 'app-portal-welcome',
  imports: [RouterLink, UiIcon, LogoMark],
  template: `
    <div class="wl">
      <!-- Hero -->
      <section class="wl-hero">
        <div class="wl-hero-card">
          <div class="wl-logo"><app-logo-mark tone="color" [logoWidth]="110" /></div>
          <h1 class="wl-title">NOTARIX</h1>
          <p class="wl-tag">Online Appointment System</p>
          <p class="wl-sub">
            Book a notarization appointment with <b>{{ settings.settings.name }}</b> —
            choose your document, pick a schedule, and track your request online.
          </p>

          @if (notice()) {
            <div class="wl-notice">
              <ui-icon name="close" size="14" />
              <span>{{ notice() }}</span>
            </div>
          }

          @if (clients.loading()) {
            <button class="wl-google" type="button" disabled>
              <span class="wl-spinner"></span> Checking session…
            </button>
          } @else if (clients.account(); as acc) {
            @if (!isGmail(acc.email)) {
              <div class="wl-notice warn">
                <ui-icon name="close" size="14" />
                <span>
                  You are signed in as <b>{{ acc.email }}</b>, which is not a Gmail address.
                  Please sign out and continue with a Google (Gmail) account.
                </span>
              </div>
              <button class="wl-google" type="button" (click)="signOut()">
                <ui-icon name="logout" size="17" /> Sign out and retry
              </button>
            } @else {
              <a class="wl-google" routerLink="/portal/book">
                <ui-icon name="calendar" size="17" /> Continue as {{ acc.name }}
              </a>
              <a class="wl-link" routerLink="/portal/appointments">View my appointments</a>
            }
          } @else {
            <button class="wl-google" type="button" (click)="signIn()" [disabled]="busy">
              @if (busy) {
                <span class="wl-spinner"></span> Redirecting…
              } @else {
                <svg class="wl-glogo" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"/>
                  <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
                </svg>
                Continue with Google
              }
            </button>
            <p class="wl-note">Sign in with your Gmail account to book and track appointments.</p>
          }
        </div>
      </section>

      <!-- How it works -->
      <section class="wl-steps">
        <h2 class="wl-steps-title">How it works</h2>
        <div class="wl-step-grid">
          <div class="wl-step">
            <span class="wl-step-num">1</span>
            <ui-icon name="user" size="22" />
            <h3>Sign in</h3>
            <p>Use your Google account to verify your identity.</p>
          </div>
          <div class="wl-step">
            <span class="wl-step-num">2</span>
            <ui-icon name="calendar" size="22" />
            <h3>Book</h3>
            <p>Choose a document type, date, and time slot.</p>
          </div>
          <div class="wl-step">
            <span class="wl-step-num">3</span>
            <ui-icon name="check-circle" size="22" />
            <h3>Get approved</h3>
            <p>The office reviews your request and confirms the schedule.</p>
          </div>
          <div class="wl-step">
            <span class="wl-step-num">4</span>
            <ui-icon name="file" size="22" />
            <h3>Track</h3>
            <p>Follow your appointment status and reference number anytime.</p>
          </div>
        </div>
      </section>

      <!-- Office info -->
      <section class="wl-office">
        <div class="wl-office-card">
          <ui-icon name="landmark" size="20" />
          <div>
            <h3>{{ settings.settings.name }}</h3>
            <p>{{ settings.settings.address }}</p>
            <p>Contact: {{ settings.settings.contact }}</p>
          </div>
        </div>
        <div class="wl-office-card">
          <ui-icon name="clock" size="20" />
          <div>
            <h3>Office Hours</h3>
            <p>Monday – Saturday</p>
            <p>9:00 AM – 4:00 PM</p>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .wl { max-width: 1080px; margin: 0 auto; }

      .wl-hero { display: flex; justify-content: center; }
      .wl-hero-card {
        width: 620px;
        max-width: 100%;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 20px;
        box-shadow: var(--shadow-card);
        padding: 40px 36px 32px;
        text-align: center;
      }
      .wl-logo { display: flex; justify-content: center; }
      .wl-title {
        margin-top: 10px;
        font-size: 34px;
        font-weight: 800;
        letter-spacing: 0.14em;
        color: #1f3a5f;
        text-indent: 0.14em;
      }
      .wl-tag {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--gold-rich);
      }
      .wl-sub { margin-top: 12px; font-size: 14.5px; color: var(--body-c); line-height: 1.6; }

      .wl-notice {
        margin-top: 16px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        text-align: left;
        background: var(--red-surface);
        border: 1px solid var(--red-border);
        color: var(--red);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
      }
      .wl-notice.warn {
        background: var(--status-pending-bg);
        border-color: var(--status-pending-border);
        color: var(--status-pending-text);
      }
      .wl-notice .app-icon { flex: none; margin-top: 2px; }

      .wl-google {
        margin-top: 20px;
        width: 100%;
        max-width: 340px;
        height: 48px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 11px;
        border: 0;
        border-radius: 12px;
        background: #1e3a5f;
        color: #fff;
        font-family: inherit;
        font-size: 15px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s;
      }
      .wl-google:hover { background: #294a78; }
      .wl-google:disabled { opacity: 0.65; cursor: default; }

      .wl-spinner {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        animation: wl-spin 0.8s linear infinite;
      }
      @keyframes wl-spin { to { transform: rotate(360deg); } }

      .wl-link {
        display: inline-block;
        margin-top: 14px;
        font-size: 13.5px;
        font-weight: 600;
        color: #1e3a5f;
        text-decoration: none;
      }
      .wl-link:hover { text-decoration: underline; }
      .wl-note { margin-top: 12px; font-size: 12.5px; color: var(--muted); }

      .wl-steps { margin-top: 40px; }
      .wl-steps-title {
        text-align: center;
        font-size: 21px;
        color: #1f3a5f;
      }
      .wl-step-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
      }
      .wl-step {
        position: relative;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 22px 16px 18px;
        text-align: center;
        box-shadow: var(--shadow-xs);
      }
      .wl-step .app-icon { color: var(--gold-rich); }
      .wl-step-num {
        position: absolute;
        top: -11px;
        left: 50%;
        transform: translateX(-50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--green-800);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .wl-step h3 { margin-top: 10px; font-size: 15px; color: var(--navy-ink); }
      .wl-step p { margin-top: 5px; font-size: 12.5px; color: var(--muted); line-height: 1.5; }

      .wl-office {
        margin: 30px 0 8px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .wl-office-card {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        background: var(--green-surface);
        border: 1px solid var(--green-border);
        border-radius: 14px;
        padding: 18px 20px;
      }
      .wl-office-card .app-icon { color: var(--green-800); flex: none; margin-top: 2px; }
      .wl-office-card h3 { font-size: 15px; color: var(--green-900); }
      .wl-office-card p { margin: 3px 0 0; font-size: 13px; color: var(--body-c); }

      @media (max-width: 760px) {
        .wl-hero-card { padding: 30px 20px 26px; }
        .wl-step-grid { grid-template-columns: repeat(2, 1fr); }
        .wl-office { grid-template-columns: 1fr; }
      }
      @media (max-width: 420px) {
        .wl-step-grid { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class PortalWelcome implements OnInit {
  clients = inject(ClientAuthService);
  settings = inject(SettingsService);
  private router = inject(Router);

  busy = false;
  notice = signal('');

  isGmail = isGmailAddress;

  async ngOnInit(): Promise<void> {
    // Surface OAuth errors returned by Supabase in the URL query/hash.
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const err = params.get('error_description') || hash.get('error_description') || params.get('error') || hash.get('error');
    if (err) {
      this.notice.set(this.friendlyError(err));
      window.history.replaceState({}, '', window.location.pathname);
    }
    await this.clients.ready();
    // Already-signed-in Gmail clients skip the hero button state quickly.
    if (this.clients.isClient()) {
      this.router.navigate(['/portal/book']);
    }
  }

  async signIn(): Promise<void> {
    this.busy = true;
    this.notice.set('');
    const err = await this.clients.signInWithGoogle();
    if (err) {
      this.busy = false;
      this.notice.set(this.friendlyError(err));
    }
  }

  async signOut(): Promise<void> {
    await this.clients.signOut();
  }

  private friendlyError(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('provider') && (m.includes('not enabled') || m.includes('not supported') || m.includes('disabled'))) {
      return 'Google sign-in is not configured yet. The office administrator must enable the Google provider in Supabase (see the setup guide).';
    }
    if (m.includes('redirect') || m.includes('callback')) {
      return 'Sign-in redirect is not configured. Please ask the administrator to add this site URL to the Supabase redirect allow-list.';
    }
    if (m.includes('popup') || m.includes('closed')) {
      return 'The sign-in window was closed before finishing. Please try again.';
    }
    return msg || 'Sign-in failed. Please try again.';
  }
}
