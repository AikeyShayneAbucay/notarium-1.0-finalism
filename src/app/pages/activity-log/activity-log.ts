import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { ActivityLogService, ActivityLog, formatPhilippineDate, formatPhilippineTime } from '../../core/activity';
import { UiIcon } from '../../shared/icon';

@Component({
  selector: 'app-activity-log',
  imports: [FormsModule, UiIcon],
  template: `
    <div class="pg">
      <header class="page-head no-print">
        <div class="ph-wrap">
          <div>
            <h1>Activity Log</h1>
            <p>Audit trail of all actions, notarizations, reports, and logins across the office.</p>
          </div>
          <div class="ph-meta">
            <span class="user-pill" [class.is-admin]="auth.isAdmin()">
              <ui-icon [name]="auth.isAdmin() ? 'lock' : 'user'" size="14" />
              <span>{{ auth.isAdmin() ? 'Administrator View (All Office Activities)' : 'Legal Secretary View (My Activity History)' }}</span>
            </span>
          </div>
        </div>
      </header>

      <!-- KPI Summary Cards -->
      <section class="log-kpis no-print">
        <div class="kpi-card">
          <div class="kpi-icon is-green">
            <ui-icon name="history" size="18" />
          </div>
          <div class="kpi-data">
            <span class="kpi-val">{{ visibleLogs.length }}</span>
            <span class="kpi-lbl">{{ auth.isAdmin() ? 'Total System Activities' : 'Your Logged Activities' }}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon is-gold">
            <ui-icon name="file" size="18" />
          </div>
          <div class="kpi-data">
            <span class="kpi-val">{{ recordActivityCount }}</span>
            <span class="kpi-lbl">Notarization Actions</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon is-navy">
            <ui-icon name="login" size="18" />
          </div>
          <div class="kpi-data">
            <span class="kpi-val">{{ authActivityCount }}</span>
            <span class="kpi-lbl">Authentication Events</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon is-green">
            <ui-icon name="chart" size="18" />
          </div>
          <div class="kpi-data">
            <span class="kpi-val">{{ reportActivityCount }}</span>
            <span class="kpi-lbl">Report Generations</span>
          </div>
        </div>
      </section>

      <!-- Filter Toolbar -->
      <div class="toolbar no-print">
        <div class="search-box">
          <ui-icon name="search" size="16" />
          <input
            type="text"
            placeholder="Search by user, action, document, or device..."
            [(ngModel)]="search"
            (ngModelChange)="page = 1"
          />
          @if (search) {
            <button type="button" class="clear-search" (click)="search = ''; page = 1" title="Clear search">
              <ui-icon name="close" size="14" />
            </button>
          }
        </div>

        <select class="field-select" [(ngModel)]="filterActivity" (ngModelChange)="page = 1">
          <option value="">All Activity Types</option>
          <option value="login">Successful login</option>
          <option value="Failed login">Failed login attempt</option>
          <option value="Logout">Logout</option>
          <option value="Added a new notarization record">Added a new notarization record</option>
          <option value="Viewed a notarization record">Viewed a notarization record</option>
          <option value="Updated a notarization record">Updated a notarization record</option>
          <option value="Changed document status">Changed document status</option>
          <option value="Changed document location">Changed document location</option>
          <option value="Deleted a notarization record">Deleted a notarization record</option>
          <option value="Generated a monthly report">Generated a monthly report</option>
        </select>

        <div class="date-input-wrap">
          <input
            type="date"
            class="field-date"
            [(ngModel)]="filterDate"
            (ngModelChange)="page = 1"
            title="Filter by date"
          />
          @if (filterDate) {
            <button type="button" class="clear-date-btn" (click)="filterDate = ''; page = 1" title="Clear date filter">
              <ui-icon name="close" size="12" />
            </button>
          }
        </div>

        @if (auth.isAdmin()) {
          <select class="field-select role-select" [(ngModel)]="filterRole" (ngModelChange)="page = 1">
            <option value="">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="staff">Legal Secretary</option>
          </select>
        }

        @if (hasActiveFilters) {
          <button class="btn btn-light reset-btn" type="button" (click)="clearFilters()">
            <ui-icon name="close" size="14" /> Reset Filters
          </button>
        }
      </div>

      <!-- Activity Log Table Panel -->
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="num-col">#</th>
                <th>User Name</th>
                <th>Role</th>
                <th>Activity / Action Performed</th>
                <th>Device Information</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              @for (log of pagedRows; track log.id; let i = $index) {
                <tr>
                  <td class="idx">{{ (clampedPage - 1) * pageSize + i + 1 }}</td>
                  <td class="cell-strong">
                    <div class="user-cell">
                      <span class="user-avatar" [class.is-admin]="log.role === 'admin'">
                        {{ log.userName ? log.userName.charAt(0).toUpperCase() : 'U' }}
                      </span>
                      <span>{{ log.userName }}</span>
                    </div>
                  </td>
                  <td>
                    @if (log.role === 'admin') {
                      <span class="badge badge-admin">Administrator</span>
                    } @else {
                      <span class="badge badge-staff">Legal Secretary</span>
                    }
                  </td>
                  <td>
                    <div class="activity-cell">
                      <span class="act-title" [class.is-delete]="log.activity.includes('Deleted')" [class.is-login]="log.activity.includes('login') || log.activity.includes('Logout')">
                        {{ log.activity }}
                      </span>
                      @if (log.details) {
                        <span class="act-details">{{ log.details }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="device-cell" [title]="log.deviceInfo">
                      {{ log.deviceInfo }}
                    </span>
                  </td>
                  <td>
                    <span class="date-cell">{{ fmtDate(log.createdAt) }}</span>
                  </td>
                  <td>
                    <span class="time-cell">{{ fmtTime(log.createdAt) }}</span>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="empty-cell">
                    <div class="empty-state">
                      <ui-icon name="history" size="32" />
                      <p class="empty-msg">No activity log entries found matching your filter criteria.</p>
                      @if (hasActiveFilters) {
                        <button class="btn btn-sm btn-light" type="button" (click)="clearFilters()">
                          Clear Filters
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        @if (filteredRows.length > 0) {
          <div class="log-footer">
            <span class="footer-count">{{ countText }}</span>
            <div class="pagination">
              <button
                class="page-btn"
                type="button"
                [disabled]="clampedPage === 1"
                (click)="go(clampedPage - 1)"
                title="Previous page"
              >
                <ui-icon name="chev-left" size="14" />
              </button>

              @for (p of pageList; track p) {
                <button
                  class="page-btn"
                  [class.active]="p === clampedPage"
                  type="button"
                  (click)="go(p)"
                >
                  {{ p }}
                </button>
              }

              <button
                class="page-btn"
                type="button"
                [disabled]="clampedPage === pageCount"
                (click)="go(clampedPage + 1)"
                title="Next page"
              >
                <ui-icon name="chev-right" size="14" />
              </button>
            </div>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .ph-wrap {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: var(--radius-full);
      font-size: 12px;
      font-weight: 600;
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
    }

    .user-pill.is-admin {
      background: var(--navy-surface);
      color: var(--navy);
      border-color: var(--border-strong);
    }

    /* KPI Summary Cards */
    .log-kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .kpi-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: var(--shadow-card);
    }

    .kpi-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .kpi-icon.is-green {
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
    }

    .kpi-icon.is-gold {
      background: var(--gold-surface);
      color: var(--gold-rich);
      border: 1px solid var(--gold-border);
    }

    .kpi-icon.is-navy {
      background: var(--navy-surface);
      color: var(--navy);
      border: 1px solid #cbd5e1;
    }

    .kpi-data {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .kpi-val {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
    }

    .kpi-lbl {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-top: 2px;
    }

    /* Toolbar & Search */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 240px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0 12px;
      height: 40px;
      box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.02);
      transition: border-color 0.15s ease;
    }

    .search-box:focus-within {
      border-color: var(--navy-light);
      box-shadow: 0 0 0 3px rgba(22, 57, 103, 0.1);
    }

    .search-box input {
      border: none;
      outline: none;
      background: transparent;
      width: 100%;
      font-size: 13.5px;
      color: var(--ink);
    }

    .clear-search {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--muted);
      padding: 2px;
      display: flex;
      align-items: center;
    }

    .clear-search:hover {
      color: var(--ink);
    }

    .field-select {
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: #ffffff;
      font-size: 13px;
      color: #334155;
      font-weight: 500;
      outline: none;
      cursor: pointer;
    }

    .field-select:hover {
      border-color: var(--border-strong);
    }

    .date-input-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .field-date {
      height: 40px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: #ffffff;
      font-size: 13px;
      color: #334155;
      outline: none;
    }

    .clear-date-btn {
      position: absolute;
      right: 6px;
      background: #f1f5f9;
      border: none;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      display: grid;
      place-items: center;
      cursor: pointer;
      color: var(--muted);
    }

    .reset-btn {
      height: 40px;
      font-size: 13px;
      gap: 6px;
    }

    /* Table specifics */
    .num-col {
      width: 48px;
      text-align: center;
    }

    .idx {
      text-align: center;
      color: var(--muted);
      font-weight: 600;
      font-size: 12px;
    }

    .user-cell {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 11.5px;
      flex-shrink: 0;
    }

    .user-avatar.is-admin {
      background: var(--navy-surface);
      color: var(--navy);
      border-color: #cbd5e1;
    }

    .badge-admin {
      background: var(--navy-surface);
      color: var(--navy);
      border: 1px solid #cbd5e1;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-staff {
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
    }

    .activity-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .act-title {
      font-weight: 600;
      color: #1e293b;
      font-size: 13.5px;
    }

    .act-title.is-delete {
      color: #b91c1c;
    }

    .act-title.is-login {
      color: var(--navy);
    }

    .act-details {
      font-size: 12px;
      color: var(--muted);
    }

    .device-cell {
      font-size: 12.5px;
      color: #475569;
      white-space: nowrap;
    }

    .date-cell {
      font-size: 13px;
      font-weight: 500;
      color: #334155;
      white-space: nowrap;
    }

    .time-cell {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--navy);
      white-space: nowrap;
    }

    .empty-cell {
      padding: 48px 16px;
      text-align: center;
      background: #ffffff;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--muted);
    }

    .empty-msg {
      margin: 0;
      font-size: 14px;
    }

    /* Footer & Pagination */
    .log-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      background: #fafcff;
      flex-wrap: wrap;
      gap: 12px;
    }

    .footer-count {
      font-size: 12.5px;
      color: var(--muted);
      font-weight: 500;
    }

    .pagination {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .page-btn {
      min-width: 32px;
      height: 32px;
      padding: 0 6px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border);
      background: #ffffff;
      color: #334155;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: all 0.15s ease;
    }

    .page-btn:hover:not(:disabled) {
      border-color: var(--border-strong);
      background: #f8fafc;
    }

    .page-btn.active {
      background: var(--green-800);
      color: #ffffff;
      border-color: var(--green-800);
    }

    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    @media (max-width: 1024px) {
      .log-kpis {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 640px) {
      .log-kpis {
        grid-template-columns: 1fr;
      }
      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `]
})
export class ActivityLogComponent {
  auth = inject(AuthService);
  private activityService = inject(ActivityLogService);

  search = '';
  filterActivity = '';
  filterDate = '';
  filterRole = '';

  page = 1;
  pageSize = 12;

  get visibleLogs(): ActivityLog[] {
    return this.activityService.list();
  }

  get recordActivityCount(): number {
    return this.visibleLogs.filter((l) =>
      l.activity.includes('record') || l.activity.includes('status') || l.activity.includes('location')
    ).length;
  }

  get authActivityCount(): number {
    return this.visibleLogs.filter((l) => l.activity.includes('login') || l.activity.includes('Logout')).length;
  }

  get reportActivityCount(): number {
    return this.visibleLogs.filter((l) => l.activity.includes('report')).length;
  }

  get hasActiveFilters(): boolean {
    return !!(this.search || this.filterActivity || this.filterDate || this.filterRole);
  }

  clearFilters(): void {
    this.search = '';
    this.filterActivity = '';
    this.filterDate = '';
    this.filterRole = '';
    this.page = 1;
  }

  get filteredRows(): ActivityLog[] {
    const q = this.search.trim().toLowerCase();
    const actFilter = this.filterActivity.trim().toLowerCase();
    const dateFilter = this.filterDate.trim();
    const roleFilter = this.filterRole.trim().toLowerCase();

    return this.visibleLogs.filter((log) => {
      // 1. Text Search across user, action, details, device
      if (q) {
        const text = [log.userName, log.activity, log.details || '', log.deviceInfo].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }

      // 2. Activity Type Filter
      if (actFilter && !log.activity.toLowerCase().includes(actFilter)) {
        return false;
      }

      // 3. Date Filter (matches YYYY-MM-DD)
      if (dateFilter) {
        const logDateStr = log.createdAt.slice(0, 10);
        if (logDateStr !== dateFilter) return false;
      }

      // 4. Role Filter (Admin only)
      if (this.auth.isAdmin() && roleFilter && log.role !== roleFilter) {
        return false;
      }

      return true;
    });
  }

  get pagedRows(): ActivityLog[] {
    const rows = this.filteredRows;
    const p = this.clampedPage;
    return rows.slice((p - 1) * this.pageSize, p * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get clampedPage(): number {
    return Math.min(Math.max(1, this.page), this.pageCount);
  }

  get pageList(): number[] {
    const total = this.pageCount;
    const cur = this.clampedPage;
    const list: number[] = [];
    const start = Math.max(1, cur - 2);
    const end = Math.min(total, cur + 2);
    for (let i = start; i <= end; i++) {
      list.push(i);
    }
    return list;
  }

  get countText(): string {
    const total = this.filteredRows.length;
    if (total === 0) return 'Showing 0–0 of 0 entries';
    const start = (this.clampedPage - 1) * this.pageSize + 1;
    const end = Math.min(this.clampedPage * this.pageSize, total);
    return `Showing ${start}–${end} of ${total} entries`;
  }

  go(p: number): void {
    this.page = Math.min(Math.max(1, p), this.pageCount);
  }

  fmtDate(iso: string): string {
    return formatPhilippineDate(iso);
  }

  fmtTime(iso: string): string {
    return formatPhilippineTime(iso);
  }
}
