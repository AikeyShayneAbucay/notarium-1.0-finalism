import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  /**
   * Safe, non-destructive connection verification.
   * Checks reachable auth / API endpoint without reading or writing private tables.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: 'Connected to Supabase successfully' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }
}
