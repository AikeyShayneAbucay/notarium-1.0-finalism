import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';
import { Role } from './models';
import { getDeviceInfo } from './device';

export type ActivityAction =
  | 'Successful login'
  | 'Failed login attempt'
  | 'Logout'
  | 'Added a new notarization record'
  | 'Viewed a notarization record'
  | 'Updated a notarization record'
  | 'Changed document status'
  | 'Changed document location'
  | 'Deleted a notarization record'
  | 'Generated a monthly report';

export interface ActivityLog {
  id: number;
  userId: number;
  userName: string;
  role: Role;
  activity: string;
  details?: string;
  deviceInfo: string;
  createdAt: string; // ISO 8601 string
}

export const ACTIVITY_STORAGE_KEY = 'notarixp.activity_logs';

/** Format ISO timestamp to Philippine Date (Asia/Manila) */
export function formatPhilippineDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

/** Format ISO timestamp to Philippine Time (Asia/Manila) */
export function formatPhilippineTime(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '';
  }
}

@Injectable({ providedIn: 'root' })
export class ActivityLogService {
  private store = inject(StorageService);
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private logs: ActivityLog[] = [];

  constructor() {
    this.logs = this.store.read<ActivityLog[] | null>(ACTIVITY_STORAGE_KEY, null) ?? this.seed();
    this.store.write(ACTIVITY_STORAGE_KEY, this.logs);
    this.syncFromSupabase();
  }

  private seed(): ActivityLog[] {
    const now = new Date();
    const isoNow = now.toISOString();
    return [
      {
        id: 1,
        userId: 1,
        userName: 'Administrator',
        role: 'admin',
        activity: 'Successful login',
        details: 'Initial system login to NOTARIX',
        deviceInfo: getDeviceInfo(),
        createdAt: isoNow,
      },
    ];
  }

  private commit(): void {
    this.store.write(ACTIVITY_STORAGE_KEY, this.logs);
  }

  async syncFromSupabase(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const fetched: ActivityLog[] = data.map((r: any) => ({
          id: Number(r.id),
          userId: Number(r.user_id) || 0,
          userName: r.user_name || 'System User',
          // Support both legacy 'role' column and new 'user_role' column
          role: ((r.user_role || r.role) === 'admin' ? 'admin' : 'staff') as Role,
          activity: r.activity_type || r.activity || '',
          details: r.description || r.details || '',
          deviceInfo: r.device_info || '',
          createdAt: r.created_at || new Date().toISOString(),
        }));

        // Replace local cache entirely with Supabase data (source of truth)
        this.logs = fetched;
        this.commit();
      }
    } catch {
      // Local fallback active if Supabase table is not yet created
    }
  }

  /**
   * Records an activity log entry.
   * If overrideUser is provided, uses that user identity (e.g. for failed login or logout).
   * Otherwise uses currently authenticated user.
   */
  log(
    activity: ActivityAction | string,
    details?: string,
    overrideUser?: { id: number; name: string; role: Role }
  ): ActivityLog {
    const user = overrideUser || this.auth.user || {
      id: 0,
      name: 'System User',
      role: 'staff' as Role,
    };

    const nextId = this.logs.reduce((max, l) => Math.max(max, l.id), 0) + 1;
    const createdAt = new Date().toISOString();
    const deviceInfo = getDeviceInfo();

    const entry: ActivityLog = {
      id: nextId,
      userId: user.id,
      userName: user.name,
      role: user.role,
      activity,
      details,
      deviceInfo,
      createdAt,
    };

    this.logs = [entry, ...this.logs];
    this.commit();

    // Persist to Supabase activity_logs table (fire-and-forget with silent fallback)
    this.sb.client
      .from('activity_logs')
      .insert({
        user_id: String(entry.userId),
        user_name: entry.userName,
        user_role: entry.role,
        activity_type: entry.activity,
        description: entry.details || '',
        device_info: entry.deviceInfo,
        created_at: entry.createdAt,
      })
      .then(
        ({ error }) => {
          if (error) {
            // Supabase insert failed; local log already saved — no action needed
          }
        },
        () => {}
      );

    return entry;
  }

  /**
   * Returns list of logs filtered by current user permissions:
   * - Admin: views all logs from both Admin and Secretary
   * - Secretary / Staff: views only their own activity history
   */
  list(): ActivityLog[] {
    const currentUser = this.auth.user;
    if (!currentUser) return [];

    if (currentUser.role === 'admin') {
      return [...this.logs];
    }

    // Secretary only sees their own activities
    return this.logs.filter(
      (l) => l.userId === currentUser.id || l.userName.toLowerCase() === currentUser.name.toLowerCase()
    );
  }
}
