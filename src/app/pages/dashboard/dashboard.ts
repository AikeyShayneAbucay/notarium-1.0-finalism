import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { RecordsService } from '../../core/records';
import { DocTypesService } from '../../core/doctypes';
import { AppointmentsService, Appointment } from '../../core/appointments';
import { NotarizationRecord, fmtDate, monthYearLabel, MONTH_NAMES } from '../../core/models';
import { UiIcon } from '../../shared/icon';

interface MonthOverview {
  name: string;
  year: number;
  total: number;
  submitted: number;
  x?: number;
  yTotal?: number;
  ySub?: number;
}

interface DocTypeSlice {
  name: string;
  count: number;
  pct: number;
  color: string;
  dasharray: string;
  dashoffset: string;
}

interface StatusSlice {
  name: string;
  count: number;
  pct: number;
  color: string;
  dasharray: string;
  dashoffset: string;
}

export interface MonthlyAppointmentBar {
  monthIndex: number;
  monthName: string;
  fullName: string;
  count: number;
  pct: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cohesive legal-office palette exclusively using NOTARIX dark green and gold shades.
 */
const TYPE_COLORS = [
  '#17483a', // Primary Forest Green
  '#c9a544', // Classic Rich Gold
  '#29745e', // Medium Emerald Green
  '#d5ae4f', // Soft Warm Gold
  '#10362c', // Deep Pine Green
  '#b38e30', // Antique Bronze Gold
  '#428b75', // Muted Sage Green
  '#e2be67', // Champagne Accent Gold
];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, UiIcon, FormsModule],
  template: `
    <div class="dash-container">
      <!-- Top Overview Header -->
      <header class="dash-head">
        <div class="head-left">
          <span class="greeting-bar"></span>
          <div>
            <h1 class="dash-title">Good {{ greeting() }}, {{ firstName }}!</h1>
            <p class="dash-sub">Here's your notary system overview.</p>
          </div>
        </div>

        <div class="head-right">
          <div class="date-pill">
            <ui-icon name="calendar" size="15" />
            <span>{{ currentMonthYear }}</span>
          </div>
          <div class="role-pill" [class.is-admin]="auth.isAdmin()" [class.is-staff]="!auth.isAdmin()">
            <ui-icon [name]="auth.isAdmin() ? 'lock' : 'user'" size="13" />
            <span>{{ auth.isAdmin() ? 'Administrator' : 'Legal Secretary' }}</span>
          </div>
        </div>
      </header>

      <!-- 1. Summary Cards (Dark Green & Gold Theme) -->
      <section class="stat-cards">
        <!-- Total Records -->
        <article class="stat-card">
          <div class="sc-icon is-green">
            <ui-icon name="file" size="20" />
          </div>
          <div class="sc-content">
            <div class="sc-value">{{ vit().total }}</div>
            <div class="sc-label">Total Records</div>
            <div class="sc-sub">
              @if (totalDiff >= 0) {
                <span class="sc-up">↑ +{{ totalDiff }} from last month</span>
              } @else {
                <span class="sc-down">↓ {{ totalDiff }} from last month</span>
              }
            </div>
          </div>
        </article>

        <!-- This Month -->
        <article class="stat-card">
          <div class="sc-icon is-gold">
            <ui-icon name="calendar" size="20" />
          </div>
          <div class="sc-content">
            <div class="sc-value">{{ vit().thisMonth }}</div>
            <div class="sc-label">This Month</div>
            <div class="sc-sub">
              @if (monthDiff >= 0) {
                <span class="sc-up">↑ +{{ monthDiff }} from last month</span>
              } @else {
                <span class="sc-down">↓ {{ monthDiff }} from last month</span>
              }
            </div>
          </div>
        </article>

        <!-- For Submission -->
        <article class="stat-card">
          <div class="sc-icon is-submission">
            <ui-icon name="send" size="18" />
          </div>
          <div class="sc-content">
            <div class="sc-value">{{ vit().forSubmission }}</div>
            <div class="sc-label">For Submission</div>
            <div class="sc-sub">
              <span class="sc-neutral">≈ {{ forSubmissionPct }}% of this month</span>
            </div>
          </div>
        </article>

        <!-- Submitted -->
        <article class="stat-card">
          <div class="sc-icon is-submitted">
            <ui-icon name="check" size="20" />
          </div>
          <div class="sc-content">
            <div class="sc-value">{{ vit().submitted }}</div>
            <div class="sc-label">Submitted</div>
            <div class="sc-sub">
              @if (submittedDiff >= 0) {
                <span class="sc-up">↑ +{{ submittedDiff }} from last month</span>
              } @else {
                <span class="sc-down">↓ {{ submittedDiff }} from last month</span>
              }
            </div>
          </div>
        </article>
      </section>

      <!-- 2. Mid Section: Records Overview + Document Types -->
      <section class="grid-mid">
        <!-- Records Overview Line Chart (Dark Green & Gold) -->
        <article class="panel card-overview">
          <div class="panel-head">
            <div class="ph-title">
              <ui-icon name="chart" size="18" />
              <h2>Records Overview</h2>
            </div>
            <div class="ph-actions">
              <div class="chart-legend">
                <span class="legend-item"><i class="dot dot-total"></i> Total Records</span>
                <span class="legend-item"><i class="dot dot-sub"></i> Submitted</span>
              </div>
              <select class="timeframe-select" [(ngModel)]="timeframe" (ngModelChange)="onTimeframeChange()">
                <option value="6m">Last 6 Months</option>
                <option value="12m">Last 12 Months</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>

          <div class="chart-wrap">
            <svg viewBox="0 0 620 220" class="svg-line-chart" preserveAspectRatio="none">
              <defs>
                <linearGradient id="totalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#17483a" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="#17483a" stop-opacity="0.01" />
                </linearGradient>
              </defs>

              <!-- Y-Axis Grid Lines & Ticks -->
              @for (tick of lineYAxisTicks; track tick.y) {
                <line x1="40" [attr.y1]="tick.y" x2="600" [attr.y2]="tick.y" stroke="#f1f5f9" stroke-width="1" />
                <text x="30" [attr.y]="tick.y + 4" text-anchor="end" class="chart-tick-text">{{ tick.val }}</text>
              }

              <!-- Area Fill under Total Records (Forest Green Gradient) -->
              @if (lineAreaPath) {
                <path [attr.d]="lineAreaPath" fill="url(#totalAreaGrad)" />
              }

              <!-- Total Records Polyline (Dark Green) -->
              @if (lineTotalPath) {
                <path [attr.d]="lineTotalPath" fill="none" stroke="#17483a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              }

              <!-- Submitted Polyline (Gold) -->
              @if (lineSubmittedPath) {
                <path [attr.d]="lineSubmittedPath" fill="none" stroke="#c9a544" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              }

              <!-- Data Dots & Tooltips -->
              @for (m of overviewMonths; track m.name + m.year) {
                @if (m.x !== undefined && m.yTotal !== undefined) {
                  <circle [attr.cx]="m.x" [attr.cy]="m.yTotal" r="4.5" fill="#17483a" stroke="#ffffff" stroke-width="2">
                    <title>{{ m.name }} {{ m.year }}: {{ m.total }} Total Records</title>
                  </circle>
                }
                @if (m.x !== undefined && m.ySub !== undefined) {
                  <circle [attr.cx]="m.x" [attr.cy]="m.ySub" r="4" fill="#c9a544" stroke="#ffffff" stroke-width="2">
                    <title>{{ m.name }} {{ m.year }}: {{ m.submitted }} Submitted</title>
                  </circle>
                }
                <!-- X-Axis Labels -->
                @if (m.x !== undefined) {
                  <text [attr.x]="m.x" y="206" text-anchor="middle" class="chart-x-text">{{ m.name }}</text>
                }
              }
            </svg>
          </div>
        </article>

        <!-- Document Types Doughnut Chart (Green & Gold Palette) -->
        <article class="panel card-types">
          <div class="panel-head">
            <div class="ph-title">
              <ui-icon name="pie" size="18" />
              <h2>Document Types</h2>
            </div>
          </div>

          <div class="doughnut-content">
            <div class="doughnut-svg-wrap">
              <svg viewBox="0 0 180 180" class="svg-doughnut">
                <!-- Background Ring -->
                <circle cx="90" cy="90" r="62" fill="none" stroke="#f1f5f9" stroke-width="22" />

                <!-- Doughnut Segments -->
                @for (s of docTypeSlices; track s.name) {
                  <circle
                    cx="90"
                    cy="90"
                    r="62"
                    fill="none"
                    [attr.stroke]="s.color"
                    stroke-width="22"
                    [attr.stroke-dasharray]="s.dasharray"
                    [attr.stroke-dashoffset]="s.dashoffset"
                    transform="rotate(-90 90 90)"
                    stroke-linecap="butt"
                  >
                    <title>{{ s.name }}: {{ s.count }} ({{ s.pct }}%)</title>
                  </circle>
                }

                <!-- Center Total Text -->
                <text x="90" y="87" text-anchor="middle" class="d-total">{{ vit().total }}</text>
                <text x="90" y="105" text-anchor="middle" class="d-sub">Total</text>
              </svg>
            </div>

            <!-- Legend on the right -->
            <div class="doughnut-legend">
              @for (s of docTypeSlices; track s.name) {
                <div class="legend-row">
                  <div class="lr-label">
                    <i class="dot" [style.backgroundColor]="s.color"></i>
                    <span class="lr-name" [title]="s.name">{{ s.name }}</span>
                  </div>
                  <span class="lr-val">{{ s.pct }}% ({{ s.count }})</span>
                </div>
              } @empty {
                <div class="empty-chart">No records registered yet.</div>
              }
            </div>
          </div>
        </article>
      </section>

      <!-- 3. Bottom Section: Status Summary + Monthly Performance + Recent Activity -->
      <section class="grid-bottom">
        <!-- Status Summary Doughnut (Gold for Submission, Dark Green for Submitted) -->
        <article class="panel card-status">
          <div class="panel-head">
            <div class="ph-title">
              <ui-icon name="trending-up" size="18" />
              <h2>Status Summary</h2>
            </div>
          </div>

          <div class="doughnut-content">
            <div class="doughnut-svg-wrap sm">
              <svg viewBox="0 0 180 180" class="svg-doughnut">
                <circle cx="90" cy="90" r="62" fill="none" stroke="#f1f5f9" stroke-width="22" />
                @for (s of statusSlices; track s.name) {
                  <circle
                    cx="90"
                    cy="90"
                    r="62"
                    fill="none"
                    [attr.stroke]="s.color"
                    stroke-width="22"
                    [attr.stroke-dasharray]="s.dasharray"
                    [attr.stroke-dashoffset]="s.dashoffset"
                    transform="rotate(-90 90 90)"
                    stroke-linecap="butt"
                  >
                    <title>{{ s.name }}: {{ s.count }} ({{ s.pct }}%)</title>
                  </circle>
                }
                <text x="90" y="87" text-anchor="middle" class="d-total">{{ vit().total }}</text>
                <text x="90" y="105" text-anchor="middle" class="d-sub">Total</text>
              </svg>
            </div>

            <div class="doughnut-legend">
              @for (s of statusSlices; track s.name) {
                <div class="legend-row">
                  <div class="lr-label">
                    <i class="dot" [style.backgroundColor]="s.color"></i>
                    <span class="lr-name">{{ s.name }}</span>
                  </div>
                  <span class="lr-val"><b>{{ s.count }}</b> ({{ s.pct }}%)</span>
                </div>
              }
            </div>
          </div>
        </article>

        <!-- Monthly Appointments Graph (Real Supabase Data) -->
        <article class="panel card-appointments">
          <div class="panel-head">
            <div class="ph-title-wrap">
              <div class="ph-title">
                <ui-icon name="calendar" size="18" />
                <h2>Monthly Appointments</h2>
              </div>
              <p class="panel-sub">Overview of appointment requests received throughout the year.</p>
            </div>
            <div class="ph-actions">
              <span class="apt-year-badge">
                <b>{{ totalYearAppointments() }}</b> Total
              </span>
              <select
                class="timeframe-select"
                [ngModel]="selectedYear()"
                (ngModelChange)="selectedYear.set(+$event)"
              >
                @for (y of availableYears(); track y) {
                  <option [value]="y">
                    {{ y === currentCalendarYear ? 'Current Year (' + y + ')' : y === currentCalendarYear - 1 ? 'Previous Year (' + y + ')' : y }}
                  </option>
                }
              </select>
            </div>
          </div>

          <div class="chart-wrap apt-chart-wrap">
            @if (aptLoading()) {
              <div class="chart-state-msg">Loading appointments data…</div>
            } @else if (aptError()) {
              <div class="chart-state-msg error">{{ aptError() }}</div>
            } @else {
              @if (totalYearAppointments() === 0) {
                <div class="chart-empty-overlay">
                  <p>No appointment requests recorded for {{ selectedYear() }}.</p>
                </div>
              }
              <svg viewBox="0 0 540 195" class="svg-apt-chart" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="aptBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#17483a" />
                    <stop offset="100%" stop-color="#246a56" />
                  </linearGradient>
                  <linearGradient id="aptBarHoverGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#c9a544" />
                    <stop offset="100%" stop-color="#dfbe66" />
                  </linearGradient>
                </defs>

                <!-- Y-Axis Grid Lines & Ticks -->
                @for (tick of aptYAxisTicks(); track tick.y) {
                  <line x1="32" [attr.y1]="tick.y" x2="525" [attr.y2]="tick.y" stroke="#f1f5f9" stroke-width="1" />
                  <text x="26" [attr.y]="tick.y + 4" text-anchor="end" class="chart-tick-text">{{ tick.val }}</text>
                }

                <!-- Bars for all 12 Months -->
                @for (m of monthlyAppointments(); track m.monthIndex) {
                  <rect
                    [attr.x]="m.x"
                    [attr.y]="m.y"
                    [attr.width]="m.width"
                    [attr.height]="m.height"
                    rx="3"
                    class="apt-bar-rect"
                    [class.is-hovered]="hoveredMonth()?.monthIndex === m.monthIndex"
                    [attr.fill]="hoveredMonth()?.monthIndex === m.monthIndex ? 'url(#aptBarHoverGrad)' : (m.count > 0 ? 'url(#aptBarGrad)' : '#e2e8f0')"
                    (mouseenter)="hoveredMonth.set(m)"
                    (mouseleave)="hoveredMonth.set(null)"
                  >
                    <title>{{ m.fullName }} {{ selectedYear() }}: {{ m.count }} appointment(s)</title>
                  </rect>

                  <!-- Count label on top of bar if count > 0 -->
                  @if (m.count > 0) {
                    <text
                      [attr.x]="m.x + m.width / 2"
                      [attr.y]="m.y - 4"
                      text-anchor="middle"
                      class="apt-bar-val"
                      [class.active]="hoveredMonth()?.monthIndex === m.monthIndex"
                    >
                      {{ m.count }}
                    </text>
                  }

                  <!-- Month label -->
                  <text
                    [attr.x]="m.x + m.width / 2"
                    y="180"
                    text-anchor="middle"
                    class="chart-x-text apt-month-label"
                    [class.active]="hoveredMonth()?.monthIndex === m.monthIndex"
                  >
                    {{ m.monthName }}
                  </text>
                }
              </svg>

              <!-- Floating Tooltip Box when hovered -->
              @if (hoveredMonth(); as hm) {
                <div class="apt-tooltip" [style.left.%]="tooltipLeft(hm.x)">
                  <span class="tt-month">{{ hm.fullName }} {{ selectedYear() }}</span>
                  <span class="tt-count"><b>{{ hm.count }}</b> appointment{{ hm.count === 1 ? '' : 's' }}</span>
                </div>
              }
            }
          </div>
        </article>

        <!-- Recent Activity Timeline (Dark Green & Gold) -->
        <article class="panel card-activity">
          <div class="panel-head">
            <div class="ph-title">
              <ui-icon name="clock" size="18" />
              <h2>Recent Activity</h2>
            </div>
            <a class="view-all-link" routerLink="/records">
              View All <ui-icon name="chev-right" size="13" />
            </a>
          </div>

          <div class="activity-timeline">
            @for (act of recentActivities; track act.id) {
              <div class="act-item">
                <div class="act-track">
                  <span class="act-dot" [class.is-done]="act.status === 'Submitted'"></span>
                  <span class="act-line"></span>
                </div>
                <div class="act-body">
                  <div class="act-header">
                    <span class="act-date">{{ fmt(act.dateNotarized) }}</span>
                    <span class="act-sep">–</span>
                    <span class="act-type">{{ act.type }}</span>
                    <span class="act-badge" [class.is-sub]="act.status === 'Submitted'">({{ act.status }})</span>
                  </div>
                  <div class="act-meta">
                    <span class="act-doc">{{ act.documentNo }}</span>
                    <span class="act-bullet">·</span>
                    <span class="act-client">{{ act.clientName }}</span>
                  </div>
                </div>
              </div>
            } @empty {
              <div class="empty-activity">
                <ui-icon name="file" size="24" />
                <p>No recent notarization activity registered yet.</p>
                <a routerLink="/records" [queryParams]="{ new: 1 }" class="btn btn-sm btn-green">Add First Record</a>
              </div>
            }
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .dash-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1440px;
      margin: 0 auto;
    }

    /* Header */
    .dash-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }

    .head-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .greeting-bar {
      width: 4px;
      height: 48px;
      background: linear-gradient(180deg, var(--green-800) 0%, var(--gold) 100%);
      border-radius: 4px;
    }

    .dash-title {
      font-family: var(--font-heading);
      font-size: 26px;
      font-weight: 700;
      color: var(--navy-deep);
      margin: 0;
      letter-spacing: -0.01em;
    }

    .dash-sub {
      margin: 3px 0 0;
      font-size: 13.5px;
      color: var(--muted);
    }

    .head-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .date-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: #ffffff;
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: var(--radius-full);
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      box-shadow: var(--shadow-xs);
    }

    .date-pill .app-icon {
      color: var(--navy);
    }

    .role-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: var(--radius-full);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .role-pill.is-admin {
      background: var(--navy-surface);
      color: var(--navy);
      border: 1px solid var(--border-strong);
    }

    .role-pill.is-staff {
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
    }

    /* 1. Stat Cards (NOTARIX Theme) */
    .stat-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
    }

    .stat-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-card);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-hover);
      border-color: var(--border-strong);
    }

    .sc-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    /* Professional Dark Green & Gold Icon Badges */
    .sc-icon.is-green {
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
    }

    .sc-icon.is-gold {
      background: var(--gold-surface);
      color: var(--gold-rich);
      border: 1px solid var(--gold-border);
    }

    .sc-icon.is-submission {
      background: #fbf8ee;
      color: #b38e30;
      border: 1px solid #ebd9ab;
    }

    .sc-icon.is-submitted {
      background: var(--green-surface);
      color: var(--green-800);
      border: 1px solid var(--green-border);
    }

    .sc-content {
      min-width: 0;
      flex: 1;
    }

    .sc-value {
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .sc-label {
      font-size: 13.5px;
      font-weight: 600;
      color: #475569;
      margin-top: 3px;
    }

    .sc-sub {
      margin-top: 5px;
      font-size: 11.5px;
      font-weight: 500;
    }

    .sc-up {
      color: #059669;
      font-weight: 600;
    }

    .sc-down {
      color: #dc2626;
      font-weight: 600;
    }

    .sc-neutral {
      color: #64748b;
      font-weight: 500;
    }

    /* Panels */
    .panel {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .ph-title {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .ph-title .app-icon {
      color: var(--navy);
    }

    .ph-title h2 {
      font-size: 16px;
      font-weight: 700;
      color: var(--navy-deep);
      margin: 0;
      letter-spacing: -0.01em;
    }

    .ph-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .chart-legend {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
    }

    .chart-legend.sm {
      font-size: 11.5px;
      gap: 10px;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Dark Green & Gold Indicators */
    .dot-total { background: #17483a; }
    .dot-sub { background: #c9a544; }
    .dot-bar-total { background: #17483a; }
    .dot-bar-sub { background: #c9a544; }

    .timeframe-select {
      height: 32px;
      border: 1px solid var(--border);
      border-radius: var(--radius-xs);
      background: #ffffff;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      padding: 0 10px;
      cursor: pointer;
      outline: 0;
      transition: border-color 0.15s ease;
    }

    .timeframe-select:hover {
      border-color: var(--border-strong);
    }

    /* 2. Grid Mid */
    .grid-mid {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 18px;
    }

    .chart-wrap {
      width: 100%;
      position: relative;
    }

    .svg-line-chart {
      width: 100%;
      height: 220px;
      overflow: visible;
    }

    .chart-tick-text {
      font-size: 10.5px;
      fill: #94a3b8;
      font-weight: 500;
    }

    .chart-x-text {
      font-size: 11px;
      fill: #64748b;
      font-weight: 600;
    }

    /* Doughnut Layout */
    .doughnut-content {
      display: flex;
      align-items: center;
      gap: 20px;
      flex: 1;
    }

    .doughnut-svg-wrap {
      width: 150px;
      height: 150px;
      flex-shrink: 0;
    }

    .doughnut-svg-wrap.sm {
      width: 130px;
      height: 130px;
    }

    .svg-doughnut {
      width: 100%;
      height: 100%;
    }

    .d-total {
      font-size: 26px;
      font-weight: 800;
      fill: #0f172a;
    }

    .d-sub {
      font-size: 11px;
      font-weight: 600;
      fill: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .doughnut-legend {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .legend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12.5px;
    }

    .lr-label {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .lr-name {
      color: #334155;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lr-val {
      color: #64748b;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
    }

    .empty-chart {
      font-size: 12.5px;
      color: var(--muted);
      font-style: italic;
    }

    /* 3. Grid Bottom */
    .grid-bottom {
      display: grid;
      grid-template-columns: 1fr 1.45fr 1.1fr;
      gap: 18px;
    }

    .card-appointments {
      position: relative;
    }

    .panel-sub {
      margin: 3px 0 0;
      font-size: 11.5px;
      color: var(--muted);
      font-weight: 500;
    }

    .ph-title-wrap {
      display: flex;
      flex-direction: column;
    }

    .apt-year-badge {
      font-size: 11.5px;
      color: var(--navy);
      background: var(--navy-surface);
      border: 1px solid var(--border-strong);
      padding: 3px 9px;
      border-radius: var(--radius-full);
      font-weight: 600;
    }

    .apt-year-badge b {
      color: var(--navy-deep);
    }

    .apt-chart-wrap {
      height: 195px;
      position: relative;
    }

    .svg-apt-chart {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .apt-bar-rect {
      cursor: pointer;
      transition: fill 0.15s ease, opacity 0.15s ease;
    }

    .apt-bar-rect:hover {
      opacity: 0.95;
    }

    .apt-bar-val {
      font-size: 9.5px;
      font-weight: 700;
      fill: #17483a;
      pointer-events: none;
    }

    .apt-bar-val.active {
      fill: #b38e30;
    }

    .apt-month-label {
      transition: fill 0.15s ease;
    }

    .apt-month-label.active {
      fill: #17483a;
      font-weight: 700;
    }

    .chart-empty-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.7);
      z-index: 2;
      pointer-events: none;
    }

    .chart-empty-overlay p {
      margin: 0;
      font-size: 12.5px;
      color: var(--muted);
      font-weight: 500;
      background: #ffffff;
      padding: 6px 14px;
      border-radius: var(--radius-full);
      border: 1px dashed var(--border-strong);
    }

    .chart-state-msg {
      height: 195px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: var(--muted);
    }

    .chart-state-msg.error {
      color: var(--red);
    }

    .apt-tooltip {
      position: absolute;
      top: 10px;
      transform: translateX(-50%);
      background: #12332b;
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10;
      white-space: nowrap;
    }

    .tt-month {
      font-weight: 700;
      color: #d5ae4f;
    }

    .tt-count {
      color: #e2e8f0;
    }

    /* Recent Activity */
    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      color: var(--green-800);
      text-decoration: none;
      transition: color 0.15s ease;
    }

    .view-all-link:hover {
      color: var(--gold-rich);
      text-decoration: underline;
    }

    .activity-timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      margin-top: 4px;
    }

    .act-item {
      display: flex;
      gap: 12px;
      position: relative;
    }

    .act-track {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
    }

    /* Timeline Dots: Subtle Gold default, Forest Green for Submitted */
    .act-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #c9a544;
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 1.5px #f4e8c5;
      margin-top: 5px;
      z-index: 1;
    }

    .act-dot.is-done {
      background: #17483a;
      box-shadow: 0 0 0 1.5px #c4e0d6;
    }

    .act-line {
      flex: 1;
      width: 1.5px;
      background: #f1f5f9;
      margin-top: -2px;
      min-height: 28px;
    }

    .act-item:last-child .act-line {
      display: none;
    }

    .act-body {
      padding-bottom: 16px;
      min-width: 0;
      flex: 1;
    }

    .act-header {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
      font-size: 12.5px;
      line-height: 1.3;
    }

    .act-date {
      font-weight: 600;
      color: #1e293b;
    }

    .act-sep {
      color: #cbd5e1;
    }

    .act-type {
      font-weight: 500;
      color: #475569;
    }

    .act-badge {
      font-size: 11px;
      font-weight: 600;
      color: #b38e30;
    }

    .act-badge.is-sub {
      color: var(--green-800);
    }

    .act-meta {
      font-size: 11.5px;
      color: #94a3b8;
      margin-top: 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .act-doc {
      font-weight: 600;
      color: var(--navy);
    }

    .act-client {
      color: #64748b;
    }

    .empty-activity {
      text-align: center;
      padding: 30px 10px;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .empty-activity p {
      margin: 0;
      font-size: 13px;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .stat-cards {
        grid-template-columns: repeat(2, 1fr);
      }
      .grid-mid {
        grid-template-columns: 1fr;
      }
      .grid-bottom {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 680px) {
      .stat-cards {
        grid-template-columns: 1fr;
      }
      .doughnut-content {
        flex-direction: column;
      }
      .ph-actions {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class Dashboard implements OnInit, OnDestroy {
  auth = inject(AuthService);
  rec = inject(RecordsService);
  private dts = inject(DocTypesService);
  private appointmentsService = inject(AppointmentsService);

  timeframe: '6m' | '12m' | 'year' = '6m';

  // Monthly Appointments graph state
  appointments = signal<Appointment[]>([]);
  aptLoading = signal(true);
  aptError = signal('');
  selectedYear = signal<number>(new Date().getFullYear());
  currentCalendarYear = new Date().getFullYear();
  hoveredMonth = signal<MonthlyAppointmentBar | null>(null);

  private unsubRealtime?: () => void;

  ngOnInit(): void {
    this.loadAppointments();
    this.unsubRealtime = this.appointmentsService.subscribeToChanges(() => {
      this.loadAppointmentsSilent();
    });
  }

  ngOnDestroy(): void {
    if (this.unsubRealtime) {
      this.unsubRealtime();
    }
  }

  async loadAppointments(): Promise<void> {
    this.aptLoading.set(true);
    this.aptError.set('');
    try {
      const { rows, error } = await this.appointmentsService.all();
      if (error) {
        this.aptError.set(error);
      } else {
        this.appointments.set(rows);
      }
    } catch (err: unknown) {
      this.aptError.set(err instanceof Error ? err.message : 'Failed to load appointments.');
    } finally {
      this.aptLoading.set(false);
    }
  }

  async loadAppointmentsSilent(): Promise<void> {
    try {
      const { rows, error } = await this.appointmentsService.all();
      if (!error && rows) {
        this.appointments.set(rows);
      }
    } catch {
      // silent live sync
    }
  }

  availableYears = computed(() => {
    const years = new Set<number>();
    const current = this.currentCalendarYear;
    years.add(current);
    years.add(current - 1);
    for (const a of this.appointments()) {
      if (a.createdAt) {
        const y = new Date(a.createdAt).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  totalYearAppointments = computed(() => {
    return this.monthlyAppointments().reduce((sum, m) => sum + m.count, 0);
  });

  monthlyAppointments = computed<MonthlyAppointmentBar[]>(() => {
    const year = this.selectedYear();
    const apts = this.appointments();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const counts = new Array(12).fill(0);
    const seenIds = new Set<number>();

    for (const a of apts) {
      if (!a.id || seenIds.has(a.id)) continue;
      seenIds.add(a.id);

      if (!a.createdAt) continue;
      const d = new Date(a.createdAt);
      if (isNaN(d.getTime())) continue;

      if (d.getFullYear() === year) {
        const m = d.getMonth();
        if (m >= 0 && m < 12) {
          counts[m]++;
        }
      }
    }

    const maxCount = Math.max(...counts, 0);
    const maxVal = Math.max(4, Math.ceil(maxCount * 1.25));

    const startX = 38;
    const endX = 525;
    const innerW = endX - startX;
    const slotW = innerW / 12;
    const barW = 20;
    const baseY = 165;
    const innerH = 135;

    return counts.map((count, idx) => {
      const x = startX + idx * slotW + (slotW - barW) / 2;
      const h = count > 0 ? Math.max(4, (count / maxVal) * innerH) : 2;
      const y = baseY - h;
      const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;

      return {
        monthIndex: idx,
        monthName: monthNames[idx],
        fullName: fullNames[idx],
        count,
        pct,
        x,
        y,
        width: barW,
        height: h,
      };
    });
  });

  aptYAxisTicks = computed(() => {
    const months = this.monthlyAppointments();
    const maxCount = Math.max(...months.map((m) => m.count), 0);
    const maxVal = Math.max(4, Math.ceil(maxCount * 1.25));
    const step = maxVal / 4;
    const ticks = [];
    const baseY = 165;
    const innerH = 135;

    for (let i = 0; i <= 4; i++) {
      const val = Math.round(i * step);
      const y = baseY - (i / 4) * innerH;
      ticks.push({ y, val });
    }
    return ticks;
  });

  tooltipLeft(barX: number): number {
    return Math.min(Math.max(8, (barX / 540) * 100), 92);
  }

  get firstName(): string {
    const raw = (this.auth.user?.name ?? '').trim();
    if (!raw) return this.auth.isAdmin() ? 'Administrator' : 'Secretary';
    return raw.split(/\s+/)[0];
  }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Morning';
    if (h < 18) return 'Afternoon';
    return 'Evening';
  }

  get currentMonthYear(): string {
    return monthYearLabel(new Date());
  }

  vit() {
    return this.rec.vitals();
  }

  fmt(iso: string): string {
    return fmtDate(iso);
  }

  // --- Summary Card Stat Comparisons ---
  get totalDiff(): number {
    const v = this.vit();
    return v.diff >= 0 ? v.diff : v.diff;
  }

  get monthDiff(): number {
    const v = this.vit();
    return v.thisMonth - v.prevCount;
  }

  get forSubmissionPct(): number {
    const v = this.vit();
    const total = v.thisMonth || v.total;
    if (total === 0) return 0;
    return Math.round((v.forSubmission / total) * 100);
  }

  get submittedDiff(): number {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const subThis = this.rec.byMonth(now.getFullYear(), now.getMonth()).filter(r => r.status === 'Submitted').length;
    const subPrev = this.rec.byMonth(prev.getFullYear(), prev.getMonth()).filter(r => r.status === 'Submitted').length;
    return subThis - subPrev;
  }

  // --- Records Overview Line Chart ---
  onTimeframeChange(): void {
    // reactive getters auto-recompute
  }

  get overviewMonths(): MonthOverview[] {
    const list = this.rec.list();
    const now = new Date();
    const count = this.timeframe === '12m' ? 12 : this.timeframe === 'year' ? now.getMonth() + 1 : 6;
    const result: MonthOverview[] = [];

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const monthRecs = list.filter(r => {
        const rd = new Date(r.dateNotarized + 'T00:00:00');
        return rd.getFullYear() === y && rd.getMonth() === m;
      });

      result.push({
        name: MONTH_NAMES[m].slice(0, 3),
        year: y,
        total: monthRecs.length,
        submitted: monthRecs.filter(r => r.status === 'Submitted').length
      });
    }

    // SVG coordinate mapping
    const maxVal = Math.max(5, Math.ceil(Math.max(...result.map(m => m.total), 1) * 1.25));
    const startX = 40;
    const endX = 600;
    const innerW = endX - startX;
    const innerH = 160;
    const baseY = 185;

    result.forEach((m, idx) => {
      const step = result.length > 1 ? innerW / (result.length - 1) : innerW;
      m.x = startX + idx * step;
      m.yTotal = baseY - (m.total / maxVal) * innerH;
      m.ySub = baseY - (m.submitted / maxVal) * innerH;
    });

    return result;
  }

  get lineYAxisTicks(): { y: number; val: number }[] {
    const months = this.overviewMonths;
    const maxVal = Math.max(5, Math.ceil(Math.max(...months.map(m => m.total), 1) * 1.25));
    const step = maxVal / 4;
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(i * step);
      const y = 185 - (i / 4) * 160;
      ticks.push({ y, val });
    }
    return ticks;
  }

  get lineTotalPath(): string {
    const months = this.overviewMonths;
    if (months.length === 0) return '';
    return months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${m.x} ${m.yTotal}`).join(' ');
  }

  get lineSubmittedPath(): string {
    const months = this.overviewMonths;
    if (months.length === 0) return '';
    return months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${m.x} ${m.ySub}`).join(' ');
  }

  get lineAreaPath(): string {
    const months = this.overviewMonths;
    if (months.length === 0) return '';
    const firstX = months[0].x;
    const lastX = months[months.length - 1].x;
    const lineStr = months.map(m => `L ${m.x} ${m.yTotal}`).join(' ');
    return `M ${firstX} 185 ${lineStr} L ${lastX} 185 Z`;
  }

  // --- Document Types Doughnut Chart (Shades of Green & Gold) ---
  get docTypeSlices(): DocTypeSlice[] {
    const records = this.rec.list();
    const total = records.length;
    if (total === 0) return [];

    const map = new Map<string, number>();
    for (const r of records) {
      const type = (r.type || 'Other').trim();
      map.set(type, (map.get(type) ?? 0) + 1);
    }

    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const C = 2 * Math.PI * 62; // ~389.56
    let cumulative = 0;

    return sorted.map(([name, count], index) => {
      const pct = Math.round((count / total) * 100);
      const color = TYPE_COLORS[index % TYPE_COLORS.length];
      const dasharray = `${(pct / 100) * C} ${C}`;
      const dashoffset = `-${(cumulative / 100) * C}`;
      cumulative += pct;
      return { name, count, pct, color, dasharray, dashoffset };
    });
  }

  // --- Status Summary Doughnut Chart (Dark Green for Submitted, Gold for For Submission) ---
  get statusSlices(): StatusSlice[] {
    const records = this.rec.list();
    const total = records.length;
    if (total === 0) return [];

    const forSub = records.filter(r => r.status === 'For Submission').length;
    const sub = records.filter(r => r.status === 'Submitted').length;
    const inOff = records.filter(r => r.status === 'In Office').length;

    const items = [
      { name: 'For Submission', count: forSub, color: '#c9a544' }, // Gold
      { name: 'Submitted', count: sub, color: '#17483a' },         // Dark Green
    ];
    if (inOff > 0) {
      items.push({ name: 'In Office', count: inOff, color: '#428b75' }); // Sage Green
    }

    const C = 2 * Math.PI * 62;
    let cumulative = 0;

    return items.map(item => {
      const pct = Math.round((item.count / total) * 100);
      const dasharray = `${(pct / 100) * C} ${C}`;
      const dashoffset = `-${(cumulative / 100) * C}`;
      cumulative += pct;
      return { ...item, pct, dasharray, dashoffset };
    });
  }



  // --- Recent Activity ---
  get recentActivities(): NotarizationRecord[] {
    return [...this.rec.list()]
      .sort((a, b) => {
        const dateDiff = new Date(b.dateNotarized + 'T00:00:00').getTime() - new Date(a.dateNotarized + 'T00:00:00').getTime();
        return dateDiff !== 0 ? dateDiff : b.id - a.id;
      })
      .slice(0, 4);
  }
}
