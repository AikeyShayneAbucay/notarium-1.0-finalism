import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentsService, Appointment, AppointmentStatus } from '../core/appointments';
import { UiIcon } from '../shared/icon';
import { UiModal } from '../shared/modal';

const STATUS_META: Record<AppointmentStatus, { cls: string; icon: string }> = {
  Pending: { cls: 'st-pending', icon: 'clock' },
  Approved: { cls: 'st-approved', icon: 'check-circle' },
  Rejected: { cls: 'st-rejected', icon: 'x' },
  Rescheduled: { cls: 'st-resched', icon: 'calendar' },
  Completed: { cls: 'st-completed', icon: 'check-circle' },
  Cancelled: { cls: 'st-cancelled', icon: 'calendar-x' },
};

@Component({
  selector: 'app-portal-my-appointments',
  imports: [FormsModule, RouterLink, UiIcon, UiModal],
  template: `
    <div class="ma">
      <header class="ma-head">
        <h1>My Appointments</h1>
        <p>Track the status of your appointment requests.</p>
      </header>

      @if (error()) {
        <div class="ma-alert">
          <ui-icon name="close" size="14" /> {{ error() }}
        </div>
      }

      @if (loading) {
        <div class="ma-empty"><span class="ma-spinner"></span> Loading your appointments…</div>
      } @else if (rows().length === 0) {
        <div class="ma-empty">
          <ui-icon name="calendar" size="34" />
          <p>You have no appointment requests yet.</p>
          <a class="ma-btn ma-btn-green" routerLink="/portal/book">Book an Appointment</a>
        </div>
      } @else {
        <div class="ma-list">
          @for (a of rows(); track a.id) {
            <article class="ma-card" [class.open]="expanded() === a.id">
              <button class="ma-card-head" type="button" (click)="toggle(a)">
                <div class="ma-card-main">
                  <span class="ma-ref">{{ a.referenceNo }}</span>
                  <span class="ma-doc">{{ a.documentType }}</span>
                  <span class="ma-when">
                    <ui-icon name="calendar" size="14" />
                    {{ fmtDate(a.appointmentDate) }} · {{ fmtTime(a.appointmentTime) }}
                  </span>
                </div>
                <span class="ma-status" [class]="statusMeta(a.status).cls">
                  <ui-icon [name]="statusMeta(a.status).icon" size="14" />
                  {{ a.status }}
                </span>
              </button>

              @if (expanded() === a.id) {
                <div class="ma-card-body">
                  <dl class="ma-detail">
                    <div><dt>Client Name</dt><dd>{{ a.clientName }}</dd></div>
                    <div><dt>Gmail</dt><dd>{{ a.clientEmail }}</dd></div>
                    <div><dt>Contact Number</dt><dd>{{ a.contactNumber }}</dd></div>
                    <div><dt>Document Type</dt><dd>{{ a.documentType }}</dd></div>
                    <div><dt>Date</dt><dd>{{ fmtDate(a.appointmentDate) }}</dd></div>
                    <div><dt>Time</dt><dd>{{ fmtTime(a.appointmentTime) }}</dd></div>
                    @if (a.purpose) {
                      <div class="ma-wide"><dt>Purpose</dt><dd>{{ a.purpose }}</dd></div>
                    }
                    @if (a.remarks) {
                      <div class="ma-wide ma-remarks">
                        <dt>Office Remarks</dt>
                        <dd>{{ a.remarks }}</dd>
                      </div>
                    }
                    <div><dt>Requested On</dt><dd>{{ fmtDateTime(a.createdAt) }}</dd></div>
                    <div><dt>Last Update</dt><dd>{{ fmtDateTime(a.updatedAt) }}</dd></div>
                  </dl>

                  @if (canCancel(a)) {
                    <div class="ma-card-actions">
                      <button class="ma-btn ma-btn-danger" type="button" (click)="pickCancel(a)">
                        <ui-icon name="x" size="15" /> Cancel Appointment
                      </button>
                    </div>
                  }
                </div>
              }
            </article>
          }
        </div>
      }
    </div>

    <!-- Cancel confirmation -->
    <ui-modal [open]="cancelPick !== null" title="Cancel Appointment" width="460px" (close)="cancelPick = null">
      @if (cancelPick; as pick) {
        <p class="ma-cancel-text">
          Cancel appointment <b>{{ pick.referenceNo }}</b> on
          {{ fmtDate(pick.appointmentDate) }} at {{ fmtTime(pick.appointmentTime) }}?
        </p>
        <label class="ma-reason">
          <span>Reason (optional)</span>
          <textarea name="cancelReason" rows="3" maxlength="300" [(ngModel)]="cancelReason"
            placeholder="Let the office know why you are cancelling"></textarea>
        </label>
        @if (cancelError) {
          <div class="ma-alert"><ui-icon name="close" size="14" /> {{ cancelError }}</div>
        }
      }
      <ng-template #foot>
        <button class="ma-btn ma-btn-light" type="button" (click)="cancelPick = null">Keep Appointment</button>
        <button class="ma-btn ma-btn-danger" type="button" [disabled]="cancelling" (click)="confirmCancel()">
          @if (cancelling) { Cancelling… } @else { Cancel Appointment }
        </button>
      </ng-template>
    </ui-modal>

    @if (toast()) {
      <div class="ma-toast"><ui-icon name="check" size="15" /> {{ toast() }}</div>
    }
  `,
  styles: [
    `
      .ma { max-width: 760px; margin: 0 auto; }
      .ma-head h1 { font-size: 24px; color: var(--navy-ink); }
      .ma-head p { margin-top: 5px; font-size: 13.5px; color: var(--muted); }

      .ma-alert {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--red-surface);
        border: 1px solid var(--red-border);
        color: var(--red);
        border-radius: 10px;
        padding: 11px 13px;
        font-size: 13.5px;
      }
      .ma-alert .app-icon { flex: none; }

      .ma-empty {
        margin-top: 22px;
        background: #fff;
        border: 1px dashed var(--border-strong);
        border-radius: 16px;
        padding: 46px 24px;
        text-align: center;
        color: var(--muted);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .ma-list { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }

      .ma-card {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow-xs);
        overflow: hidden;
        transition: box-shadow 0.15s;
      }
      .ma-card.open { box-shadow: var(--shadow-card); }

      .ma-card-head {
        width: 100%;
        border: 0;
        background: none;
        font-family: inherit;
        text-align: left;
        padding: 16px 18px;
        display: flex;
        align-items: center;
        gap: 14px;
        cursor: pointer;
      }
      .ma-card-main { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .ma-ref {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
        color: var(--navy-ink);
      }
      .ma-doc { font-size: 15px; font-weight: 700; color: var(--ink); }
      .ma-when {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--muted);
      }

      .ma-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        flex: none;
      }
      .st-pending    { background: var(--status-pending-bg); color: var(--status-pending-text); border: 1px solid var(--status-pending-border); }
      .st-approved   { background: var(--status-done-bg); color: var(--status-done-text); border: 1px solid var(--status-done-border); }
      .st-completed  { background: var(--status-office-bg); color: var(--status-office-text); border: 1px solid var(--status-office-border); }
      .st-resched    { background: var(--status-office-bg); color: var(--status-office-text); border: 1px solid var(--status-office-border); }
      .st-rejected   { background: var(--red-surface); color: var(--red); border: 1px solid var(--red-border); }
      .st-cancelled  { background: #f1f5f9; color: var(--muted); border: 1px solid var(--border-strong); }

      .ma-card-body { border-top: 1px solid var(--border-2); padding: 16px 18px; }
      .ma-detail {
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 20px;
      }
      .ma-detail div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ma-detail dt { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--subtle); }
      .ma-detail dd { margin: 0; font-size: 13.5px; color: var(--ink); overflow-wrap: anywhere; }
      .ma-wide { grid-column: 1 / -1; }
      .ma-remarks dd {
        background: var(--gold-surface);
        border: 1px solid var(--gold-border);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        color: var(--ink-secondary);
      }

      .ma-card-actions { margin-top: 16px; display: flex; justify-content: flex-end; }

      .ma-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 42px;
        padding: 0 18px;
        border: 0;
        border-radius: 11px;
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s;
      }
      .ma-btn:disabled { opacity: 0.6; cursor: default; }
      .ma-btn-green { background: var(--green-800); color: #fff; }
      .ma-btn-green:hover { background: var(--green-700); }
      .ma-btn-danger { background: var(--red); color: #fff; }
      .ma-btn-danger:hover { background: var(--red-hover); }
      .ma-btn-light { background: #eef2f8; color: var(--ink-secondary); border: 1px solid var(--border); }
      .ma-btn-light:hover { background: #e4eaf3; }

      .ma-cancel-text { font-size: 14px; color: #334155; line-height: 1.6; margin: 2px 0 0; }
      .ma-reason { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
      .ma-reason span { font-size: 12.5px; font-weight: 600; color: var(--ink-secondary); }
      .ma-reason textarea {
        font-family: inherit;
        font-size: 13.5px;
        color: var(--ink);
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        outline: none;
        resize: vertical;
      }
      .ma-reason textarea:focus {
        background: #fff;
        border-color: rgba(31, 58, 95, 0.45);
        box-shadow: 0 0 0 3px rgba(31, 58, 95, 0.08);
      }

      .ma-spinner {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 3px solid #e2e8f0;
        border-top-color: var(--green-800);
        animation: ma-spin 0.8s linear infinite;
      }
      @keyframes ma-spin { to { transform: rotate(360deg); } }

      .ma-toast {
        position: fixed;
        bottom: 26px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 90;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--green-900);
        color: #fff;
        border-radius: 999px;
        padding: 12px 22px;
        font-size: 13.5px;
        font-weight: 600;
        box-shadow: var(--shadow-modal);
        animation: ma-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ma-toast .app-icon { color: #d5ae4f; }
      @keyframes ma-toast-in {
        from { opacity: 0; transform: translate(-50%, 10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }

      @media (max-width: 640px) {
        .ma-detail { grid-template-columns: 1fr; }
        .ma-card-head { flex-wrap: wrap; }
        .ma-status { order: -1; }
      }
    `,
  ],
})
export class PortalMyAppointments implements OnInit {
  private api = inject(AppointmentsService);

  rows = signal<Appointment[]>([]);
  loading = true;
  error = signal('');
  expanded = signal<number | null>(null);

  cancelPick: Appointment | null = null;
  cancelReason = '';
  cancelError = '';
  cancelling = false;

  toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error.set('');
    const { rows, error } = await this.api.mine();
    this.loading = false;
    if (error) {
      this.error.set(error);
      return;
    }
    this.rows.set(rows);
  }

  toggle(a: Appointment): void {
    this.expanded.set(this.expanded() === a.id ? null : a.id);
  }

  statusMeta(s: AppointmentStatus): { cls: string; icon: string } {
    return STATUS_META[s] ?? STATUS_META['Pending'];
  }

  /** Office rule: Pending/Approved appointments may be cancelled until the day before. */
  canCancel(a: Appointment): boolean {
    if (a.status !== 'Pending' && a.status !== 'Approved') return false;
    const d = new Date(a.appointmentDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() > today.getTime();
  }

  pickCancel(a: Appointment): void {
    this.cancelPick = a;
    this.cancelReason = '';
    this.cancelError = '';
  }

  async confirmCancel(): Promise<void> {
    if (!this.cancelPick) return;
    this.cancelling = true;
    this.cancelError = '';
    const err = await this.api.cancel(this.cancelPick.id, this.cancelReason.trim());
    this.cancelling = false;
    if (err) {
      this.cancelError = err;
      return;
    }
    this.cancelPick = null;
    this.showToast('Appointment cancelled.');
    await this.load();
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
