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

    <!-- Botón Hamburguesa para abrir/cerrar el menú -->
    <button class="menu-toggle" (click)="toggleMenu()" *ngIf="isLoggedIn()">
      <span class="icon">{{ isMenuOpen() ? '✖' : '☰' }}</span>
    </button>

    <!-- Panel Superior Colapsable -->
    <nav class="top-bar" *ngIf="isLoggedIn()" [class.open]="isMenuOpen()">
      <a routerLink="/capture" routerLinkActive="active" class="tab-item" (click)="isMenuOpen.set(false)">
        <span class="icon">📷</span>
        <span class="label">Escanear</span>
      </a>
      <a routerLink="/collection" routerLinkActive="active" class="tab-item" (click)="isMenuOpen.set(false)">
        <span class="icon">🎴</span>
        <span class="label">Colección</span>
      </a>
      <button (click)="logout(); isMenuOpen.set(false)" class="tab-item logout-btn">
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

    .menu-toggle {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 45px;
      height: 45px;
      border-radius: 50%;
      background: rgba(15, 15, 15, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1001;
      cursor: pointer;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .menu-toggle:hover {
      background: rgba(40, 40, 40, 0.9);
    }

    .top-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(15, 15, 15, 0.95);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 80px 20px 20px 20px;
      gap: 30px;
      z-index: 1000;
      transform: translateY(-100%);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }

    .top-bar.open {
      transform: translateY(0);
    }

    .tab-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-decoration: none;
      color: #888;
      gap: 8px;
      transition: all 0.3s;
      background: none;
      border: none;
      cursor: pointer;
      padding: 10px;
    }

    .tab-item:hover {
      color: #ddd;
    }

    .tab-item.active {
      color: #fff;
    }

    .icon {
      font-size: 24px;
    }

    .label {
      font-size: 11px;
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
  isMenuOpen = signal(false);

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

  toggleMenu() {
    this.isMenuOpen.set(!this.isMenuOpen());
  }

  async logout() {
    await this.supabase.signOut();
  }
}
