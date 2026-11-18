import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth';
import { DocTypesService } from '../../core/doctypes';
import { SettingsService } from '../../core/settings';
import { UiIcon } from '../../shared/icon';
import { UiModal } from '../../shared/modal';

type Tab = 'staff' | 'doctypes' | 'office';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, UiIcon, UiModal],
  template: `
    <div class="pg ss-page">

      <!-- ── Page Header ── -->
      <header class="page-head">
        <h1>System Settings</h1>
        <p>Manage your law office information, staff accounts, and document types.</p>
      </header>

      <!-- ── Tab Cards ── -->
      <div class="ss-tabs">
        <button
          class="ss-tab"
          [class.active]="tab === 'staff'"
          type="button"
          (click)="tab = 'staff'"
        >
          <div class="ss-tab-icon">
            <ui-icon name="users" size="26" />
          </div>
          <div class="ss-tab-body">
            <strong>Staff Accounts</strong>
            <span>Manage staff accounts, roles, and access permissions.</span>
          </div>
        </button>

        <button
          class="ss-tab"
          [class.active]="tab === 'doctypes'"
          type="button"
          (click)="tab = 'doctypes'"
        >
          <div class="ss-tab-icon">
            <ui-icon name="bank" size="26" />
          </div>
          <div class="ss-tab-body">
            <strong>Document Types</strong>
            <span>Manage available notarized document types.</span>
          </div>
        </button>

        <button
          class="ss-tab"
          [class.active]="tab === 'office'"
          type="button"
          (click)="tab = 'office'; refreshDraft()"
        >
          <div class="ss-tab-icon">
            <ui-icon name="landmark" size="26" />
          </div>
          <div class="ss-tab-body">
            <strong>Office Information</strong>
            <span>Manage your law office profile and contact details.</span>
          </div>
        </button>
      </div>

      <!-- ══════════════════════════════════════════
           TAB 1 — STAFF ACCOUNTS
      ══════════════════════════════════════════ -->
      @if (tab === 'staff') {
        <section class="ss-section">
          <div class="ss-sec-head">
            <div class="ss-sec-title">
              <ui-icon name="users" size="20" />
              <h2>Staff Accounts</h2>
            </div>
            <button class="btn btn-green" type="button" (click)="openAddStaff()">
              <ui-icon name="plus" size="15" /> Add Staff Account
            </button>
          </div>

          <div class="panel">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th class="num-col">#</th>
                    <th>Name</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th class="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of auth.users; track u.id; let i = $index) {
                    <tr>
                      <td class="idx">{{ i + 1 }}</td>
                      <td class="cell-strong">{{ u.name }}</td>
                      <td>{{ u.email }}</td>
                      <td>
                        @if (u.role === 'admin') {
                          <span class="badge badge-admin">Administrator</span>
                        } @else {
                          <span class="badge badge-staff">Secretary / Staff</span>
                        }
                      </td>
                      <td class="td-actions">
                        @if (u.id === auth.user?.id) {
                          <span class="muted-label">You</span>
                        } @else if (u.role === 'admin') {
                          <span class="muted-label">—</span>
                        } @else {
                          <button class="icon-btn danger" title="Remove account" type="button" (click)="pickDeleteStaff(u)">
                            <ui-icon name="trash" size="15" />
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      <!-- ══════════════════════════════════════════
           TAB 2 — DOCUMENT TYPES
      ══════════════════════════════════════════ -->
      @if (tab === 'doctypes') {
        <section class="ss-section">
          <div class="ss-sec-head">
            <div class="ss-sec-title">
              <ui-icon name="bank" size="20" />
              <h2>Document Types</h2>
            </div>
          </div>

          <div class="panel dt-bar">
            <input
              class="field dt-input"
              name="dtNew"
              placeholder="New document type name (e.g. Affidavit of Expense)"
              [(ngModel)]="newDtName"
              (keyup.enter)="addDocType()"
            />
            <button class="btn btn-green" type="button" (click)="addDocType()">
              <ui-icon name="plus" size="16" /> Add Type
            </button>
          </div>
          @if (dtError) {
            <div class="dt-error">{{ dtError }}</div>
          }

          <div class="panel">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Document Type</th>
                    <th>Records</th>
                    <th class="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of dtypes(); track t.id) {
                    <tr>
                      <td class="serif-name">{{ t.name }}</td>
                      <td class="rec-count">{{ dtCountFor(t.name) }} record(s)</td>
                      <td class="td-actions">
                        @if (dtCountFor(t.name) > 0) {
                          <span class="in-use">In use</span>
                        } @else {
                          <button class="icon-btn danger" title="Delete type" type="button" (click)="pickDeleteDt(t)">
                            <ui-icon name="trash" size="15" />
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      <!-- ══════════════════════════════════════════
           TAB 3 — OFFICE INFORMATION
      ══════════════════════════════════════════ -->
      @if (tab === 'office') {
        <section class="ss-section">
          <div class="ss-sec-head">
            <div class="ss-sec-title">
              <ui-icon name="landmark" size="20" />
              <h2>Office Information</h2>
            </div>
          </div>

          <!-- Profile banner -->
          <div class="office-banner">
            <div class="office-banner-icon">
              <ui-icon name="landmark" size="34" />
            </div>
            <div class="office-banner-info">
              <h3>{{ svc.settings.name || 'Palasan Law Office' }}</h3>
              <p>Official law office profile &amp; contact details</p>
            </div>
          </div>

          <!-- Office details form -->
          <div class="panel office-form-card">
            <div class="office-form-header">
              <ui-icon name="edit" size="17" />
              <span>Edit Office Details</span>
            </div>

            <div class="office-fields">
              <div class="fg">
                <label class="lbl">
                  Office Name <span class="lbl-req">*</span>
                </label>
                <input
                  class="field"
                  name="oName"
                  placeholder="e.g. Palasan Law Office"
                  [(ngModel)]="draft.name"
                />
              </div>

              <div class="fg">
                <label class="lbl">Office Address</label>
                <input
                  class="field"
                  name="oAddress"
                  placeholder="Street, Barangay, City, Province"
                  [(ngModel)]="draft.address"
                />
              </div>

              <div class="fg">
                <label class="lbl">Contact Number</label>
                <input
                  class="field"
                  name="oContact"
                  placeholder="09XXXXXXXXX or (02) XXXX-XXXX"
                  [(ngModel)]="draft.contact"
                />
              </div>
            </div>

            @if (officeError) {
              <div class="form-error">{{ officeError }}</div>
            }

            <div class="office-form-foot">
              <button class="btn btn-green office-save-btn" type="button" (click)="saveOffice()">
                <ui-icon name="save" size="16" /> Save Changes
              </button>
              @if (officeSaved()) {
                <span class="save-ok">
                  <ui-icon name="check" size="14" /> Office information saved successfully.
                </span>
              }
            </div>
          </div>
        </section>
      }
    </div>

    <!-- ── Add Staff Modal ── -->
    <ui-modal [open]="staffAddOpen" title="Add Staff Account" width="480px" (close)="staffAddOpen = false">
      <div class="form-grid">
        <div class="fg">
          <label class="lbl">Name <span class="lbl-req">*</span></label>
          <input class="field" name="sName" placeholder="Full name" [ngModel]="staffDraft.name" (ngModelChange)="staffDraft.name = $event" />
        </div>
        <div class="fg">
          <label class="lbl">Email Address <span class="lbl-req">*</span></label>
          <input class="field" type="email" name="sEmail" placeholder="staff@notarium.com" [ngModel]="staffDraft.email" (ngModelChange)="staffDraft.email = $event" />
        </div>
        <div class="fg">
          <label class="lbl">Password <span class="lbl-req">*</span></label>
          <input class="field" type="text" name="sPass" placeholder="Temporary password" [ngModel]="staffDraft.password" (ngModelChange)="staffDraft.password = $event" />
        </div>
        <p class="role-note">Role: <b>Secretary / Staff</b> — can view dashboard, records, and reports.</p>
        @if (staffAddError) {
          <div class="form-error">{{ staffAddError }}</div>
        }
      </div>
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="staffAddOpen = false">Cancel</button>
        <button class="btn btn-green" type="button" (click)="saveStaff()">Add Account</button>
      </ng-template>
    </ui-modal>

    <!-- ── Delete Staff Confirm Modal ── -->
    <ui-modal [open]="staffDelPick !== null" title="Remove Account" width="440px" (close)="staffDelPick = null">
      <p class="del-text">
        Remove staff account <b>{{ staffDelPick?.name }}</b> ({{ staffDelPick?.email }})?
        This account will no longer be able to sign in.
      </p>
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="staffDelPick = null">Cancel</button>
        <button class="btn btn-red" type="button" (click)="confirmDeleteStaff()">Remove</button>
      </ng-template>
    </ui-modal>

    <!-- ── Delete Doc Type Confirm Modal ── -->
    <ui-modal [open]="dtDelPick !== null" title="Delete Document Type" width="440px" (close)="dtDelPick = null">
      <p class="del-text">
        Delete document type <b>{{ dtDelPick?.name }}</b>? This cannot be undone.
      </p>
      <ng-template #foot>
        <button class="btn btn-light" type="button" (click)="dtDelPick = null">Cancel</button>
        <button class="btn btn-red" type="button" (click)="confirmDeleteDt()">Delete</button>
      </ng-template>
    </ui-modal>

    @if (toast()) {
      <div class="toast"><ui-icon name="check" size="16" /> {{ toast() }}</div>
    }
  `,
  styles: [`
    /* ── Page layout ── */
    .ss-page { max-width: 1100px; }

    /* ── Tab Cards Row ── */
    .ss-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-bottom: 32px;
    }

    .ss-tab {
      display: flex;
      align-items: flex-start;
      gap: 18px;
      background: #ffffff;
      border: 2px solid var(--border);
      border-radius: 16px;
      padding: 22px 20px;
      cursor: pointer;
      transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s;
      text-align: left;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }

    .ss-tab:hover {
      border-color: var(--gold-border);
      box-shadow: 0 4px 16px rgba(201,165,68,0.14);
      transform: translateY(-2px);
    }

    .ss-tab.active {
      border-color: var(--gold);
      background: linear-gradient(135deg, #fffdf4 0%, #fdfaf0 100%);
      box-shadow: 0 4px 20px rgba(201,165,68,0.18);
    }

    .ss-tab-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      background: #f1f5f9;
      color: var(--muted);
      transition: background 0.18s, color 0.18s;
    }

    .ss-tab:hover .ss-tab-icon,
    .ss-tab.active .ss-tab-icon {
      background: var(--gold-surface);
      color: var(--gold-rich);
    }

    .ss-tab.active .ss-tab-icon {
      background: var(--gold-surface);
      color: var(--gold-rich);
      box-shadow: 0 2px 8px rgba(201,165,68,0.18);
    }

    .ss-tab-body {
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: 1;
      min-width: 0;
    }

    .ss-tab-body strong {
      font-size: 15px;
      font-weight: 700;
      color: var(--navy-deep);
      line-height: 1.2;
    }

    .ss-tab.active .ss-tab-body strong {
      color: var(--navy);
    }

    .ss-tab-body span {
      font-size: 12.5px;
      color: var(--muted);
      line-height: 1.4;
      font-weight: 400;
    }

    /* ── Section wrapper ── */
    .ss-section { display: flex; flex-direction: column; gap: 20px; }

    .ss-sec-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding-bottom: 4px;
    }

    .ss-sec-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ss-sec-title .app-icon { color: var(--navy); }

    .ss-sec-title h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy-deep);
      letter-spacing: -0.01em;
    }

    /* ── Staff table ── */
    .num-col { width: 60px; text-align: center; }
    .idx { color: var(--muted); text-align: center; font-variant-numeric: tabular-nums; font-weight: 500; }
    .muted-label { color: var(--muted); font-size: 13px; font-style: italic; }

    /* ── Document Types ── */
    .dt-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 16px 20px;
      flex-wrap: wrap;
    }
    .dt-input { flex: 1; min-width: 260px; height: 40px; }
    .dt-bar .btn { height: 40px; }

    .dt-error {
      font-size: 13px;
      color: var(--red);
      background: var(--red-surface);
      border: 1px solid var(--red-border);
      border-radius: var(--radius-sm);
      padding: 10px 16px;
      font-weight: 500;
    }

    .rec-count { color: var(--muted); font-size: 13px; font-weight: 500; }
    .in-use {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: var(--radius-full);
      background: #f1f5f9; color: var(--muted);
      font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    }

    /* ── Office Information ── */
    .office-banner {
      display: flex;
      align-items: center;
      gap: 22px;
      background: linear-gradient(135deg, var(--navy) 0%, #1e5c47 100%);
      border-radius: 16px;
      padding: 28px 32px;
      color: #ffffff;
    }

    .office-banner-icon {
      width: 70px;
      height: 70px;
      border-radius: 18px;
      background: rgba(255,255,255,0.12);
      border: 1.5px solid rgba(201,165,68,0.5);
      display: grid;
      place-items: center;
      flex-shrink: 0;
      color: var(--gold);
    }

    .office-banner-info h3 {
      margin: 0 0 5px;
      font-size: 22px;
      font-weight: 700;
      font-family: 'Playfair Display', Georgia, serif;
      letter-spacing: 0.01em;
    }

    .office-banner-info p {
      margin: 0;
      font-size: 13.5px;
      color: rgba(255,255,255,0.72);
    }

    .office-form-card {
      max-width: 680px;
      padding: 28px 32px 32px;
    }

    .office-form-header {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 14px;
      font-weight: 600;
      color: var(--navy);
      margin-bottom: 22px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .office-form-header .app-icon { color: var(--gold-rich); }

    .office-fields {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .fg { display: flex; flex-direction: column; gap: 6px; }

    .office-form-foot {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 28px;
      flex-wrap: wrap;
    }

    .office-save-btn { height: 44px; padding: 0 24px; font-size: 14px; }

    .save-ok {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
      font-weight: 600;
      color: var(--green-800);
      background: var(--status-done-bg);
      border: 1px solid var(--status-done-border);
      border-radius: var(--radius-xs);
      padding: 8px 14px;
      animation: fade-in 0.2s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: none; }
    }

    /* ── Shared form styles ── */
    .form-grid { display: grid; gap: 16px; }
    .role-note {
      font-size: 13px; color: var(--body-c);
      background: #f8fafc; border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 10px 14px; line-height: 1.5;
    }
    .role-note b { color: var(--navy); }
    .form-error {
      font-size: 13px; color: var(--red); background: var(--red-surface);
      border: 1px solid var(--red-border); border-radius: var(--radius-sm);
      padding: 10px 14px; font-weight: 500;
    }
    .del-text { font-size: 14px; color: #334155; line-height: 1.6; margin: 4px 0; }

    /* ── Responsive ── */
    @media (max-width: 860px) {
      .ss-tabs { grid-template-columns: 1fr; }
      .office-banner { flex-direction: column; align-items: flex-start; padding: 22px 20px; }
      .office-form-card { max-width: 100%; }
    }
    @media (max-width: 600px) {
      .ss-tab { flex-direction: column; gap: 12px; }
    }
  `],
})
export class Settings {
  auth = inject(AuthService);
  private dts = inject(DocTypesService);
  svc = inject(SettingsService);

  tab: Tab = 'staff';

  // ── Staff Accounts state ──
  staffAddOpen = false;
  staffAddError = '';
  staffDraft = { name: '', email: '', password: '' };
  staffDelPick: { id: number; name: string; email: string } | null = null;

  // ── Document Types state ──
  newDtName = '';
  dtError = '';
  dtDelPick: { id: number; name: string } | null = null;

  // ── Office Information state ──
  draft = { ...this.svc.settings };
  officeError = '';
  officeSaved = signal(false);

  // ── Toast ──
  toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Staff methods ──
  openAddStaff(): void {
    this.staffDraft = { name: '', email: '', password: '' };
    this.staffAddError = '';
    this.staffAddOpen = true;
  }

  saveStaff(): void {
    this.staffAddError = '';
    const err = this.auth.addStaff(this.staffDraft.name, this.staffDraft.email, this.staffDraft.password);
    if (err) { this.staffAddError = err; return; }
    this.staffAddOpen = false;
    this.showToast('Staff account added.');
  }

  pickDeleteStaff(u: { id: number; name: string; email: string }): void {
    this.staffDelPick = u;
  }

  confirmDeleteStaff(): void {
    if (!this.staffDelPick) return;
    this.auth.removeStaff(this.staffDelPick.id);
    this.staffDelPick = null;
    this.showToast('Staff account removed.');
  }

  // ── Document Types methods ──
  dtypes() { return this.dts.list(); }
  dtCountFor(name: string): number { return this.dts.countFor(name); }

  addDocType(): void {
    this.dtError = '';
    const err = this.dts.add(this.newDtName);
    if (err) { this.dtError = err; return; }
    this.newDtName = '';
    this.showToast('Document type added.');
  }

  pickDeleteDt(t: { id: number; name: string }): void {
    this.dtDelPick = t;
  }

  confirmDeleteDt(): void {
    if (!this.dtDelPick) return;
    const ok = this.dts.removeIfUnused(this.dtDelPick.id);
    this.dtDelPick = null;
    this.showToast(ok ? 'Document type deleted.' : 'Cannot delete a type that is in use.');
  }

  // ── Office Information methods ──
  refreshDraft(): void {
    this.draft = { ...this.svc.settings };
    this.officeError = '';
    this.officeSaved.set(false);
  }

  saveOffice(): void {
    this.officeError = '';
    if (!this.draft.name?.trim()) {
      this.officeError = 'Office name is required.';
      return;
    }
    this.svc.save(this.draft);
    this.officeSaved.set(true);
    this.showToast('Office information saved.');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.officeSaved.set(false), 3000);
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2600);
  }
}
