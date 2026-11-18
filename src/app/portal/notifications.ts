import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationsService, InAppNotification, NotificationType } from '../core/notifications';
import { UiIcon } from '../shared/icon';

type FilterTab = 'All' | 'Unread' | 'Read';

@Component({
  selector: 'app-portal-notifications',
  imports: [RouterLink, UiIcon],
  template: `
    <div class="nt-container">
      <header class="nt-head">
        <div>
          <nav class="nt-crumb">
            <a routerLink="/portal">Portal</a>
            <span>/</span>
            <span>Notifications</span>
          </nav>
          <h1>Notifications</h1>
          <p class="nt-sub">Review appointment updates, schedule confirmations, and office announcements.</p>
        </div>
        <div class="nt-head-actions">
          <button
            class="btn btn-outline"
            type="button"
            (click)="markAllAsRead()"
            [disabled]="unreadCount() === 0 || acting()"
          >
            <ui-icon name="check" size="14" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </header>

      <!-- Filter tabs -->
      <div class="nt-tabs">
        <button
          type="button"
          class="nt-tab"
          [class.on]="currentTab() === 'All'"
          (click)="currentTab.set('All')"
        >
          All <span class="nt-tab-badge">{{ items().length }}</span>
        </button>
        <button
          type="button"
          class="nt-tab"
          [class.on]="currentTab() === 'Unread'"
          (click)="currentTab.set('Unread')"
        >
          Unread <span class="nt-tab-badge" [class.highlight]="unreadCount() > 0">{{ unreadCount() }}</span>
        </button>
        <button
          type="button"
          class="nt-tab"
          [class.on]="currentTab() === 'Read'"
          (click)="currentTab.set('Read')"
        >
          Read <span class="nt-tab-badge">{{ readCount() }}</span>
        </button>
      </div>

      <!-- Content -->
      @if (loading()) {
        <div class="nt-loading">
          <p>Loading notifications…</p>
        </div>
      } @else if (filteredItems().length === 0) {
        <div class="nt-empty">
          <div class="nt-empty-icon">
            <ui-icon name="bell" size="36" />
          </div>
          @if (currentTab() === 'Unread') {
            <h3>No unread notifications</h3>
            <p>You are all caught up! There are no new notifications at this time.</p>
          } @else if (currentTab() === 'Read') {
            <h3>No read notifications</h3>
            <p>Notifications you have marked as read will appear here.</p>
          } @else {
            <h3>No notifications yet</h3>
            <p>You will receive updates here once your appointment or document request status changes.</p>
          }
        </div>
      } @else {
        <div class="nt-list">
          @for (n of filteredItems(); track n.id) {
            <article class="nt-card" [class.unread]="!n.isRead">
              <div class="nt-card-icon" [class]="iconClass(n.notificationType)">
                <ui-icon [name]="iconName(n.notificationType)" size="18" />
              </div>

              <div class="nt-card-body">
                <div class="nt-card-top">
                  <h2 class="nt-card-title">{{ n.title }}</h2>
                  <time class="nt-card-time">{{ formatTime(n.createdAt) }}</time>
                </div>
                <p class="nt-card-msg">{{ n.message }}</p>

                <div class="nt-card-actions">
                  @if (n.relatedAppointmentId) {
                    <a class="btn-sm btn-gold" routerLink="/portal/appointments" (click)="markAsRead(n)">
                      <span>View Appointment</span>
                      <ui-icon name="chev-right" size="13" />
                    </a>
                  }
                  @if (!n.isRead) {
                    <button class="btn-sm btn-ghost" type="button" (click)="markAsRead(n)">
                      <ui-icon name="check" size="13" />
                      <span>Mark as read</span>
                    </button>
                  }
                </div>
              </div>

              @if (!n.isRead) {
                <span class="nt-unread-dot" title="Unread"></span>
              }
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .nt-container {
        max-width: 820px;
        margin: 0 auto;
      }
      .nt-crumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .nt-crumb a {
        color: var(--navy);
        text-decoration: none;
      }
      .nt-crumb a:hover {
        text-decoration: underline;
      }
      .nt-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 22px;
        flex-wrap: wrap;
      }
      .nt-head h1 {
        margin: 0;
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 26px;
        color: #12332b;
      }
      .nt-sub {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13.5px;
      }
      .nt-head-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: var(--radius-sm);
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.15s ease;
      }
      .btn-outline {
        border: 1px solid var(--border-strong);
        background: #fff;
        color: var(--ink);
      }
      .btn-outline:hover:not(:disabled) {
        border-color: #12332b;
        color: #12332b;
        background: rgba(18, 51, 43, 0.04);
      }
      .btn-outline:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nt-tabs {
        display: flex;
        gap: 6px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 18px;
        padding-bottom: 8px;
      }
      .nt-tab {
        background: transparent;
        border: 0;
        padding: 6px 14px;
        border-radius: 999px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: 0.15s ease;
      }
      .nt-tab:hover {
        color: #12332b;
        background: rgba(18, 51, 43, 0.05);
      }
      .nt-tab.on {
        background: #12332b;
        color: #fff;
      }
      .nt-tab-badge {
        background: rgba(15, 23, 42, 0.08);
        padding: 1px 7px;
        border-radius: 999px;
        font-size: 11px;
      }
      .nt-tab.on .nt-tab-badge {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
      .nt-tab-badge.highlight {
        background: #d5ae4f;
        color: #12332b;
        font-weight: 700;
      }

      .nt-loading {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 40px 20px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      .nt-empty {
        background: #fff;
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-sm);
        padding: 50px 20px;
        text-align: center;
      }
      .nt-empty-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #f1f5f3;
        color: #12332b;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
      }
      .nt-empty h3 {
        margin: 0 0 6px;
        font-size: 16px;
        color: #12332b;
      }
      .nt-empty p {
        margin: 0;
        color: var(--muted);
        font-size: 13.5px;
        max-width: 420px;
        margin: 0 auto;
      }

      .nt-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .nt-card {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 16px 18px;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        position: relative;
        transition: 0.15s ease;
      }
      .nt-card:hover {
        border-color: #cbd5e1;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      }
      .nt-card.unread {
        background: #fafdfb;
        border-left: 3px solid #12332b;
      }
      .nt-card-icon {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
      }
      .nt-icon-green { background: #ecfdf5; color: #059669; }
      .nt-icon-red { background: #fef2f2; color: #dc2626; }
      .nt-icon-blue { background: #eff6ff; color: #2563eb; }
      .nt-icon-gold { background: #fefce8; color: #d97706; }
      .nt-icon-dark { background: #f1f5f3; color: #12332b; }

      .nt-card-body {
        flex: 1;
        min-width: 0;
      }
      .nt-card-top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 4px;
      }
      .nt-card-title {
        font-size: 14.5px;
        font-weight: 700;
        color: #0f172a;
        margin: 0;
      }
      .nt-card-time {
        font-size: 11.5px;
        color: var(--muted);
        white-space: nowrap;
      }
      .nt-card-msg {
        margin: 0 0 10px;
        font-size: 13.5px;
        color: #334155;
        line-height: 1.5;
      }
      .nt-card-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .btn-sm {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        text-decoration: none;
        cursor: pointer;
        border: 0;
        transition: 0.15s ease;
      }
      .btn-gold {
        background: #12332b;
        color: #fff;
      }
      .btn-gold:hover {
        background: #1a473c;
      }
      .btn-ghost {
        background: transparent;
        color: var(--muted);
      }
      .btn-ghost:hover {
        color: #12332b;
        background: rgba(18, 51, 43, 0.06);
      }

      .nt-unread-dot {
        position: absolute;
        top: 18px;
        right: 18px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #d5ae4f;
      }

      @media (max-width: 600px) {
        .nt-card {
          flex-direction: column;
          gap: 10px;
        }
        .nt-unread-dot {
          top: 14px;
          right: 14px;
        }
      }
    `,
  ],
})
export class PortalNotifications implements OnInit, OnDestroy {
  private api = inject(NotificationsService);
  private router = inject(Router);

  items = signal<InAppNotification[]>([]);
  loading = signal(true);
  acting = signal(false);
  currentTab = signal<FilterTab>('All');

  unreadCount = computed(() => this.items().filter((i) => !i.isRead).length);
  readCount = computed(() => this.items().filter((i) => i.isRead).length);

  filteredItems = computed(() => {
    const tab = this.currentTab();
    const list = this.items();
    if (tab === 'Unread') return list.filter((i) => !i.isRead);
    if (tab === 'Read') return list.filter((i) => i.isRead);
    return list;
  });

  private unsubscribeRealtime?: () => void;

  ngOnInit(): void {
    this.load();
    this.unsubscribeRealtime = this.api.subscribeToMine(() => {
      this.loadSilent();
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { items } = await this.api.listMine();
      this.items.set(items);
    } finally {
      this.loading.set(false);
    }
  }

  async loadSilent(): Promise<void> {
    const { items } = await this.api.listMine();
    this.items.set(items);
  }

  async markAsRead(item: InAppNotification): Promise<void> {
    if (item.isRead) return;
    item.isRead = true;
    this.items.update((list) => [...list]);
    await this.api.markAsRead(item.id);
  }

  async markAllAsRead(): Promise<void> {
    this.acting.set(true);
    try {
      this.items.update((list) =>
        list.map((i) => ({ ...i, isRead: true }))
      );
      await this.api.markAllAsRead();
    } finally {
      this.acting.set(false);
    }
  }

  iconName(type: NotificationType): string {
    switch (type) {
      case 'appointment_approved':
        return 'check';
      case 'appointment_rejected':
        return 'x';
      case 'appointment_rescheduled':
        return 'calendar';
      case 'appointment_completed':
        return 'check-circle';
      case 'appointment_cancelled':
        return 'calendar-x';
      default:
        return 'bell';
    }
  }

  iconClass(type: NotificationType): string {
    switch (type) {
      case 'appointment_approved':
        return 'nt-icon-green';
      case 'appointment_rejected':
        return 'nt-icon-red';
      case 'appointment_rescheduled':
        return 'nt-icon-blue';
      case 'appointment_completed':
        return 'nt-icon-dark';
      case 'appointment_cancelled':
        return 'nt-icon-red';
      default:
        return 'nt-icon-gold';
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

      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return iso;
    }
  }
}
