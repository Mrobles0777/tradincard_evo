import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-grade-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grade-badge" [attr.data-grade]="grade">
      <div class="psa-header">PSA</div>
      <div class="grade-value">{{ grade }}</div>
      <div class="label">{{ label }}</div>
    </div>
  `,
  styles: [`
    .grade-badge {
      background: #fff;
      border: 3px solid #d4d4d4;
      border-radius: 8px;
      width: 100px;
      padding: 8px;
      text-align: center;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      position: relative;
    }

    .psa-header {
      font-size: 12px;
      font-weight: 900;
      color: #888;
      border-bottom: 2px solid #eee;
      margin-bottom: 4px;
      letter-spacing: 2px;
    }

    .grade-value {
      font-size: 32px;
      font-weight: 900;
      color: #000;
      line-height: 1;
    }

    .label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #555;
      margin-top: 2px;
    }

    /* Coloring based on grade */
    [data-grade="10"] { border-color: #ffd700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
    [data-grade="9"] { border-color: #c0c0c0; }
  `]
})
export class GradeBadgeComponent {
  @Input() grade: string | number = '10';
  @Input() label: string = 'Gem Mint';
}
