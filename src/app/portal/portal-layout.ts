import { Component, OnInit, OnDestroy, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ClientAuthService } from '../core/client-auth';
import { NotificationsService, InAppNotification, NotificationType } from '../core/notifications';
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
          <a routerLink="/portal/notifications" routerLinkActive="on">
            <ui-icon name="bell" size="16" /> Notifications
            @if (notifs.unreadCount() > 0) {
              <span class="pt-tab-dot"></span>
            }
          </a>
        </nav>

        <div class="pt-user">
          @if (clients.account(); as acc) {
            <!-- Notification Bell with Dropdown -->
            <div class="pt-notif-wrap" (click)="$event.stopPropagation()">
              <button
                class="pt-bell-btn"
                type="button"
                [class.has-unread]="notifs.unreadCount() > 0"
                [class.active]="dropdownOpen()"
                (click)="toggleDropdown()"
                title="Notifications"
                aria-label="View notifications"
              >
                <ui-icon name="bell" size="18" />
                @if (notifs.unreadCount() > 0) {
                  <span class="pt-bell-badge">{{ notifs.unreadCount() > 99 ? '99+' : notifs.unreadCount() }}</span>
                }
              </button>

              @if (dropdownOpen()) {
                <div class="pt-dropdown">
                  <div class="pt-drop-head">
                    <span class="pt-drop-title">Notifications</span>
                    @if (notifs.unreadCount() > 0) {
                      <button class="pt-drop-mark" type="button" (click)="markAllAsRead()">Mark all as read</button>
                    }
                  </div>

                  <div class="pt-drop-list">
                    @if (loadingDrop()) {
                      <div class="pt-drop-empty">Loading notifications…</div>
                    } @else if (recentNotifs().length === 0) {
                      <div class="pt-drop-empty">No notifications yet.</div>
                    } @else {
                      @for (n of recentNotifs(); track n.id) {
                        <div class="pt-drop-item" [class.unread]="!n.isRead" (click)="onItemClick(n)">
                          <div class="pt-drop-icon" [class]="iconClass(n.notificationType)">
                            <ui-icon [name]="iconName(n.notificationType)" size="14" />
                          </div>
                          <div class="pt-drop-text">
                            <div class="pt-drop-item-title">{{ n.title }}</div>
                            <div class="pt-drop-item-msg">{{ n.message }}</div>
                            <div class="pt-drop-item-time">{{ formatTime(n.createdAt) }}</div>
                          </div>
                          @if (!n.isRead) {
                            <span class="pt-drop-dot"></span>
                          }
                        </div>
                      }
                    }
                  </div>

                  <div class="pt-drop-foot">
                    <a routerLink="/portal/notifications" (click)="closeDropdown()">View all notifications →</a>
                  </div>
                </div>
              }
            </div>

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
        position: relative;
      }
      .pt-tabs a:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
      .pt-tabs a.on { background: rgba(213, 174, 79, 0.16); color: #f0d78c; }
      .pt-tab-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #d5ae4f;
        margin-left: -2px;
      }

      .pt-user { display: flex; align-items: center; gap: 10px; }

      /* Notification Bell Button */
      .pt-notif-wrap {
        position: relative;
      }
      .pt-bell-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #c8d3ca;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        transition: 0.15s ease;
      }
      .pt-bell-btn:hover, .pt-bell-btn.active {
        background: rgba(213, 174, 79, 0.2);
        color: #f0d78c;
        border-color: rgba(213, 174, 79, 0.4);
      }
      .pt-bell-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #d5ae4f;
        color: #12332b;
        font-size: 10.5px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 999px;
        line-height: 1.2;
        border: 2px solid #12332b;
        animation: pt-pop 0.2s ease;
      }

      /* Notification Dropdown */
      .pt-dropdown {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: 360px;
        max-width: 90vw;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        z-index: 100;
        animation: pt-drop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes pt-drop-in {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes pt-pop {
        0% { transform: scale(0.6); }
        100% { transform: scale(1); }
      }

      .pt-drop-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #12332b;
        color: #fff;
      }
      .pt-drop-title {
        font-weight: 700;
        font-size: 14px;
        letter-spacing: 0.04em;
      }
      .pt-drop-mark {
        background: transparent;
        border: 0;
        color: #d5ae4f;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
      }
      .pt-drop-mark:hover {
        text-decoration: underline;
        color: #f0d78c;
      }

      .pt-drop-list {
        max-height: 340px;
        overflow-y: auto;
      }
      .pt-drop-empty {
        padding: 32px 16px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      .pt-drop-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #f1f5f9;
        cursor: pointer;
        position: relative;
        transition: 0.12s ease;
      }
      .pt-drop-item:hover {
        background: #f8fafc;
      }
      .pt-drop-item.unread {
        background: #f0fdf4;
      }
      .pt-drop-icon {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
      }
      .drop-icon-green { background: #dcfce7; color: #059669; }
      .drop-icon-red { background: #fee2e2; color: #dc2626; }
      .drop-icon-blue { background: #dbeafe; color: #2563eb; }
      .drop-icon-gold { background: #fef3c7; color: #d97706; }
      .drop-icon-dark { background: #e2e8f0; color: #12332b; }

      .pt-drop-text {
        flex: 1;
        min-width: 0;
      }
      .pt-drop-item-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.3;
      }
      .pt-drop-item-msg {
        font-size: 12px;
        color: #475569;
        margin-top: 2px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .pt-drop-item-time {
        font-size: 10.5px;
        color: #94a3b8;
        margin-top: 4px;
      }
      .pt-drop-dot {
        position: absolute;
        top: 14px;
        right: 12px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #d5ae4f;
      }

      .pt-drop-foot {
        padding: 10px 14px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        text-align: center;
      }
      .pt-drop-foot a {
        color: #12332b;
        text-decoration: none;
        font-size: 12.5px;
        font-weight: 700;
      }
      .pt-drop-foot a:hover {
        text-decoration: underline;
      }

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
        .pt-tabs a { flex: 1; justify-content: center; padding: 9px 8px; font-size: 12px; }
        .pt-chip-name { display: none; }
        .pt-logout span { display: none; }
        .pt-main { padding: 20px 14px 40px; }
        .pt-dropdown { right: -60px; width: 320px; }
      }
    `,
  ],
})
export class PortalLayout implements OnInit, OnDestroy {
  clients = inject(ClientAuthService);
  notifs = inject(NotificationsService);
  private router = inject(Router);

  dropdownOpen = signal(false);
  loadingDrop = signal(false);
  recentNotifs = signal<InAppNotification[]>([]);

  private unsubscribeRealtime?: () => void;

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.dropdownOpen()) {
      this.closeDropdown();
    }
  }

  ngOnInit(): void {
    this.notifs.refreshUnreadCount();
    this.unsubscribeRealtime = this.notifs.subscribeToMine(() => {
      this.notifs.refreshUnreadCount();
      if (this.dropdownOpen()) {
        this.loadRecent();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
    }
  }

  toggleDropdown(): void {
    const next = !this.dropdownOpen();
    this.dropdownOpen.set(next);
    if (next) {
      this.loadRecent();
    }
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  async loadRecent(): Promise<void> {
    this.loadingDrop.set(true);
    try {
      const { items } = await this.notifs.listMine();
      this.recentNotifs.set(items.slice(0, 5));
    } finally {
      this.loadingDrop.set(false);
    }
  }

  async onItemClick(n: InAppNotification): Promise<void> {
    if (!n.isRead) {
      n.isRead = true;
      await this.notifs.markAsRead(n.id);
    }
    this.closeDropdown();
    if (n.relatedAppointmentId) {
      this.router.navigate(['/portal/appointments']);
    } else {
      this.router.navigate(['/portal/notifications']);
    }
  }

  async markAllAsRead(): Promise<void> {
    await this.notifs.markAllAsRead();
    this.recentNotifs.update((list) =>
      list.map((i) => ({ ...i, isRead: true }))
    );
  }

  iconName(type: NotificationType): string {
    switch (type) {
      case 'appointment_approved': return 'check';
      case 'appointment_rejected': return 'x';
      case 'appointment_rescheduled': return 'calendar';
      case 'appointment_completed': return 'check-circle';
      case 'appointment_cancelled': return 'calendar-x';
      default: return 'bell';
    }
  }

  iconClass(type: NotificationType): string {
    switch (type) {
      case 'appointment_approved': return 'drop-icon-green';
      case 'appointment_rejected': return 'drop-icon-red';
      case 'appointment_rescheduled': return 'drop-icon-blue';
      case 'appointment_completed': return 'drop-icon-dark';
      case 'appointment_cancelled': return 'drop-icon-red';
      default: return 'drop-icon-gold';
    }
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return '';
    }
  }

  async logout(): Promise<void> {
    await this.clients.signOut();
    this.router.navigate(['/portal']);
  }
}
