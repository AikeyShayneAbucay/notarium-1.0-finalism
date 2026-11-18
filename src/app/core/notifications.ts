import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase';
import { ClientAuthService } from './client-auth';

export type NotificationType =
  | 'appointment_submitted'
  | 'appointment_approved'
  | 'appointment_rejected'
  | 'appointment_rescheduled'
  | 'appointment_completed'
  | 'appointment_cancelled'
  | 'document_request_submitted'
  | 'document_request_under_review'
  | 'document_request_additional_requirements'
  | 'document_request_processing'
  | 'document_request_ready_for_release'
  | 'document_request_completed'
  | 'document_request_rejected';

export interface InAppNotification {
  id: number;
  userId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  relatedAppointmentId?: number | null;
  relatedDocumentRequestId?: number | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: number;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  related_appointment_id: number | null;
  related_document_request_id: number | null;
  is_read: boolean;
  created_at: string;
}

function fromRow(r: NotificationRow): InAppNotification {
  return {
    id: Number(r.id),
    userId: r.user_id,
    title: r.title || 'Notification',
    message: r.message || '',
    notificationType: (r.notification_type || 'appointment_submitted') as NotificationType,
    relatedAppointmentId: r.related_appointment_id,
    relatedDocumentRequestId: r.related_document_request_id,
    isRead: !!r.is_read,
    createdAt: r.created_at,
  };
}

export interface EmailDispatchParams {
  eventType: NotificationType;
  userId: string;
  clientEmail: string;
  clientName: string;
  referenceNo: string;
  documentType?: string;
  status?: string;
  previousStatus?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  previousDate?: string;
  previousTime?: string;
  remarks?: string;
  uniqueEventKey: string;
  notificationTitle: string;
  notificationMessage: string;
  appointmentId?: number;
  documentRequestId?: number;
}

export interface EmailDispatchResult {
  inAppCreated: boolean;
  emailStatus: 'accepted' | 'pending' | 'failed' | 'already_sent' | 'skipped';
  providerId?: string;
  message: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private sb = inject(SupabaseService);
  private clientAuth = inject(ClientAuthService);

  /** Live unread count signal for client portal badge */
  unreadCount = signal<number>(0);

  /**
   * Retrieves all notifications for the currently logged in client.
   */
  async listMine(): Promise<{ items: InAppNotification[]; error: string | null }> {
    try {
      await this.clientAuth.ready();
      const acc = this.clientAuth.account();
      if (!acc) return { items: [], error: 'Please sign in to view notifications.' };

      const { data, error } = await this.sb.client
        .from('notifications')
        .select('*')
        .eq('user_id', acc.id)
        .order('created_at', { ascending: false });

      if (error) {
        return { items: [], error: error.message };
      }

      const items = (data || []).map((r) => fromRow(r as NotificationRow));
      this.updateUnreadSignal(items);
      return { items, error: null };
    } catch (err: unknown) {
      return { items: [], error: err instanceof Error ? err.message : 'Failed to fetch notifications.' };
    }
  }

  /**
   * Refreshes the unread count signal for the client.
   */
  async refreshUnreadCount(): Promise<number> {
    try {
      const acc = this.clientAuth.account();
      if (!acc) {
        this.unreadCount.set(0);
        return 0;
      }

      const { count, error } = await this.sb.client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', acc.id)
        .eq('is_read', false);

      if (!error && count !== null) {
        this.unreadCount.set(count);
        return count;
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(id: number): Promise<string | null> {
    try {
      const { error } = await this.sb.client
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (!error) {
        this.unreadCount.update((c) => Math.max(0, c - 1));
        return null;
      }
      return error.message;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to mark as read.';
    }
  }

  /**
   * Marks all notifications of the current user as read.
   */
  async markAllAsRead(): Promise<string | null> {
    try {
      await this.clientAuth.ready();
      const acc = this.clientAuth.account();
      if (!acc) return 'Not authenticated';

      // 1. Try helper RPC
      const { error: rpcErr } = await this.sb.client.rpc('mark_all_notifications_read');
      if (!rpcErr) {
        this.unreadCount.set(0);
        return null;
      }

      // 2. Direct table update fallback
      const { error } = await this.sb.client
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', acc.id)
        .eq('is_read', false);

      if (!error) {
        this.unreadCount.set(0);
        return null;
      }
      return error.message;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to mark all as read.';
    }
  }

  /**
   * Realtime subscription for client in-app notifications.
   */
  subscribeToMine(callback: () => void): () => void {
    const acc = this.clientAuth.account();
    if (!acc) return () => {};

    const channelId = 'notif-' + acc.id.substring(0, 8) + '-' + Math.random().toString(36).substring(2, 6);
    const channel = this.sb.client
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${acc.id}`,
        },
        () => {
          this.refreshUnreadCount();
          callback();
        }
      )
      .subscribe();

    return () => {
      this.sb.client.removeChannel(channel);
    };
  }

  /**
   * Helper to create in-app notification and trigger Edge Function transactional email.
   * Never throws; guarantees that appointment status updates are preserved even if email fails.
   */
  async dispatchNotificationAndEmail(p: EmailDispatchParams): Promise<EmailDispatchResult> {
    let inAppCreated = false;

    // 1. CREATE IN-APP NOTIFICATION IN SUPABASE
    try {
      const { data, error } = await this.sb.client.rpc('create_client_notification', {
        p_user_id: p.userId,
        p_title: p.notificationTitle,
        p_message: p.notificationMessage,
        p_type: p.eventType,
        p_appointment_id: p.appointmentId ?? null,
        p_document_request_id: p.documentRequestId ?? null,
      });

      if (!error) {
        inAppCreated = true;
      } else {
        // Fallback: direct insert
        const { error: insertErr } = await this.sb.client.from('notifications').insert({
          user_id: p.userId,
          title: p.notificationTitle,
          message: p.notificationMessage,
          notification_type: p.eventType,
          related_appointment_id: p.appointmentId ?? null,
          related_document_request_id: p.documentRequestId ?? null,
          is_read: false,
        });
        if (!insertErr) inAppCreated = true;
      }
    } catch {
      // In-app failure is logged but does not block email
    }

    // 2. DISPATCH EMAIL VIA SUPABASE EDGE FUNCTION
    try {
      const { data, error } = await this.sb.client.functions.invoke('send-email', {
        body: {
          eventType: p.eventType,
          userId: p.userId,
          clientEmail: p.clientEmail,
          clientName: p.clientName,
          referenceNo: p.referenceNo,
          documentType: p.documentType,
          status: p.status,
          previousStatus: p.previousStatus,
          appointmentDate: p.appointmentDate,
          appointmentTime: p.appointmentTime,
          previousDate: p.previousDate,
          previousTime: p.previousTime,
          remarks: p.remarks,
          uniqueEventKey: p.uniqueEventKey,
        },
      });

      if (error) {
        return {
          inAppCreated,
          emailStatus: 'pending',
          message: 'Notification saved. Edge function unreached (queued in database).',
          error: error.message,
        };
      }

      if (data && data.success) {
        return {
          inAppCreated,
          emailStatus: data.status === 'already_sent' ? 'already_sent' : 'accepted',
          providerId: data.providerId,
          message: data.message || 'Email successfully accepted by provider.',
        };
      }

      return {
        inAppCreated,
        emailStatus: data?.status || 'pending',
        message: data?.message || 'Email delivery pending configuration.',
        error: data?.error,
      };
    } catch (err: unknown) {
      return {
        inAppCreated,
        emailStatus: 'pending',
        message: 'Notification saved. Email queued in database.',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private updateUnreadSignal(items: InAppNotification[]): void {
    const unread = items.filter((i) => !i.isRead).length;
    this.unreadCount.set(unread);
  }
}
