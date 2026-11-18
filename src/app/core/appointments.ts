import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { ClientAuthService } from './client-auth';
import { AuthService } from './auth';
import { ActivityLogService } from './activity';

export type AppointmentStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Rescheduled'
  | 'Completed'
  | 'Cancelled';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'Pending',
  'Approved',
  'Rejected',
  'Rescheduled',
  'Completed',
  'Cancelled',
];

export interface Appointment {
  id: number;
  referenceNo: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  contactNumber: string;
  documentType: string;
  appointmentDate: string; // yyyy-mm-dd
  appointmentTime: string; // HH:mm:ss
  purpose: string;
  status: AppointmentStatus;
  remarks: string;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentRow {
  id: number;
  reference_no: string;
  user_id: string;
  client_name: string;
  client_email: string;
  contact_number: string;
  document_type: string;
  appointment_date: string;
  appointment_time: string;
  purpose: string;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: AppointmentRow): Appointment {
  return {
    id: Number(row.id),
    referenceNo: row.reference_no || '',
    userId: row.user_id,
    clientName: row.client_name || '',
    clientEmail: row.client_email || '',
    contactNumber: row.contact_number || '',
    documentType: row.document_type || '',
    appointmentDate: row.appointment_date || '',
    appointmentTime: (row.appointment_time || '').slice(0, 5),
    purpose: row.purpose || '',
    status: (row.status || 'Pending') as AppointmentStatus,
    remarks: row.remarks || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private sb = inject(SupabaseService);
  private clientAuth = inject(ClientAuthService);
  private staffAuth = inject(AuthService);
  private activity = inject(ActivityLogService);

  /** True when the Supabase session is linked to an Admin/Secretary profile. */
  staffSessionReady = false;

  /**
   * Subscribes to Supabase Realtime changes on public.appointments.
   * Returns an unsubscribe function.
   */
  subscribeToChanges(callback: () => void): () => void {
    const channelId = 'apt-channel-' + Math.random().toString(36).substring(2, 9);
    const channel = this.sb.client
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          callback();
        }
      )
      .subscribe();

    return () => {
      this.sb.client.removeChannel(channel);
    };
  }

  /**
   * Attempts to establish a Supabase Auth session for the local staff member.
   */
  async ensureStaffSession(): Promise<boolean> {
    const staff = this.staffAuth.user;
    if (!staff) return false;
    if (this.staffSessionReady) return true;

    try {
      const { data } = await this.sb.client.auth.getSession();
      const session = data.session;
      if (session?.user) {
        const { data: prof } = await this.sb.client
          .from('profiles')
          .select('id, role')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (prof && (prof.role === 'admin' || prof.role === 'staff')) {
          this.staffSessionReady = true;
          return true;
        }
      }

      const { error } = await this.sb.client.auth.signInWithPassword({
        email: staff.email,
        password: staff.password,
      });
      if (!error) {
        this.staffSessionReady = true;
        return true;
      }
    } catch {
      // Fallback RPC will handle queries if Supabase Auth is unlinked
    }
    return false;
  }

  /**
   * All appointments (staff view for Admin and Secretary).
   * Tries direct query via RLS first, and seamlessly falls back to secure staff RPC.
   */
  async all(): Promise<{ rows: Appointment[]; error: string | null }> {
    const staff = this.staffAuth.user;
    if (!staff) return { rows: [], error: 'Staff session required.' };

    try {
      // 1. Try direct Supabase query with staff session
      await this.ensureStaffSession();
      const { data, error } = await this.sb.client
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return { rows: data.map((r) => fromRow(r as AppointmentRow)), error: null };
      }

      // 2. Dual fallback: invoke secure staff RPC
      const { data: rpcData, error: rpcError } = await this.sb.client.rpc('staff_get_appointments', {
        p_email: staff.email,
        p_password: staff.password,
      });

      if (!rpcError && rpcData) {
        return { rows: (rpcData as AppointmentRow[]).map(fromRow), error: null };
      }

      // If direct query succeeded but had 0 rows
      if (!error) {
        return { rows: (data ?? []).map((r) => fromRow(r as AppointmentRow)), error: null };
      }

      return { rows: [], error: this.friendly(error.message) };
    } catch (err: unknown) {
      return { rows: [], error: err instanceof Error ? err.message : 'Failed to fetch appointments.' };
    }
  }

  /**
   * The signed-in client's own appointments.
   * Awaits session readiness and falls back to getSession() to eliminate race conditions.
   */
  async mine(): Promise<{ rows: Appointment[]; error: string | null }> {
    try {
      await this.clientAuth.ready();
      let acc = this.clientAuth.account();

      if (!acc) {
        const { data: { session } } = await this.sb.client.auth.getSession();
        if (session?.user) {
          const email = session.user.email ?? '';
          const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
          const name =
            (typeof meta['full_name'] === 'string' && meta['full_name']) ||
            (typeof meta['name'] === 'string' && meta['name']) ||
            email.split('@')[0];
          acc = { id: session.user.id, email, name, avatarUrl: '' };
        }
      }

      if (!acc) {
        return { rows: [], error: 'Please sign in to view your appointments.' };
      }

      const { data, error } = await this.sb.client
        .from('appointments')
        .select('*')
        .eq('user_id', acc.id)
        .order('created_at', { ascending: false });

      if (error) return { rows: [], error: this.friendly(error.message) };
      return { rows: (data ?? []).map((r) => fromRow(r as AppointmentRow)), error: null };
    } catch (err: unknown) {
      return { rows: [], error: err instanceof Error ? err.message : 'Failed to load appointments.' };
    }
  }

  /** Client booking via RPC — returns created appointment or error message. */
  async create(input: {
    clientName: string;
    contactNumber: string;
    documentType: string;
    appointmentDate: string;
    appointmentTime: string;
    purpose: string;
  }): Promise<{ appointment: Appointment | null; error: string | null }> {
    try {
      const { data, error } = await this.sb.client.rpc('create_appointment', {
        p_client_name: input.clientName,
        p_contact_number: input.contactNumber,
        p_document_type: input.documentType,
        p_appointment_date: input.appointmentDate,
        p_appointment_time: input.appointmentTime,
        p_purpose: input.purpose,
      });
      if (error) return { appointment: null, error: this.friendly(error.message) };
      return { appointment: fromRow(data as AppointmentRow), error: null };
    } catch (err: unknown) {
      return { appointment: null, error: err instanceof Error ? err.message : 'Failed to create appointment.' };
    }
  }

  /** Client self-cancel via RPC. */
  async cancel(id: number, reason: string): Promise<string | null> {
    try {
      const { error } = await this.sb.client.rpc('cancel_my_appointment', {
        p_appointment_id: id,
        p_reason: reason,
      });
      return error ? this.friendly(error.message) : null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to cancel appointment.';
    }
  }

  /**
   * Staff status change (approve / reject / complete / cancel).
   * Tries direct update, falls back to secure staff RPC.
   */
  async setStatus(
    id: number,
    status: AppointmentStatus,
    remarks: string,
    ref: string,
  ): Promise<string | null> {
    const staff = this.staffAuth.user;

    // Attempt 1: Direct update
    const { error } = await this.sb.client
      .from('appointments')
      .update({ status, remarks: remarks || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      this.activity.log(`Appointment ${status.toLowerCase()}`, `Appointment ${ref} marked ${status}.`);
      return null;
    }

    // Attempt 2: Secure staff RPC fallback
    if (staff) {
      const { error: rpcError } = await this.sb.client.rpc('staff_update_appointment_status', {
        p_email: staff.email,
        p_password: staff.password,
        p_appointment_id: id,
        p_status: status,
        p_remarks: remarks || null,
      });

      if (!rpcError) {
        this.activity.log(`Appointment ${status.toLowerCase()}`, `Appointment ${ref} marked ${status}.`);
        return null;
      }
      return this.friendly(rpcError.message);
    }

    return this.friendly(error.message);
  }

  /**
   * Staff reschedule.
   * Tries direct update, falls back to secure staff RPC.
   */
  async reschedule(
    id: number,
    date: string,
    time: string,
    remarks: string,
    ref: string,
  ): Promise<string | null> {
    const staff = this.staffAuth.user;

    // Attempt 1: Direct update
    const { error } = await this.sb.client
      .from('appointments')
      .update({
        appointment_date: date,
        appointment_time: time,
        status: 'Rescheduled',
        remarks: remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (!error) {
      this.activity.log('Rescheduled an appointment', `Appointment ${ref} moved to ${date} ${time}.`);
      return null;
    }

    // Attempt 2: Secure staff RPC fallback
    if (staff) {
      const { error: rpcError } = await this.sb.client.rpc('staff_reschedule_appointment', {
        p_email: staff.email,
        p_password: staff.password,
        p_appointment_id: id,
        p_date: date,
        p_time: time,
        p_remarks: remarks || null,
      });

      if (!rpcError) {
        this.activity.log('Rescheduled an appointment', `Appointment ${ref} moved to ${date} ${time}.`);
        return null;
      }
      return this.friendly(rpcError.message);
    }

    return this.friendly(error.message);
  }

  /** Turns raw Postgres errors into client-friendly messages. */
  private friendly(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('already booked')) return 'That date and time is already booked. Please choose another slot.';
    if (m.includes('must be a future date')) return 'Appointment date must be a future date.';
    if (m.includes('sundays')) return 'The office is closed on Sundays. Please choose another date.';
    if (m.includes('9:00 am to 4:00 pm')) return 'Bookings are only available from 9:00 AM to 4:00 PM.';
    if (m.includes('30-minute intervals')) return 'Appointments must be booked in 30-minute intervals.';
    if (m.includes('row-level security') || m.includes('permission')) {
      return 'You do not have permission for this action.';
    }
    return msg || 'Something went wrong. Please try again.';
  }
}
