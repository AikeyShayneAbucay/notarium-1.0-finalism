import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage';
import { SupabaseService } from './supabase';
import { User, Role } from './models';

const USERS_KEY = 'notarixp.users';
const USER_KEY = 'notarixp.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private store = inject(StorageService);
  private sb = inject(SupabaseService);

  users: User[] = [];
  user: User | null = null;

  constructor() {
    this.users = this.store.read<User[] | null>(USERS_KEY, null) ?? this.seed();
    this.store.write(USERS_KEY, this.users);
    this.user = this.store.read<User | null>(USER_KEY, null);
    this.syncFromSupabase();
  }

  async syncFromSupabase(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('profiles')
        .select('*')
        .order('id', { ascending: true });
      if (!error && data && data.length > 0) {
        const fetched: User[] = data.map((p) => ({
          id: Number(p.id),
          name: p.name,
          email: p.email,
          password: p.password || '',
          role: p.role as Role,
        }));
        this.users = fetched.map((fu) => {
          const local = this.users.find((u) => u.email.toLowerCase() === fu.email.toLowerCase());
          return local?.password ? { ...fu, password: local.password } : fu;
        });
        this.store.write(USERS_KEY, this.users);
      }
    } catch {}
  }

  private seed(): User[] {
    return [
      { id: 1, name: 'Administrator', email: 'admin@notarium.com', password: 'admin123', role: 'admin' },
      { id: 2, name: 'Jay Ann Bayarcal', email: 'secretary@notarium.com', password: 'staff123', role: 'staff' },
    ];
  }

  isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  login(email: string, password: string): boolean {
    const found = this.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!found) return false;
    this.user = found;
    this.store.write(USER_KEY, found);

    // If Supabase Auth is enabled for this user, attempt session sign-in in the background
    this.sb.client.auth.signInWithPassword({ email: found.email, password }).then(() => {}, () => {});

    return true;
  }

  logout(): void {
    this.user = null;
    localStorage.removeItem(USER_KEY);
    this.sb.client.auth.signOut().then(() => {}, () => {});
  }

  /** Returns an error message, or null on success. */
  addStaff(name: string, email: string, password: string): string | null {
    if (!name.trim() || !email.trim() || !password.trim()) {
      return 'All fields are required.';
    }
    if (this.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return 'An account with this email address already exists.';
    }
    const nextId = this.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;
    const newStaff: User = { id: nextId, name: name.trim(), email: email.trim(), password, role: 'staff' };
    this.users = [...this.users, newStaff];
    this.store.write(USERS_KEY, this.users);

    this.sb.client
      .from('profiles')
      .insert({
        id: nextId,
        name: newStaff.name,
        email: newStaff.email,
        role: newStaff.role,
        password: newStaff.password,
      })
      .then(() => {}, () => {});

    return null;
  }

  removeStaff(id: number): void {
    this.users = this.users.filter((u) => u.id !== id);
    this.store.write(USERS_KEY, this.users);

    this.sb.client
      .from('profiles')
      .delete()
      .eq('id', id)
      .then(() => {}, () => {});
  }
}
