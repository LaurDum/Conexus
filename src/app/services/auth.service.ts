import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export interface UserSession {
  id: number;
  username: string;
  email: string;
  displayName: string;
  niche: string;
  avatar: string;
  bgClass: string;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly base = 'http://localhost:8080/api/auth';
  private currentUserSubject = new BehaviorSubject<UserSession | null>(this.getUserFromStorage());
  currentUser$: Observable<UserSession | null> = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  private getUserFromStorage(): UserSession | null {
    const data = localStorage.getItem('conexus_user');
    return data ? JSON.parse(data) : null;
  }

  get currentUser(): UserSession | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  register(req: { username: string; email: string; password: string; displayName?: string; niche?: string }): Observable<UserSession> {
    return this.http.post<UserSession>(`${this.base}/register`, req).pipe(
      tap(user => this.setSession(user))
    );
  }

  login(req: { usernameOrEmail: string; password: string }): Observable<UserSession> {
    return this.http.post<UserSession>(`${this.base}/login`, req).pipe(
      tap(user => this.setSession(user))
    );
  }

  logout(): void {
    localStorage.removeItem('conexus_user');
    this.currentUserSubject.next(null);
  }

  private setSession(user: UserSession): void {
    localStorage.setItem('conexus_user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }
}
