import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { ClientAuthService } from './client-auth';
import { AuthService } from './auth';
import { ActivityLogService } from './activity';
import { NotificationsService, NotificationType } from './notifications';

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
  private notifications = inject(NotificationsService);

  /** True when the Supabase session is linked to an Admin/Secretary profile. */
  staffSessionReady = false;

  /**
   * Fetch single appointment by id.
   */
  async getById(id: number): Promise<Appointment | null> {
    try {
      const { data } = await this.sb.client
        .from('appointments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return data ? fromRow(data as AppointmentRow) : null;
    } catch {
      return null;
    }
  }

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
      const appt = fromRow(data as AppointmentRow);

      // Automatic In-App Notification & Transactional Email
      this.notifications.dispatchNotificationAndEmail({
        eventType: 'appointment_submitted',
        userId: appt.userId,
        clientEmail: appt.clientEmail,
        clientName: appt.clientName,
        referenceNo: appt.referenceNo,
        documentType: appt.documentType,
        status: 'Pending',
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
        uniqueEventKey: `apt_submitted_${appt.referenceNo}`,
        notificationTitle: 'Appointment Submitted',
        notificationMessage: `Your appointment request for ${appt.documentType} on ${appt.appointmentDate} at ${appt.appointmentTime} has been submitted (Ref: ${appt.referenceNo}).`,
        appointmentId: appt.id,
      }).catch(() => {});

      return { appointment: appt, error: null };
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
   * Dispatches in-app notification and email to client, and returns status feedback.
   */
  async setStatus(
    id: number,
    status: AppointmentStatus,
    remarks: string,
    ref: string,
    existing?: Partial<Appointment> | null,
  ): Promise<{ error: string | null; feedback: string }> {
    const staff = this.staffAuth.user;
    let updateSuccess = false;
    let errMsg: string | null = null;

    // Attempt 1: Direct update
    const { error } = await this.sb.client
      .from('appointments')
      .update({ status, remarks: remarks || null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      updateSuccess = true;
    } else if (staff) {
      // Attempt 2: Secure staff RPC fallback
      const { error: rpcError } = await this.sb.client.rpc('staff_update_appointment_status', {
        p_email: staff.email,
        p_password: staff.password,
        p_appointment_id: id,
        p_status: status,
        p_remarks: remarks || null,
      });

      if (!rpcError) {
        updateSuccess = true;
      } else {
        errMsg = this.friendly(rpcError.message);
      }
    } else {
      errMsg = this.friendly(error.message);
    }

    if (!updateSuccess) {
      return { error: errMsg || 'Failed to update status.', feedback: '' };
    }

    this.activity.log(`Appointment ${status.toLowerCase()}`, `Appointment ${ref} marked ${status}.`);

    // Lookup client details for notification if not passed in
    let appt = existing;
    if (!appt || !appt.userId) {
      appt = await this.getById(id);
    }

    let feedback = `Appointment ${ref} marked ${status}.`;

    if (appt && appt.userId) {
      const eventTypeMap: Record<AppointmentStatus, NotificationType> = {
        Pending: 'appointment_submitted',
        Approved: 'appointment_approved',
        Rejected: 'appointment_rejected',
        Rescheduled: 'appointment_rescheduled',
        Completed: 'appointment_completed',
        Cancelled: 'appointment_cancelled',
      };

      const eventType = eventTypeMap[status] || 'appointment_approved';
      let title = `Appointment ${status}`;
      let msg = `Your appointment ${ref} for ${appt.documentType || 'Notarial Service'} has been ${status.toLowerCase()}.`;

      if (status === 'Approved') {
        msg = `Your appointment ${ref} for ${appt.documentType || 'Notarial Service'} on ${appt.appointmentDate || ''} at ${appt.appointmentTime || ''} has been approved.`;
      } else if (status === 'Rejected') {
        msg = `Your appointment ${ref} has been rejected.${remarks ? ' Reason: ' + remarks : ''}`;
      } else if (status === 'Completed') {
        msg = `Your appointment ${ref} has been completed. Thank you for choosing Palasan Law Office.`;
      } else if (status === 'Cancelled') {
        msg = `Your appointment ${ref} has been cancelled.${remarks ? ' Remarks: ' + remarks : ''}`;
      }

      const emailRes = await this.notifications.dispatchNotificationAndEmail({
        eventType,
        userId: appt.userId,
        clientEmail: appt.clientEmail || '',
        clientName: appt.clientName || 'Valued Client',
        referenceNo: ref,
        documentType: appt.documentType || 'Notarial Service',
        status,
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
        remarks: remarks || undefined,
        uniqueEventKey: `apt_${status.toLowerCase()}_${ref}_${Date.now()}`,
        notificationTitle: title,
        notificationMessage: msg,
        appointmentId: id,
      });

      feedback += ' In-app notice sent.';
      if (emailRes.emailStatus === 'accepted') {
        feedback += ' Email accepted by provider.';
      } else if (emailRes.emailStatus === 'pending') {
        feedback += ' Email queued in database.';
      } else if (emailRes.emailStatus === 'failed') {
        feedback += ` (Email delivery: ${emailRes.error || 'pending'})`;
      }
    }

    return { error: null, feedback };
  }

  /**
   * Staff reschedule.
   * Tries direct update, falls back to secure staff RPC.
   * Dispatches in-app notification and email to client, and returns status feedback.
   */
  async reschedule(
    id: number,
    date: string,
    time: string,
    remarks: string,
    ref: string,
    existing?: Partial<Appointment> | null,
  ): Promise<{ error: string | null; feedback: string }> {
    const staff = this.staffAuth.user;
    let updateSuccess = false;
    let errMsg: string | null = null;

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
      updateSuccess = true;
    } else if (staff) {
      // Attempt 2: Secure staff RPC fallback
      const { error: rpcError } = await this.sb.client.rpc('staff_reschedule_appointment', {
        p_email: staff.email,
        p_password: staff.password,
        p_appointment_id: id,
        p_date: date,
        p_time: time,
        p_remarks: remarks || null,
      });

      if (!rpcError) {
        updateSuccess = true;
      } else {
        errMsg = this.friendly(rpcError.message);
      }
    } else {
      errMsg = this.friendly(error.message);
    }

    if (!updateSuccess) {
      return { error: errMsg || 'Failed to reschedule appointment.', feedback: '' };
    }

    this.activity.log('Rescheduled an appointment', `Appointment ${ref} moved to ${date} ${time}.`);

    // Lookup client details for notification if not passed in
    let appt = existing;
    if (!appt || !appt.userId) {
      appt = await this.getById(id);
    }

    let feedback = `Appointment ${ref} rescheduled to ${date} ${time}.`;

    if (appt && appt.userId) {
      const emailRes = await this.notifications.dispatchNotificationAndEmail({
        eventType: 'appointment_rescheduled',
        userId: appt.userId,
        clientEmail: appt.clientEmail || '',
        clientName: appt.clientName || 'Valued Client',
        referenceNo: ref,
        documentType: appt.documentType || 'Notarial Service',
        status: 'Rescheduled',
        previousStatus: appt.status || 'Pending',
        appointmentDate: date,
        appointmentTime: time,
        previousDate: appt.appointmentDate,
        previousTime: appt.appointmentTime,
        remarks: remarks || undefined,
        uniqueEventKey: `apt_rescheduled_${ref}_${Date.now()}`,
        notificationTitle: 'Appointment Rescheduled',
        notificationMessage: `Your appointment ${ref} has been rescheduled to ${date} at ${time}.${remarks ? ' Note: ' + remarks : ''}`,
        appointmentId: id,
      });

      feedback += ' In-app notice sent.';
      if (emailRes.emailStatus === 'accepted') {
        feedback += ' Email accepted by provider.';
      } else if (emailRes.emailStatus === 'pending') {
        feedback += ' Email queued in database.';
      } else if (emailRes.emailStatus === 'failed') {
        feedback += ` (Email delivery: ${emailRes.error || 'pending'})`;
      }
    }

    return { error: null, feedback };
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
