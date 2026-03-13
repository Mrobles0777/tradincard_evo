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
        <p>{{ isRegisterMode() ? 'Crea tu cuenta para empezar' : 'Ingresa para gestionar tu colección' }}</p>
        
        <form (ngSubmit)="handleSubmit()">
          <div class="input-group">
            <label>Correo Electrónico</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="tu@email.com" required>
          </div>

          <div class="input-group">
            <label>Contraseña</label>
            <div class="password-wrapper">
              <input [type]="showPassword() ? 'text' : 'password'" 
                     [(ngModel)]="password" 
                     name="password" 
                     placeholder="••••••••" 
                     required>
              <button type="button" class="toggle-password" (click)="showPassword.set(!showPassword())">
                {{ showPassword() ? '👁️' : '🙈' }}
              </button>
            </div>
            <small *ngIf="isRegisterMode()" class="hint">Al menos 6 caracteres</small>
          </div>
          
          <button type="submit" [disabled]="isLoading()" class="login-btn">
            <span *ngIf="!isLoading()">{{ isRegisterMode() ? 'Crear Cuenta' : 'Iniciar Sesión' }}</span>
            <span *ngIf="isLoading()" class="loader"></span>
          </button>
        </form>

        <div class="mode-switch">
          <button (click)="isRegisterMode.set(!isRegisterMode())">
            {{ isRegisterMode() ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate' }}
          </button>
        </div>

        <div class="message" [class.error]="isError()" *ngIf="message()">
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

    h1 { margin-bottom: 10px; font-size: 32px; letter-spacing: -1px; }
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

    .password-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    input {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      transition: all 0.3s;
    }

    input:focus {
      outline: none;
      border-color: #fff;
      background: rgba(255,255,255,0.1);
    }

    .toggle-password {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.6;
    }

    .hint {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: #666;
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
      transition: transform 0.2s;
    }

    .login-btn:active { transform: scale(0.98); }

    .mode-switch {
      margin-top: 25px;
    }

    .mode-switch button {
      background: none;
      border: none;
      color: #888;
      font-size: 14px;
      cursor: pointer;
      text-decoration: underline;
    }

    .message {
      margin-top: 20px;
      padding: 12px;
      background: rgba(0, 255, 136, 0.1);
      color: #00ff88;
      border-radius: 8px;
      font-size: 14px;
    }

    .message.error {
      background: rgba(255, 68, 68, 0.1);
      color: #ff4444;
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
  password = '';
  isLoading = signal(false);
  isRegisterMode = signal(false);
  showPassword = signal(false);
  message = signal<string | null>(null);
  isError = signal(false);

  constructor(private supabase: SupabaseService) {}

  async handleSubmit() {
    if (this.password.length < 6) {
      this.message.set('La contraseña debe tener al menos 6 caracteres.');
      this.isError.set(true);
      return;
    }

    this.isLoading.set(true);
    this.message.set(null);
    this.isError.set(false);

    try {
      if (this.isRegisterMode()) {
        const { error } = await this.supabase.signUpWithPassword(this.email, this.password);
        if (error) throw error;
        this.message.set('¡Registro exitoso! Ya puedes iniciar sesión.');
        this.isRegisterMode.set(false);
      } else {
        const { error } = await this.supabase.signInWithPassword(this.email, this.password);
        if (error) throw error;
      }
    } catch (err: any) {
      this.message.set(err.message);
      this.isError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }
}
