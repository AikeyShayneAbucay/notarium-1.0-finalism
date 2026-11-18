import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage';
import { SupabaseService } from './supabase';
import { MONTH_NAMES, LOCATIONS, FORM_STATUSES, NotarizationRecord, RecordStatus, locationFor } from './models';

const RECORDS_KEY = 'notarixp.records';

export interface Vitals {
  total: number;
  thisMonth: number;
  prevCount: number;
  diff: number;
  prevMonthName: string;
  forSubmission: number;
  submitted: number;
}

function toRow(r: Partial<NotarizationRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (r.id !== undefined) row['id'] = r.id;
  if (r.documentNo !== undefined) row['document_no'] = r.documentNo;
  if (r.type !== undefined) row['type'] = r.type;
  if (r.clientName !== undefined) row['client_name'] = r.clientName;
  if (r.dateNotarized !== undefined) row['date_notarized'] = r.dateNotarized;
  if (r.status !== undefined) row['status'] = r.status;
  if (r.location !== undefined) row['location'] = r.location;
  return row;
}

function fromRow(row: any): NotarizationRecord {
  return {
    id: Number(row.id),
    documentNo: row.document_no || '',
    type: row.type || '',
    clientName: row.client_name || '',
    dateNotarized: row.date_notarized || '',
    status: row.status as RecordStatus,
    location: row.location || '',
  };
}

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private store = inject(StorageService);
  private sb = inject(SupabaseService);

  records: NotarizationRecord[] = [];

  constructor() {
    this.records =
      this.store.read<NotarizationRecord[] | null>(RECORDS_KEY, null) ?? this.seed();
    this.records = this.records.map((r) => this.normalize(r));
    this.store.write(RECORDS_KEY, this.records);
    this.syncFromSupabase();
  }

  async syncFromSupabase(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('records')
        .select('*')
        .order('id', { ascending: false });
      if (!error && data && data.length > 0) {
        this.records = data.map((row) => this.normalize(fromRow(row)));
        this.commit();
      }
    } catch {
      // Gracefully maintain local cache if table is empty or offline
    }
  }

  /**
   * Keeps stored rows consistent with the current office rules:
   * locations outside the two legal values are re-assigned based on status,
   * and the status/location pair for the two main statuses is enforced.
   */
  private normalize(r: NotarizationRecord): NotarizationRecord {
    if (FORM_STATUSES.includes(r.status)) {
      // For Submission → Palasan Law Office · Submitted → Main Office
      return { ...r, location: locationFor(r.status) };
    }
    // legacy "In Office" — keep its location only if it is still one of the valid offices
    const location = LOCATIONS.includes(r.location) ? r.location : LOCATIONS[0];
    return { ...r, location };
  }

  private seed(): NotarizationRecord[] {
    const d = new Date(Date.now() - 86400000); // yesterday
    const yesterday =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return [
      {
        id: 1,
        documentNo: 'hhhhh',
        type: 'Authorization Letter',
        clientName: 'haji wapo',
        dateNotarized: yesterday,
        status: 'In Office',
        location: 'Main Office',
      },
    ];
  }

  commit(): void {
    this.store.write(RECORDS_KEY, this.records);
  }

  list(): NotarizationRecord[] {
    return this.records;
  }

  byId(id: number): NotarizationRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  /**
   * Generates the next sequential Document Number following Palasan Law Office convention:
   * YYYY-XXXX (e.g. 2026-0001, 2026-0002).
   * Checks all existing records to prevent duplicates.
   */
  nextDocumentNo(targetYear?: number): string {
    const year = targetYear ?? new Date().getFullYear();
    let maxSeq = 0;
    const yearRegex = new RegExp(`^(?:DOC-)?${year}-(\\d+)$`, 'i');

    for (const r of this.records) {
      const match = (r.documentNo || '').trim().match(yearRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }

    let candidateSeq = maxSeq + 1;
    let candidate = `${year}-${String(candidateSeq).padStart(4, '0')}`;

    while (this.records.some((r) => (r.documentNo || '').trim().toLowerCase() === candidate.toLowerCase())) {
      candidateSeq++;
      candidate = `${year}-${String(candidateSeq).padStart(4, '0')}`;
    }

    return candidate;
  }

  add(data: Omit<NotarizationRecord, 'id'>): NotarizationRecord {
    let docNo = (data.documentNo || '').trim();
    // Guarantee unique document number if blank or already assigned
    if (!docNo || this.records.some((r) => (r.documentNo || '').trim().toLowerCase() === docNo.toLowerCase())) {
      docNo = this.nextDocumentNo();
    }

    const nextId = this.records.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const rec = this.normalize({ ...data, documentNo: docNo, id: nextId });
    this.records = [rec, ...this.records];
    this.commit();

    const row = toRow(rec);
    this.sb.client
      .from('records')
      .insert(row)
      .select()
      .single()
      .then(
        ({ data: inserted, error }) => {
          if (error) {
            // Handle duplicate / unique constraint collision from concurrent creation
            if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'))) {
              const freshNum = this.nextDocumentNo();
              rec.documentNo = freshNum;
              this.commit();
              row['document_no'] = freshNum;
              this.sb.client.from('records').insert(row).select().single().then(
                ({ data: retryInserted }) => {
                  if (retryInserted) {
                    const synced = this.normalize(fromRow(retryInserted));
                    this.records = this.records.map((r) => (r.id === rec.id ? synced : r));
                    this.commit();
                  }
                },
                () => {}
              );
            }
          } else if (inserted) {
            const synced = this.normalize(fromRow(inserted));
            this.records = this.records.map((r) => (r.id === rec.id ? synced : r));
            this.commit();
          }
        },
        () => {},
      );

    return rec;
  }

  update(id: number, patch: Partial<NotarizationRecord>): void {
    this.records = this.records.map((r) => (r.id === id ? this.normalize({ ...r, ...patch }) : r));
    this.commit();

    const rowPatch = toRow(patch);
    rowPatch['updated_at'] = new Date().toISOString();
    this.sb.client
      .from('records')
      .update(rowPatch)
      .eq('id', id)
      .then(() => {}, () => {});
  }

  /** Updates several records in one operation (bulk status/location change). */
  bulkUpdate(ids: number[], patch: Partial<NotarizationRecord>): void {
    this.records = this.records.map((r) => {
      if (!ids.includes(r.id)) {
        return r;
      }

      const updated = { ...r, ...patch };

      if (patch.status !== undefined) {
        return this.normalize(updated);
      }

      if (patch.location !== undefined) {
        return updated;
      }

      return this.normalize(updated);
    });

    this.commit();

    const rowPatch = toRow(patch);
    rowPatch['updated_at'] = new Date().toISOString();
    this.sb.client
      .from('records')
      .update(rowPatch)
      .in('id', ids)
      .then(() => {}, () => {});
  }

  remove(id: number): void {
    this.records = this.records.filter((r) => r.id !== id);
    this.commit();

    this.sb.client
      .from('records')
      .delete()
      .eq('id', id)
      .then(() => {}, () => {});
  }

  byMonth(year: number, monthIndex: number): NotarizationRecord[] {
    return this.records.filter((r) => {
      const d = new Date(r.dateNotarized + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }

  countByType(type: string): number {
    return this.records.filter((r) => r.type === type).length;
  }

  countByStatus(status: RecordStatus): number {
    return this.records.filter((r) => r.status === status).length;
  }

  vitals(): Vitals {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = this.byMonth(now.getFullYear(), now.getMonth()).length;
    const prevCount = this.byMonth(prev.getFullYear(), prev.getMonth()).length;
    return {
      total: this.records.length,
      thisMonth,
      prevCount,
      diff: thisMonth - prevCount,
      prevMonthName: MONTH_NAMES[prev.getMonth()],
      forSubmission: this.records.filter((r) => r.status !== 'Submitted').length,
      submitted: this.countByStatus('Submitted'),
    };
  }
}
