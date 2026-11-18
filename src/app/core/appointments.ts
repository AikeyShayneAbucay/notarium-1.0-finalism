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
   * The dashboard runs on the localStorage staff session while Supabase Auth
   * needs its own session for RLS. Mirrors AuthService.login by signing in to
   * Supabase with the same credentials in the background.
   */
  async ensureStaffSession(): Promise<boolean> {
    const staff = this.staffAuth.user;
    if (!staff) return false;
    if (this.staffSessionReady) return true;

    const { data } = await this.sb.client.auth.getSession();
    const session = data.session;
    if (session?.user) {
      // Any authenticated session is enough for staff to manage appointments
      // once the profiles.auth_user_id link exists; try to verify.
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

    // Retry Supabase sign-in with the local staff credentials
    const { error } = await this.sb.client.auth.signInWithPassword({
      email: staff.email,
      password: staff.password,
    });
    if (!error) {
      this.staffSessionReady = true;
      return true;
    }
    return false;
  }

  /** All appointments (staff view). Returns rows + optional error message. */
  async all(): Promise<{ rows: Appointment[]; error: string | null }> {
    const ready = await this.ensureStaffSession();
    const { data, error } = await this.sb.client
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      return { rows: [], error: error.message };
    }
    return { rows: (data ?? []).map((r) => fromRow(r as AppointmentRow)), error: null };
  }

  /** The signed-in client's own appointments. */
  async mine(): Promise<{ rows: Appointment[]; error: string | null }> {
    const acc = this.clientAuth.account();
    if (!acc) return { rows: [], error: 'Not signed in.' };
    const { data, error } = await this.sb.client
      .from('appointments')
      .select('*')
      .eq('user_id', acc.id)
      .order('created_at', { ascending: false });
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((r) => fromRow(r as AppointmentRow)), error: null };
  }

  /** Client booking via RPC — returns the created appointment or an error message. */
  async create(input: {
    clientName: string;
    contactNumber: string;
    documentType: string;
    appointmentDate: string;
    appointmentTime: string;
    purpose: string;
  }): Promise<{ appointment: Appointment | null; error: string | null }> {
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
  }

  /** Client self-cancel via RPC. */
  async cancel(id: number, reason: string): Promise<string | null> {
    const { error } = await this.sb.client.rpc('cancel_my_appointment', {
      p_appointment_id: id,
      p_reason: reason,
    });
    return error ? this.friendly(error.message) : null;
  }

  /** Staff status change (approve / reject / complete / cancel). */
  async setStatus(
    id: number,
    status: AppointmentStatus,
    remarks: string,
    ref: string,
  ): Promise<string | null> {
    const { error } = await this.sb.client
      .from('appointments')
      .update({ status, remarks: remarks || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return this.friendly(error.message);
    this.activity.log(`Appointment ${status.toLowerCase()}`, `Appointment ${ref} marked ${status}.`);
    return null;
  }

  /** Staff reschedule. */
  async reschedule(
    id: number,
    date: string,
    time: string,
    remarks: string,
    ref: string,
  ): Promise<string | null> {
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
    if (error) return this.friendly(error.message);
    this.activity.log('Rescheduled an appointment', `Appointment ${ref} moved to ${date} ${time}.`);
    return null;
  }

  /** Turns raw Postgres errors into client-friendly messages. */
  private friendly(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('already booked')) return 'That date and time is already booked. Please choose another slot.';
    if (m.includes('must be a future date')) return 'Appointment date must be a future date.';
    if (m.includes('sundays')) return 'The office is closed on Sundays. Please choose another date.';
    if (m.includes('9:00 am to 4:00 pm')) return 'Bookings are only available from 9:00 AM to 4:00 PM.';
    if (m.includes('row-level security') || m.includes('permission')) {
      return 'You do not have permission for this action.';
    }
    return msg || 'Something went wrong. Please try again.';
  }
}
