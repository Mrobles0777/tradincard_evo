import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container animate-fade-in">
      <div class="login-card glass">
        <h1>Tradincard Evo</h1>
        <p>Ingresa para guardar tus evaluaciones y gestionar tu colección.</p>
        
        <form (ngSubmit)="login()">
          <div class="input-group">
            <label>Correo Electrónico</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="tu@email.com" required>
          </div>
          
          <button type="submit" [disabled]="isLoading()" class="login-btn">
            <span *ngIf="!isLoading()">Enviar Enlace Mágico</span>
            <span *ngIf="isLoading()" class="loader">Enviando...</span>
          </button>
        </form>

        <div class="message" *ngIf="message()">
          {{ message() }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #000;
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 40px;
      text-align: center;
    }

    h1 { margin-bottom: 10px; font-size: 32px; }
    p { color: #888; margin-bottom: 30px; font-size: 14px; }

    .input-group {
      text-align: left;
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
    }

    .login-btn {
      width: 100%;
      padding: 16px;
      background: #fff;
      color: #000;
      border: none;
      border-radius: 12px;
      font-weight: 700;
      font-size: 16px;
      cursor: pointer;
      margin-top: 10px;
    }

    .message {
      margin-top: 20px;
      padding: 12px;
      background: rgba(0, 255, 136, 0.1);
      color: #00ff88;
      border-radius: 8px;
      font-size: 14px;
    }

    .loader {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #000;
      border-bottom-color: transparent;
      border-radius: 50%;
      animation: rotation 1s linear infinite;
    }

    @keyframes rotation {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class LoginComponent {
  email = '';
  isLoading = signal(false);
  message = signal<string | null>(null);

  constructor(private supabase: SupabaseService) {}

  async login() {
    this.isLoading.set(true);
    this.message.set(null);
    try {
      const { error } = await this.supabase.signInWithEmail(this.email);
      if (error) throw error;
      this.message.set('¡Enlace enviado! Revisa tu correo bandeja de entrada.');
    } catch (err: any) {
      this.message.set('Error: ' + err.message);
    } finally {
      this.isLoading.set(false);
    }
  }
}
