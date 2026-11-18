import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { UiIcon } from './icon';

@Component({
  selector: 'ui-modal',
  imports: [NgTemplateOutlet, UiIcon],
  styles: [
    `
      .ov {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 60;
        padding: 20px;
        animation: ov-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes ov-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .box {
        background: #ffffff;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-modal);
        border: 1px solid var(--border);
        width: 100%;
        overflow: hidden;
        animation: box-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
      }

      @keyframes box-in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @media (max-width: 600px) {
        .box {
          max-width: calc(100vw - 32px) !important;
        }
      }

      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 1px solid var(--border);
        background: #ffffff;
        flex: none;
      }

      .title {
        font-family: var(--font-heading);
        font-weight: 700;
        font-size: 19px;
        color: var(--navy);
        letter-spacing: -0.01em;
      }

      .x {
        width: 32px;
        height: 32px;
        border: 0;
        background: transparent;
        border-radius: var(--radius-xs);
        color: var(--muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }

      .x:hover {
        background: #f1f5f9;
        color: var(--ink);
      }

      .bd {
        padding: 22px 24px;
        overflow-y: auto;
      }

      .ft {
        padding: 16px 24px;
        border-top: 1px solid var(--border);
        background: #f8fafc;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        flex: none;
      }
    `,
  ],
  template: `
    @if (open) {
      <div class="ov" (click)="close.emit()">
        <div class="box" [style.max-width]="width" (click)="$event.stopPropagation()">
          <header class="head">
            <div class="title">{{ title }}</div>
            <button type="button" class="x" aria-label="Close" (click)="close.emit()">
              <ui-icon name="close" size="17" />
            </button>
          </header>
          <div class="bd"><ng-content /></div>
          @if (foot) {
            <div class="ft">
              <ng-container [ngTemplateOutlet]="foot" />
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class UiModal {
  @Input() open = false;
  @Input() title = 'Dialog';
  @Input() width = '520px';
  @Output() close = new EventEmitter<void>();
  @ContentChild('foot') foot?: TemplateRef<unknown>;
}
