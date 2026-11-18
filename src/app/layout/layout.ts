import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiIcon } from '../shared/icon';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Sidebar, Topbar, UiIcon],
  template: `
    <button
      class="nav-toggle"
      type="button"
      title="Toggle Navigation Menu"
      [attr.aria-expanded]="navOpen()"
      (click)="navOpen.set(!navOpen())"
    >
      <ui-icon [name]="navOpen() ? 'close' : 'grid'" size="18" />
    </button>

    @if (navOpen()) {
      <div class="sidebar-backdrop" (click)="navOpen.set(false)"></div>
    }

    <div class="shell" [class.nav-closed]="!navOpen()">
      <app-sidebar [class.sb-closed]="!navOpen()" />
      <div class="shell-main">
        <app-topbar [class.tb-shifted]="!navOpen()" />
        <main class="shell-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        background: var(--cream);
      }

      .shell-main {
        margin-left: 270px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        transition: margin-left 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .shell-content {
        padding: 30px 36px 56px;
        flex: 1;
        max-width: 1600px;
        width: 100%;
        box-sizing: border-box;
      }

      .nav-toggle {
        display: none;
        position: fixed;
        top: 13px;
        left: 14px;
        z-index: 75;
        width: 38px;
        height: 38px;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        background: #12332b;
        border: 1px solid rgba(213, 174, 79, 0.4);
        color: var(--gold-soft);
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(10, 31, 24, 0.4);
        transition: all 0.15s ease;
      }

      .nav-toggle:hover {
        background: #17483a;
        transform: scale(1.02);
      }

      .sidebar-backdrop {
        display: none;
      }

      @media (max-width: 1140px) {
        .shell-main {
          margin-left: 0 !important;
        }
        .nav-toggle {
          display: flex;
        }
        .sidebar-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(2px);
          z-index: 25;
          animation: fade-in 0.2s ease;
        }
        .shell-content {
          padding: 22px 20px 44px;
        }
      }

      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
  ],
})
export class Layout {
  navOpen = signal(false);
}
