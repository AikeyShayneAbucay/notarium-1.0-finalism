import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage';
import { RecordsService } from './records';
import { SupabaseService } from './supabase';
import { DocType } from './models';

const TYPES_KEY = 'notarixp.types';

@Injectable({ providedIn: 'root' })
export class DocTypesService {
  private store = inject(StorageService);
  private records = inject(RecordsService);
  private sb = inject(SupabaseService);

  types: DocType[] = [];

  constructor() {
    this.types = this.store.read<DocType[] | null>(TYPES_KEY, null) ?? this.seed();
    this.store.write(TYPES_KEY, this.types);
    this.syncFromSupabase();
  }

  async syncFromSupabase(): Promise<void> {
    try {
      const { data, error } = await this.sb.client
        .from('document_types')
        .select('*')
        .order('id', { ascending: true });
      if (!error && data && data.length > 0) {
        this.types = data.map((row) => ({ id: Number(row.id), name: String(row.name) }));
        this.commit();
      }
    } catch {}
  }

  private seed(): DocType[] {
    return [
      'Affidavit of Loss',
      'Affidavit of Support',
      'Authorization Letter',
      'Contract Agreement',
      'Deed of Sale',
      'Others',
      'Special Power of Attorney',
      'Waiver',
    ].map((name, i) => ({ id: i + 1, name }));
  }

  commit(): void {
    this.store.write(TYPES_KEY, this.types);
  }

  list(): DocType[] {
    return [...this.types].sort((a, b) => a.name.localeCompare(b.name));
  }

  names(): string[] {
    return this.list().map((t) => t.name);
  }

  countFor(name: string): number {
    return this.records.countByType(name);
  }

  /** Returns an error message, or null on success. */
  add(name: string): string | null {
    const clean = name.trim();
    if (!clean) return 'Please enter a document type name.';
    if (this.types.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
      return 'This document type already exists.';
    }

    // Optimistically add locally with a temporary ID; Supabase will assign real ID on sync
    const tempId = this.types.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    this.types = [...this.types, { id: tempId, name: clean }];
    this.store.write(TYPES_KEY, this.types);

    // Insert without explicit ID — let Supabase assign it, then sync to get real IDs
    this.sb.client
      .from('document_types')
      .insert({ name: clean })
      .then(async () => {
        // Re-sync from Supabase so local IDs match DB IDs
        await this.syncFromSupabase();
      }, () => {});

    return null;
  }

  /** Only removes types that are not referenced by any record. */
  removeIfUnused(id: number): boolean {
    const t = this.types.find((x) => x.id === id);
    if (!t || this.countFor(t.name) > 0) return false;
    this.types = this.types.filter((x) => x.id !== id);
    this.store.write(TYPES_KEY, this.types);

    this.sb.client
      .from('document_types')
      .delete()
      .eq('id', id)
      .then(() => {}, () => {});

    return true;
  }
}
