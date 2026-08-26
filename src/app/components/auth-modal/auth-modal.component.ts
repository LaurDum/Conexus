import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closeModal()">
      <div class="modal-card glassmorphism" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ isLoginMode ? 'Welcome Back 👋' : 'Join Conexus 🚀' }}</h2>
          <button class="close-btn" (click)="closeModal()">&times;</button>
        </div>

        <div class="auth-tabs">
          <button [class.active]="isLoginMode" (click)="isLoginMode = true; errorMessage = ''">Sign In</button>
          <button [class.active]="!isLoginMode" (click)="isLoginMode = false; errorMessage = ''">Create Account</button>
        </div>

        <div *ngIf="errorMessage" class="error-banner">
          ⚠️ {{ errorMessage }}
        </div>

        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div *ngIf="!isLoginMode" class="form-group">
            <label>Display Name</label>
            <input type="text" [(ngModel)]="displayName" name="displayName" placeholder="e.g. Alex Popescu" required />
          </div>

          <div class="form-group">
            <label>{{ isLoginMode ? 'Username or Email' : 'Username' }}</label>
            <input type="text" [(ngModel)]="username" name="username" placeholder="Choose a username" required />
          </div>

          <div *ngIf="!isLoginMode" class="form-group">
            <label>Email Address</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="alex@example.com" required />
          </div>

          <div *ngIf="!isLoginMode" class="form-group">
            <label>Your Primary Niche</label>
            <select [(ngModel)]="niche" name="niche">
              <option value="Tech & AI">Tech & AI</option>
              <option value="Gaming Creator">Gaming Creator</option>
              <option value="Travel Creator">Travel Creator</option>
              <option value="Music Creator">Music Creator</option>
              <option value="Fashion & Lifestyle">Fashion & Lifestyle</option>
              <option value="Food & Culinary">Food & Culinary</option>
            </select>
          </div>

          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="password" name="password" placeholder="••••••••" required />
          </div>

          <button type="submit" class="primary-button submit-btn" [disabled]="loading">
            {{ loading ? 'Processing...' : (isLoginMode ? 'Sign In' : 'Create Account') }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .modal-card {
      background: var(--card-bg, #1e1e2d);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 440px;
      color: #fff;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .modal-header h2 { font-size: 1.4rem; margin: 0; }
    .close-btn { background: none; border: none; color: #888; font-size: 1.8rem; cursor: pointer; }
    .auth-tabs {
      display: flex;
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 4px;
      margin-bottom: 20px;
    }
    .auth-tabs button {
      flex: 1;
      padding: 10px;
      background: none;
      border: none;
      color: #aaa;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }
    .auth-tabs button.active {
      background: #7c3aed;
      color: #fff;
    }
    .error-banner {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      padding: 10px 14px;
      border-radius: 8px;
      color: #fca5a5;
      font-size: 0.9rem;
      margin-bottom: 16px;
    }
    .form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 0.85rem; color: #bbb; }
    .form-group input, .form-group select {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 12px;
      border-radius: 8px;
      color: #fff;
    }
    .submit-btn { width: 100%; padding: 14px; margin-top: 10px; font-weight: 600; font-size: 1rem; }
  `]
})
export class AuthModalComponent {
  isLoginMode = true;
  loading = false;
  errorMessage = '';

  username = '';
  email = '';
  password = '';
  displayName = '';
  niche = 'Tech & AI';

  constructor(public authService: AuthService) {}

  closeModal(): void {
    // EventEmitter or state flag toggle
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.loading = true;

    if (this.isLoginMode) {
      this.authService.login({ usernameOrEmail: this.username, password: this.password }).subscribe({
        next: () => {
          this.loading = false;
          window.location.reload();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || (typeof err.error === 'string' ? err.error : 'Authentication failed. Please check your credentials.');
        }
      });
    } else {
      this.authService.register({
        username: this.username,
        email: this.email,
        password: this.password,
        displayName: this.displayName,
        niche: this.niche
      }).subscribe({
        next: () => {
          this.loading = false;
          window.location.reload();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || (typeof err.error === 'string' ? err.error : 'Registration failed. Username or email might be taken.');
        }
      });
    }
  }
}
