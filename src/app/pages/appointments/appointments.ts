import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppointmentsService, Appointment, AppointmentStatus, APPOINTMENT_STATUSES } from '../../core/appointments';
import { UiIcon } from '../../shared/icon';
import { UiModal } from '../../shared/modal';

const STATUS_PILL: Record<AppointmentStatus, string> = {
  Pending: 'apt-pending',
  Approved: 'apt-approved',
  Rejected: 'apt-rejected',
  Rescheduled: 'apt-resched',
  Completed: 'apt-completed',
  Cancelled: 'apt-cancelled',
};

@Component({
  selector: 'app-appointments',
  imports: [FormsModule, UiIcon, UiModal],
  template: `
    <div class="pg">
      <header class="page-head">
        <h1>Appointment Management</h1>
        <p>Review, approve, reschedule, and track client appointment requests.</p>
      </header>

      @if (setupNotice()) {
        <div class="apt-setup">
          <ui-icon name="bell" size="16" />
          <div>
            <b>Supabase Auth setup required.</b>
            {{ setupNotice() }} Appointments will appear once the office staff accounts are
            linked (see <b>docs/APPOINTMENT_SETUP.md</b>, step 3).
          </div>
        </div>
      }

      <!-- Toolbar -->
      <section class="panel apt-bar">
        <label class="apt-search">
          <ui-icon name="search" size="16" />
          <input
            class="apt-search-input"
            name="aptSearch"
            placeholder="Search client name, ref no, email, contact, service, date…"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
          @if (search()) {
            <button class="apt-search-clear" type="button" title="Clear search" (click)="search.set('')">
              <ui-icon name="x" size="13" />
            </button>
          }
        </label>
        <div class="apt-tabs">
          <button class="apt-tab" type="button" [class.on]="filter() === 'All'" (click)="filter.set('All')">
            All <span class="apt-tab-count">{{ rows().length }}</span>
          </button>
          @for (s of statuses; track s) {
            <button class="apt-tab" type="button" [class.on]="filter() === s" (click)="filter.set(s)">
              {{ s }} <span class="apt-tab-count">{{ countByStatus(s) }}</span>
            </button>
          }
        </div>
        <button class="btn btn-light" type="button" (click)="load()" [disabled]="loading()">
          <ui-icon name="check" size="15" /> Refresh
        </button>
      </section>

      @if (pageError()) {
        <div class="apt-error">
          <ui-icon name="close" size="14" /> {{ pageError() }}
        </div>
      }

      <!-- Table -->
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Reference No.</th>
                <th>Client</th>
                <th>Document Type</th>
                <th>Schedule</th>
                <th>Status</th>
                <th class="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                <tr><td colspan="6" class="empty">Loading appointments…</td></tr>
              } @else if (filtered().length === 0) {
                <tr><td colspan="6" class="empty">
                  @if (search()) {
                    No appointments match "{{ search() }}".
                  } @else if (filter() !== 'All') {
                    No {{ filter() }} appointments found.
                  } @else {
                    No appointment requests found.
                  }
                </td></tr>
              } @else {
                @for (a of filtered(); track a.id) {
                  <tr>
                    <td class="doc-no">{{ a.referenceNo }}</td>
                    <td>
                      <div class="cell-strong">{{ a.clientName }}</div>
                      <div class="apt-sub">{{ a.clientEmail }}</div>
                      <div class="apt-sub">{{ a.contactNumber }}</div>
                    </td>
                    <td class="serif-name">{{ a.documentType }}</td>
                    <td>
                      <div>{{ fmtDate(a.appointmentDate) }}</div>
                      <div class="apt-sub">{{ fmtTime(a.appointmentTime) }}</div>
                    </td>
                    <td><span class="status-pill" [class]="pill(a.status)">{{ a.status }}</span></td>
                    <td class="td-actions">
                      <div class="apt-actions">
                        <button class="icon-btn" type="button" title="View details" (click)="pickDetails(a)">
                          <ui-icon name="eye" size="15" />
                        </button>
                        @if (a.status === 'Pending') {
                          <button class="icon-btn apt-ok" type="button" title="Approve" (click)="approve(a)">
                            <ui-icon name="check" size="15" />
                          </button>
                          <button class="icon-btn danger" type="button" title="Reject with remarks" (click)="pickReject(a)">
                            <ui-icon name="x" size="15" />
                          </button>
                          <button class="icon-btn" type="button" title="Reschedule" (click)="pickReschedule(a)">
                            <ui-icon name="calendar" size="15" />
                          </button>
                        } @else if (a.status === 'Approved') {
                          <button class="icon-btn apt-ok" type="button" title="Mark Completed" (click)="pickComplete(a)">
                            <ui-icon name="check-circle" size="15" />
                          </button>
                          <button class="icon-btn" type="button" title="Reschedule" (click)="pickReschedule(a)">
                            <ui-icon name="calendar" size="15" />
                          </button>
                        } @else if (a.status === 'Rescheduled') {
                          <button class="icon-btn apt-ok" type="button" title="Approve new schedule" (click)="approve(a)">
                            <ui-icon name="check" size="15" />
                          </button>
                        }
                        @if (a.status === 'Pending' || a.status === 'Approved' || a.status === 'Rescheduled') {
                          <button class="icon-btn danger" type="button" title="Mark Cancelled" (click)="pickCancel(a)">
                            <ui-icon name="calendar-x" size="15" />
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <div class="table-foot">
          <span>{{ filtered().length }} of {{ rows().length }} appointment(s)</span>
        </div>
      </section>
    </div>

    <!-- Details modal -->
    <ui-modal [open]="detailPick !== null" title="Appointment Details" width="560px" (close)="detailPick = null">
      @if (detailPick; as a) {
        <dl class="apt-detail">
          <div><dt>Reference No.</dt><dd class="doc-no">{{ a.referenceNo }}</dd></div>
          <div><dt>Status</dt><dd><span class="status-pill" [class]="pill(a.status)">{{ a.status }}</span></dd></div>
          <div><dt>Client Name</dt><dd>{{ a.clientName }}</dd></div>
          <div><dt>Gmail</dt><dd>{{ a.clientEmail }}</dd></div>
          <div><dt>Contact Number</dt><dd>{{ a.contactNumber }}</dd></div>
          <div><dt>Document Type</dt><dd>{{ a.documentType }}</dd></div>
          <div><dt>Date</dt><dd>{{ fmtDate(a.appointmentDate) }}</dd></div>
          <div><dt>Time</dt><dd>{{ fmtTime(a.appointmentTime) }}</dd></div>
          @if (a.purpose) {
            <div class="apt-wide"><dt>Purpose</dt><dd>{{ a.purpose }}</dd></div>
          }
          @if (a.remarks) {
            <div class="apt-wide"><dt>Remarks</dt><dd>{{ a.remarks }}</dd></div>
          }
          <div><dt>Requested On</dt><dd>{{ fmtDateTime(a.createdAt) }}</dd></div>
          <div><dt>Last Update</dt><dd>{{ fmtDateTime(a.updatedAt) }}</dd></div>
        </dl>
        <p class="apt-hint">Approved appointments do not create a notarization record. Records are created in Notarization Records only after the document is notarized.</p>
      }
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="detailPick = null">Close</button>
      </ng-template>
    </ui-modal>

    <!-- Reject modal -->
    <ui-modal [open]="rejectPick !== null" title="Reject Appointment" width="480px" (close)="rejectPick = null">
      @if (rejectPick; as a) {
        <p class="apt-modal-text">
          Reject appointment <b class="doc-no">{{ a.referenceNo }}</b> from
          {{ a.clientName }}? The client will see your remarks in their portal.
        </p>
        <label class="lbl" style="margin-top:14px">Remarks <span class="lbl-req">*</span></label>
        <textarea class="field" name="rejectRemarks" rows="3" maxlength="300"
          [(ngModel)]="rejectRemarks" placeholder="Explain why this appointment is rejected"></textarea>
        @if (actionError()) {
          <div class="apt-error" style="margin-top:12px"><ui-icon name="close" size="14" /> {{ actionError() }}</div>
        }
      }
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="rejectPick = null">Back</button>
        <button class="btn btn-red" type="button" [disabled]="acting" (click)="confirmReject()">
          @if (acting) { Rejecting… } @else { Reject Appointment }
        </button>
      </ng-template>
    </ui-modal>

    <!-- Reschedule modal -->
    <ui-modal [open]="reschedPick !== null" title="Reschedule Appointment" width="480px" (close)="reschedPick = null">
      @if (reschedPick; as a) {
        <p class="apt-modal-text">
          Move <b class="doc-no">{{ a.referenceNo }}</b> ({{ a.clientName }}) to a new schedule.
        </p>
        <div class="apt-resched-grid">
          <div>
            <label class="lbl">New Date <span class="lbl-req">*</span></label>
            <input class="field" type="date" name="reschedDate" [(ngModel)]="reschedDate" [min]="minDate" />
          </div>
          <div>
            <label class="lbl">New Time <span class="lbl-req">*</span></label>
            <select class="field" name="reschedTime" [(ngModel)]="reschedTime">
              <option value="" disabled>Select time…</option>
              @for (s of slots; track s.value) {
                <option [value]="s.value">{{ s.label }}</option>
              }
            </select>
          </div>
        </div>
        <label class="lbl" style="margin-top:12px">Remarks</label>
        <textarea class="field" name="reschedRemarks" rows="2" maxlength="300"
          [(ngModel)]="reschedRemarks" placeholder="Optional note for the client about the new schedule"></textarea>
        @if (actionError()) {
          <div class="apt-error" style="margin-top:12px"><ui-icon name="close" size="14" /> {{ actionError() }}</div>
        }
      }
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="reschedPick = null">Back</button>
        <button class="btn btn-navy" type="button" [disabled]="acting" (click)="confirmReschedule()">
          @if (acting) { Rescheduling… } @else { Reschedule }
        </button>
      </ng-template>
    </ui-modal>

    <!-- Cancel modal -->
    <ui-modal [open]="cancelPick !== null" title="Cancel Appointment" width="460px" (close)="cancelPick = null">
      @if (cancelPick; as a) {
        <p class="apt-modal-text">
          Mark <b class="doc-no">{{ a.referenceNo }}</b> ({{ a.clientName }}) as Cancelled?
        </p>
        <label class="lbl" style="margin-top:14px">Remarks</label>
        <textarea class="field" name="cancelRemarks" rows="2" maxlength="300"
          [(ngModel)]="cancelRemarks" placeholder="Optional remarks for the client"></textarea>
        @if (actionError()) {
          <div class="apt-error" style="margin-top:12px"><ui-icon name="close" size="14" /> {{ actionError() }}</div>
        }
      }
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="cancelPick = null">Back</button>
        <button class="btn btn-red" type="button" [disabled]="acting" (click)="confirmCancel()">
          @if (acting) { Cancelling… } @else { Cancel Appointment }
        </button>
      </ng-template>
    </ui-modal>

    @if (toast()) {
      <div class="toast"><ui-icon name="check" size="16" /> {{ toast() }}</div>
    }
  `,
  styles: [
    `
      .apt-setup {
        margin: -12px 0 20px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        background: var(--status-pending-bg);
        border: 1px solid var(--status-pending-border);
        color: var(--status-pending-text);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        font-size: 13px;
        line-height: 1.55;
      }
      .apt-setup .app-icon { flex: none; margin-top: 2px; }

      .apt-bar {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 14px 18px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .apt-search {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f8fafc;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 0 12px;
        height: 40px;
        min-width: 260px;
        flex: 1;
      }
      .apt-search .app-icon { color: var(--muted); }
      .apt-search-clear {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: var(--muted);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-full);
        transition: color 0.15s ease, background 0.15s ease;
      }
      .apt-search-clear:hover {
        color: var(--red);
        background: rgba(220, 38, 38, 0.08);
      }
      .apt-search-input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        font-family: inherit;
        font-size: 13.5px;
        color: var(--ink);
      }

      .apt-tabs {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .apt-tab {
        border: 1px solid var(--border);
        background: #fff;
        color: var(--body-c);
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        padding: 7px 12px;
        border-radius: var(--radius-full);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .apt-tab:hover { border-color: var(--border-strong); color: var(--navy); }
      .apt-tab.on { background: var(--green-900); border-color: var(--green-900); color: #fff; }
      .apt-tab-count {
        background: rgba(15, 23, 42, 0.07);
        border-radius: var(--radius-full);
        padding: 1px 7px;
        font-size: 11px;
        font-weight: 700;
      }
      .apt-tab.on .apt-tab-count { background: rgba(255, 255, 255, 0.2); }

      .apt-error {
        margin: -8px 0 18px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--red-surface);
        border: 1px solid var(--red-border);
        color: var(--red);
        border-radius: var(--radius-sm);
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
      }

      .apt-sub { color: var(--muted); font-size: 12px; margin-top: 1px; }
      .apt-actions { display: inline-flex; gap: 6px; justify-content: center; }
      .apt-actions .icon-btn { width: 30px; height: 30px; }
      .apt-actions .icon-btn.apt-ok { color: var(--green-700); }
      .apt-actions .icon-btn.apt-ok:hover { color: var(--green-800); background: var(--green-surface); border-color: var(--green-border); }

      /* appointment status pills */
      .status-pill.apt-pending   { background: var(--status-pending-bg); color: var(--status-pending-text); border: 1px solid var(--status-pending-border); }
      .status-pill.apt-pending::before { background: #d97706; }
      .status-pill.apt-approved  { background: var(--status-done-bg); color: var(--status-done-text); border: 1px solid var(--status-done-border); }
      .status-pill.apt-approved::before { background: #059669; }
      .status-pill.apt-rejected  { background: var(--red-surface); color: var(--red); border: 1px solid var(--red-border); }
      .status-pill.apt-rejected::before { background: #dc2626; }
      .status-pill.apt-resched   { background: var(--status-office-bg); color: var(--status-office-text); border: 1px solid var(--status-office-border); }
      .status-pill.apt-resched::before { background: #2563eb; }
      .status-pill.apt-completed { background: var(--green-surface); color: var(--green-800); border: 1px solid var(--green-border); }
      .status-pill.apt-completed::before { background: #1f5d4a; }
      .status-pill.apt-cancelled { background: #f1f5f9; color: var(--muted); border: 1px solid var(--border-strong); }
      .status-pill.apt-cancelled::before { background: #64748b; }

      .apt-detail { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
      .apt-detail div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .apt-detail dt { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--subtle); }
      .apt-detail dd { margin: 0; font-size: 13.5px; color: var(--ink); overflow-wrap: anywhere; }
      .apt-wide { grid-column: 1 / -1; }

      .apt-hint {
        margin: 18px 0 0;
        font-size: 12.5px;
        color: var(--muted);
        background: var(--gold-surface);
        border: 1px dashed var(--gold-border);
        border-radius: var(--radius-sm);
        padding: 10px 14px;
      }

      .apt-modal-text { margin: 2px 0 0; font-size: 14px; color: #334155; line-height: 1.6; }
      .apt-resched-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }

      .toast {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 90;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--green-900);
        color: #fff;
        border-radius: var(--radius-full);
        padding: 12px 22px;
        font-size: 13.5px;
        font-weight: 600;
        box-shadow: var(--shadow-modal);
        animation: apt-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast .app-icon { color: #d5ae4f; }
      @keyframes apt-toast-in {
        from { opacity: 0; transform: translate(-50%, 10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }

      @media (max-width: 640px) {
        .apt-detail { grid-template-columns: 1fr; }
        .apt-resched-grid { grid-template-columns: 1fr; }
        .apt-search { min-width: 100%; }
      }
    `,
  ],
})
export class AppointmentsPage implements OnInit {
  private api = inject(AppointmentsService);

  rows = signal<Appointment[]>([]);
  loading = signal(true);
  setupNotice = signal('');

  search = signal('');
  filter = signal<'All' | AppointmentStatus>('All');
  readonly statuses = APPOINTMENT_STATUSES;

  pageError = signal('');
  actionError = signal('');
  acting = false;

  detailPick: Appointment | null = null;

  rejectPick: Appointment | null = null;
  rejectRemarks = '';

  reschedPick: Appointment | null = null;
  reschedDate = '';
  reschedTime = '';
  reschedRemarks = '';
  minDate = tomorrowIso();

  cancelPick: Appointment | null = null;
  cancelRemarks = '';

  toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  readonly slots = buildSlots();

  private unsubscribeRealtime?: () => void;

  ngOnInit(): void {
    this.load();
    // Live synchronization: newly submitted client appointments automatically appear
    this.unsubscribeRealtime = this.api.subscribeToChanges(() => {
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
    this.pageError.set('');
    try {
      const { rows, error } = await this.api.all();
      if (error) {
        this.pageError.set(
          error.includes('schema') || error.includes('relation')
            ? 'The appointments table is not created yet. Run the migration in supabase/migrations/20261118000000_create_appointments.sql first.'
            : error,
        );
      } else {
        this.rows.set(rows);
      }

      const hasAuth = await this.api.ensureStaffSession();
      // If RPC fallback is available, staff management works seamlessly
      this.setupNotice.set('');
    } catch (err: unknown) {
      this.pageError.set(err instanceof Error ? err.message : 'Failed to load appointments.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadSilent(): Promise<void> {
    try {
      const { rows, error } = await this.api.all();
      if (!error && rows) {
        this.rows.set(rows);
      }
    } catch {
      // Silent sync
    }
  }

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((a) => {
      if (f !== 'All' && a.status !== f) return false;
      if (!q) return true;
      const dateStr = this.fmtDate(a.appointmentDate).toLowerCase();
      const rawDate = (a.appointmentDate || '').toLowerCase();
      return (
        (a.referenceNo || '').toLowerCase().includes(q) ||
        (a.clientName || '').toLowerCase().includes(q) ||
        (a.clientEmail || '').toLowerCase().includes(q) ||
        (a.contactNumber || '').toLowerCase().includes(q) ||
        (a.documentType || '').toLowerCase().includes(q) ||
        (a.purpose || '').toLowerCase().includes(q) ||
        (a.remarks || '').toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        rawDate.includes(q)
      );
    });
  });

  countByStatus(s: AppointmentStatus): number {
    return this.rows().filter((a) => a.status === s).length;
  }

  pill(s: AppointmentStatus): string {
    return STATUS_PILL[s];
  }

  // ---- Actions ----

  pickDetails(a: Appointment): void {
    this.detailPick = a;
  }

  approve(a: Appointment): void {
    this.commit(
      this.api.setStatus(a.id, 'Approved', a.remarks, a.referenceNo),
      `Appointment ${a.referenceNo} approved.`,
    );
  }

  pickReject(a: Appointment): void {
    this.rejectPick = a;
    this.rejectRemarks = '';
    this.actionError.set('');
  }

  async confirmReject(): Promise<void> {
    if (!this.rejectPick) return;
    if (!this.rejectRemarks.trim()) {
      this.actionError.set('Remarks are required when rejecting an appointment.');
      return;
    }
    this.acting = true;
    const err = await this.api.setStatus(
      this.rejectPick.id,
      'Rejected',
      this.rejectRemarks.trim(),
      this.rejectPick.referenceNo,
    );
    this.acting = false;
    if (err) {
      this.actionError.set(err);
      return;
    }
    const ref = this.rejectPick.referenceNo;
    this.rejectPick = null;
    this.showToast(`Appointment ${ref} rejected.`);
    await this.load();
  }

  pickReschedule(a: Appointment): void {
    this.reschedPick = a;
    this.reschedDate = a.appointmentDate;
    this.reschedTime = a.appointmentTime;
    this.reschedRemarks = '';
    this.actionError.set('');
  }

  async confirmReschedule(): Promise<void> {
    if (!this.reschedPick) return;
    if (!this.reschedDate || !this.reschedTime) {
      this.actionError.set('Please choose a new date and time.');
      return;
    }
    const d = new Date(this.reschedDate + 'T00:00:00');
    if (isNaN(d.getTime()) || d.getTime() <= Date.now() - 86400000) {
      this.actionError.set('The new date must be in the future.');
      return;
    }
    if (d.getDay() === 0) {
      this.actionError.set('The office is closed on Sundays. Please choose another date.');
      return;
    }
    this.acting = true;
    const err = await this.api.reschedule(
      this.reschedPick.id,
      this.reschedDate,
      this.reschedTime,
      this.reschedRemarks.trim(),
      this.reschedPick.referenceNo,
    );
    this.acting = false;
    if (err) {
      this.actionError.set(err);
      return;
    }
    const ref = this.reschedPick.referenceNo;
    this.reschedPick = null;
    this.showToast(`Appointment ${ref} rescheduled.`);
    await this.load();
  }

  pickComplete(a: Appointment): void {
    this.commit(
      this.api.setStatus(a.id, 'Completed', a.remarks, a.referenceNo),
      `Appointment ${a.referenceNo} completed.`,
    );
  }

  pickCancel(a: Appointment): void {
    this.cancelPick = a;
    this.cancelRemarks = '';
    this.actionError.set('');
  }

  async confirmCancel(): Promise<void> {
    if (!this.cancelPick) return;
    this.acting = true;
    const err = await this.api.setStatus(
      this.cancelPick.id,
      'Cancelled',
      this.cancelRemarks.trim(),
      this.cancelPick.referenceNo,
    );
    this.acting = false;
    if (err) {
      this.actionError.set(err);
      return;
    }
    const ref = this.cancelPick.referenceNo;
    this.cancelPick = null;
    this.showToast(`Appointment ${ref} cancelled.`);
    await this.load();
  }

  /** One-shot action with toast + refresh (approve / complete). */
  private commit(p: Promise<string | null>, msg: string): void {
    p.then(async (err) => {
      if (err) {
        this.pageError.set(err);
        return;
      }
      this.showToast(msg);
      await this.load();
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2600);
  }

  fmtDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  fmtTime(hhmm: string): string {
    if (!hhmm) return '—';
    const [h, m] = hhmm.split(':').map(Number);
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
  }

  fmtDateTime(iso: string): string {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildSlots(): { value: string; label: string }[] {
  return Array.from({ length: 15 }, (_, i) => {
    const h = 9 + Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    const hour12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return { value: `${pad(h)}:${m}`, label: `${hour12}:${m} ${ampm}` };
  });
}
