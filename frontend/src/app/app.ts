import { Component, OnInit, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { SupabaseService } from './core/services/supabase.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, CommonModule],
  template: `
    <main>
      <router-outlet></router-outlet>
    </main>

    <nav class="tab-bar" *ngIf="isLoggedIn()">
      <a routerLink="/capture" routerLinkActive="active" class="tab-item">
        <span class="icon">📷</span>
        <span class="label">Escanear</span>
      </a>
      <a routerLink="/collection" routerLinkActive="active" class="tab-item">
        <span class="icon">🎴</span>
        <span class="label">Colección</span>
      </a>
      <button (click)="logout()" class="tab-item logout-btn">
        <span class="icon">🚪</span>
        <span class="label">Salir</span>
      </button>
    </nav>
  `,
  styles: [`
    main {
      min-height: 100vh;
      background: #000;
      color: #fff;
    }

    .tab-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 70px;
      background: rgba(15, 15, 15, 0.8);
      backdrop-filter: blur(20px);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding-bottom: env(safe-area-inset-bottom);
      z-index: 1000;
    }

    .tab-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-decoration: none;
      color: #666;
      gap: 4px;
      transition: all 0.3s;
      background: none;
      border: none;
      cursor: pointer;
    }

    .tab-item.active {
      color: #fff;
    }

    .icon {
      font-size: 20px;
    }

    .label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .logout-btn:hover {
      color: #ff4444;
    }
  `]
})
export class AppComponent implements OnInit {
  isLoggedIn = signal(false);

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    this.supabase.client.auth.onAuthStateChange((event, session) => {
      this.isLoggedIn.set(!!session);
      if (!session) {
        this.router.navigate(['/login']);
      } else if (this.router.url === '/login') {
        this.router.navigate(['/capture']);
      }
    });
  }

  async logout() {
    await this.supabase.signOut();
  }
}
