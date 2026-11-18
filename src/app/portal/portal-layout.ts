import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ClientAuthService } from '../core/client-auth';
import { UiIcon } from '../shared/icon';
import { LogoMark } from '../shared/logo';

@Component({
  selector: 'app-portal-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIcon, LogoMark],
  template: `
    <header class="pt-head">
      <div class="pt-head-inner">
        <a class="pt-brand" routerLink="/portal">
          <app-logo-mark tone="color" [logoWidth]="34" />
          <span class="pt-brand-txt">
            <span class="pt-brand-name">NOTARIX</span>
            <span class="pt-brand-sub">Client Portal</span>
          </span>
        </a>

        <nav class="pt-tabs">
          <a routerLink="/portal/book" routerLinkActive="on"><ui-icon name="calendar" size="16" /> Book Appointment</a>
          <a routerLink="/portal/appointments" routerLinkActive="on"><ui-icon name="list" size="16" /> My Appointments</a>
        </nav>

        <div class="pt-user">
          @if (clients.account(); as acc) {
            <span class="pt-chip">
              @if (acc.avatarUrl) {
                <img class="pt-avatar" [src]="acc.avatarUrl" alt="" referrerpolicy="no-referrer" />
              } @else {
                <span class="pt-avatar pt-avatar-fallback">{{ acc.name.charAt(0).toUpperCase() }}</span>
              }
              <span class="pt-chip-name">{{ acc.name }}</span>
            </span>
            <button class="pt-logout" type="button" (click)="logout()" title="Log out">
              <ui-icon name="logout" size="16" />
              <span>Logout</span>
            </button>
          }
        </div>
      </div>
    </header>

    <main class="pt-main">
      <router-outlet />
    </main>

    <footer class="pt-foot">
      <span>NOTARIX — Online Appointment System</span>
    </footer>
  `,
  styles: [
    `
      .pt-head {
        position: sticky;
        top: 0;
        z-index: 40;
        background: #12332b;
        border-bottom: 2px solid rgba(213, 174, 79, 0.55);
      }
      .pt-head-inner {
        max-width: 1080px;
        margin: 0 auto;
        padding: 10px 20px;
        display: flex;
        align-items: center;
        gap: 22px;
      }
      .pt-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
      }
      .pt-brand-txt { display: flex; flex-direction: column; line-height: 1.15; }
      .pt-brand-name {
        font-family: 'Playfair Display', Georgia, serif;
        font-weight: 700;
        font-size: 17px;
        letter-spacing: 0.18em;
        color: #fff;
      }
      .pt-brand-sub {
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #d5ae4f;
        font-weight: 600;
      }

      .pt-tabs {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: center;
      }
      .pt-tabs a {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 16px;
        border-radius: 10px;
        color: #c8d3ca;
        text-decoration: none;
        font-size: 13.5px;
        font-weight: 600;
        transition: 0.15s ease;
        white-space: nowrap;
      }
      .pt-tabs a:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
      .pt-tabs a.on { background: rgba(213, 174, 79, 0.16); color: #f0d78c; }

      .pt-user { display: flex; align-items: center; gap: 10px; }
      .pt-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        padding: 4px 12px 4px 5px;
        min-width: 0;
      }
      .pt-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        flex: none;
      }
      .pt-avatar-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #d5ae4f;
        color: #12332b;
        font-weight: 700;
        font-size: 13px;
      }
      .pt-chip-name {
        color: #e7eee9;
        font-size: 13px;
        font-weight: 600;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pt-logout {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 0;
        background: transparent;
        color: #c8d3ca;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        transition: 0.15s ease;
      }
      .pt-logout:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

      .pt-main {
        min-height: calc(100vh - 132px);
        background:
          radial-gradient(560px 420px at 90% 0%, rgba(211, 219, 230, 0.55) 0%, rgba(211, 219, 230, 0) 70%),
          var(--cream);
        padding: 30px 20px 48px;
      }
      .pt-foot {
        background: #12332b;
        color: rgba(233, 231, 221, 0.55);
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.06em;
        padding: 16px 20px;
      }

      @media (max-width: 760px) {
        .pt-head-inner { flex-wrap: wrap; gap: 10px; padding: 10px 14px; }
        .pt-tabs { order: 3; width: 100%; justify-content: stretch; }
        .pt-tabs a { flex: 1; justify-content: center; padding: 9px 8px; }
        .pt-chip-name { display: none; }
        .pt-logout span { display: none; }
        .pt-main { padding: 20px 14px 40px; }
      }
    `,
  ],
})
export class PortalLayout {
  clients = inject(ClientAuthService);
  private router = inject(Router);

  async logout(): Promise<void> {
    await this.clients.signOut();
    this.router.navigate(['/portal']);
  }
}
