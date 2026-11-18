import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientAuthService } from '../core/client-auth';
import { AppointmentsService } from '../core/appointments';
import { DocTypesService } from '../core/doctypes';
import { UiIcon } from '../shared/icon';

interface TimeSlot {
  value: string; // HH:mm
  label: string; // 9:00 AM
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-portal-book',
  imports: [FormsModule, RouterLink, UiIcon],
  template: `
    <div class="bk">
      @if (done(); as ref) {
        <!-- SUCCESS PANEL -->
        <section class="bk-success">
          <ui-icon name="check-circle" size="44" />
          <h1>Appointment Requested!</h1>
          <p>Your request has been submitted and is awaiting office confirmation.</p>
          <div class="bk-ref">
            <span class="bk-ref-label">Reference Number</span>
            <span class="bk-ref-value">{{ ref }}</span>
          </div>
          <p class="bk-note">Keep this reference number. You can track your appointment status on the My Appointments page.</p>
          <div class="bk-success-actions">
            <a class="bk-btn bk-btn-green" routerLink="/portal/appointments">View My Appointments</a>
            <button class="bk-btn bk-btn-light" type="button" (click)="reset()">Book another</button>
          </div>
        </section>
      } @else {
        <section class="bk-panel">
          <header class="bk-head">
            <h1>Online Appointment</h1>
            <p>Fill out the form to request a notarization appointment. Fields marked * are required.</p>
          </header>

          @if (error()) {
            <div class="bk-alert bk-alert-error">
              <ui-icon name="close" size="14" /> {{ error() }}
            </div>
          }

          <form class="bk-form" (ngSubmit)="submit()" #f="ngForm">
            <div class="bk-grid">
              <!-- Client name -->
              <label class="bk-field">
                <span class="bk-label">Client Name *</span>
                <input
                  type="text"
                  name="clientName"
                  [(ngModel)]="clientName"
                  placeholder="Full name"
                  autocomplete="name"
                  required
                />
              </label>

              <!-- Gmail (read-only) -->
              <label class="bk-field">
                <span class="bk-label">Gmail Address</span>
                <div class="bk-readonly">
                  <ui-icon name="lock" size="14" />
                  {{ clients.account()?.email }}
                </div>
              </label>

              <!-- Contact number -->
              <label class="bk-field">
                <span class="bk-label">Contact Number *</span>
                <input
                  type="tel"
                  name="contactNumber"
                  [(ngModel)]="contactNumber"
                  placeholder="09XXXXXXXXX"
                  autocomplete="tel"
                  required
                />
                @if (contactError()) {
                  <span class="bk-hint bk-hint-error">{{ contactError() }}</span>
                }
              </label>

              <!-- Document type -->
              <label class="bk-field">
                <span class="bk-label">Document Type *</span>
                <select name="documentType" [(ngModel)]="documentType" required>
                  <option value="" disabled>Select a document type…</option>
                  @for (t of docTypes(); track t.id) {
                    <option [value]="t.name">{{ t.name }}</option>
                  }
                </select>
              </label>

              <!-- Date -->
              <label class="bk-field">
                <span class="bk-label">Preferred Date *</span>
                <input
                  type="date"
                  name="appointmentDate"
                  [(ngModel)]="appointmentDate"
                  [min]="minDate"
                  (ngModelChange)="onDateChange()"
                  required
                />
                @if (dateError()) {
                  <span class="bk-hint bk-hint-error">{{ dateError() }}</span>
                } @else {
                  <span class="bk-hint">Open Monday to Saturday. Closed on Sundays.</span>
                }
              </label>

              <!-- Time -->
              <label class="bk-field">
                <span class="bk-label">Preferred Time *</span>
                <select name="appointmentTime" [(ngModel)]="appointmentTime" required>
                  <option value="" disabled>Select a time…</option>
                  @for (s of slots; track s.value) {
                    <option [value]="s.value">{{ s.label }}</option>
                  }
                </select>
                <span class="bk-hint">Booking window: 9:00 AM – 4:00 PM.</span>
              </label>

              <!-- Purpose -->
              <label class="bk-field bk-field-full">
                <span class="bk-label">Purpose / Additional Information</span>
                <textarea
                  name="purpose"
                  [(ngModel)]="purpose"
                  rows="4"
                  maxlength="500"
                  placeholder="Briefly describe the purpose of your visit (optional)"
                ></textarea>
              </label>
            </div>

            <div class="bk-actions">
              <button class="bk-btn bk-btn-green" type="submit" [disabled]="busy || f.invalid">
                @if (busy) {
                  <span class="bk-spinner"></span> Submitting…
                } @else {
                  <ui-icon name="calendar" size="16" /> Request Appointment
                }
              </button>
            </div>
          </form>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .bk { max-width: 760px; margin: 0 auto; }

      .bk-panel {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: var(--shadow-card);
        padding: 30px 32px;
      }
      .bk-head h1 { font-size: 24px; color: var(--navy-ink); }
      .bk-head p { margin-top: 6px; font-size: 13.5px; color: var(--muted); }

      .bk-alert {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 10px;
        padding: 11px 13px;
        font-size: 13.5px;
        font-weight: 500;
      }
      .bk-alert .app-icon { flex: none; }
      .bk-alert-error {
        background: var(--red-surface);
        border: 1px solid var(--red-border);
        color: var(--red);
      }

      .bk-form { margin-top: 20px; }
      .bk-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px 18px;
      }
      .bk-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .bk-field-full { grid-column: 1 / -1; }
      .bk-label { font-size: 12.5px; font-weight: 600; color: var(--ink-secondary); }

      .bk-field input,
      .bk-field select,
      .bk-field textarea {
        font-family: inherit;
        font-size: 14px;
        color: var(--ink);
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 11px 13px;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        width: 100%;
      }
      .bk-field textarea { resize: vertical; }
      .bk-field input:focus,
      .bk-field select:focus,
      .bk-field textarea:focus {
        background: #fff;
        border-color: rgba(31, 58, 95, 0.45);
        box-shadow: 0 0 0 3px rgba(31, 58, 95, 0.08);
      }

      .bk-readonly {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: var(--muted);
        background: #f1f5f9;
        border: 1px dashed var(--border-strong);
        border-radius: 10px;
        padding: 11px 13px;
      }

      .bk-hint { font-size: 12px; color: var(--muted); }
      .bk-hint-error { color: var(--red); font-weight: 500; }

      .bk-actions { margin-top: 24px; display: flex; justify-content: flex-end; }

      .bk-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        height: 46px;
        padding: 0 22px;
        border: 0;
        border-radius: 12px;
        font-family: inherit;
        font-size: 14.5px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s;
      }
      .bk-btn-green { background: var(--green-800); color: #fff; }
      .bk-btn-green:hover { background: var(--green-700); }
      .bk-btn-green:disabled { opacity: 0.55; cursor: not-allowed; }
      .bk-btn-light {
        background: #eef2f8;
        color: var(--ink-secondary);
        border: 1px solid var(--border);
      }
      .bk-btn-light:hover { background: #e4eaf3; }

      .bk-spinner {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        animation: bk-spin 0.8s linear infinite;
      }
      @keyframes bk-spin { to { transform: rotate(360deg); } }

      /* Success panel */
      .bk-success {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: var(--shadow-card);
        padding: 44px 32px;
        text-align: center;
      }
      .bk-success .app-icon { color: var(--green-600); }
      .bk-success h1 { margin-top: 12px; font-size: 25px; color: var(--navy-ink); }
      .bk-success p { margin-top: 8px; font-size: 14px; color: var(--body-c); }
      .bk-ref {
        margin: 20px auto 0;
        display: inline-flex;
        flex-direction: column;
        gap: 4px;
        background: var(--gold-surface);
        border: 1px solid var(--gold-border);
        border-radius: 12px;
        padding: 14px 28px;
      }
      .bk-ref-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--gold-rich);
      }
      .bk-ref-value {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: 600;
        color: var(--ink);
      }
      .bk-note { margin-top: 14px; font-size: 12.5px; color: var(--muted); }
      .bk-success-actions {
        margin-top: 22px;
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      @media (max-width: 640px) {
        .bk-panel { padding: 22px 18px; }
        .bk-grid { grid-template-columns: 1fr; }
        .bk-actions { justify-content: stretch; }
        .bk-actions .bk-btn { width: 100%; }
      }
    `,
  ],
})
export class PortalBook implements OnInit {
  clients = inject(ClientAuthService);
  private api = inject(AppointmentsService);
  private dts = inject(DocTypesService);

  clientName = '';
  contactNumber = '';
  documentType = '';
  appointmentDate = '';
  appointmentTime = '';
  purpose = '';

  busy = false;
  error = signal('');
  done = signal<string | null>(null);

  minDate = tomorrowIso();

  readonly slots: TimeSlot[] = Array.from({ length: 15 }, (_, i) => {
    const h = 9 + Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    const hour12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return { value: `${pad(h)}:${m}`, label: `${hour12}:${m} ${ampm}` };
  });

  docTypes = computed(() => this.dts.list());

  ngOnInit(): void {
    const acc = this.clients.account();
    if (acc) {
      this.clientName = acc.name;
    }
  }

  contactError(): string {
    const v = this.contactNumber.trim();
    if (!v) return '';
    const valid = /^(\+639\d{9}|09\d{9})$/.test(v.replace(/[\s-]/g, ''));
    return valid ? '' : 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).';
  }

  dateError(): string {
    if (!this.appointmentDate) return '';
    const d = new Date(this.appointmentDate + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Invalid date.';
    if (d.getTime() <= Date.now() - 86400000) return 'Appointment date must not be in the past.';
    if (d.getDay() === 0) return 'The office is closed on Sundays. Please choose another date.';
    return '';
  }

  onDateChange(): void {
    // Clear an invalid pick so the form cannot be submitted with it.
    if (this.dateError()) {
      this.appointmentTime = '';
    }
  }

  async submit(): Promise<void> {
    this.error.set('');
    const name = this.clientName.trim();
    const contact = this.contactNumber.trim();

    if (!name || !contact || !this.documentType || !this.appointmentDate || !this.appointmentTime) {
      this.error.set('Please fill out all required fields.');
      return;
    }
    if (this.contactError()) {
      this.error.set(this.contactError());
      return;
    }
    const dErr = this.dateError();
    if (dErr) {
      this.error.set(dErr);
      return;
    }

    this.busy = true;
    try {
      const { appointment, error } = await this.api.create({
        clientName: name,
        contactNumber: contact,
        documentType: this.documentType,
        appointmentDate: this.appointmentDate,
        appointmentTime: this.appointmentTime,
        purpose: this.purpose.trim(),
      });

      if (error || !appointment) {
        this.error.set(error ?? 'Unable to submit the appointment. Please try again.');
        return;
      }
      this.done.set(appointment.referenceNo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Unable to submit appointment. Please try again.');
    } finally {
      this.busy = false;
    }
  }

  reset(): void {
    this.done.set(null);
    this.documentType = '';
    this.appointmentDate = '';
    this.appointmentTime = '';
    this.purpose = '';
    this.contactNumber = '';
    this.error.set('');
    this.minDate = tomorrowIso();
  }
}
