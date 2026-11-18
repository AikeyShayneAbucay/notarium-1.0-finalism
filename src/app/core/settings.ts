import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage';
import { OfficeSettings } from './models';

const SETTINGS_KEY = 'notarixp.settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private store = inject(StorageService);

  settings: OfficeSettings;

  constructor() {
    this.settings = this.store.read<OfficeSettings | null>(SETTINGS_KEY, null) ?? {
      name: 'Palasan Law Office',
      address: 'pob. 2',
      contact: '09123456789',
    };
    if (this.settings.name === 'Pasalan Law Office') {
      this.settings.name = 'Palasan Law Office';
    }
    this.store.write(SETTINGS_KEY, this.settings);
  }

  save(s: OfficeSettings): void {
    this.settings = { ...s };
    this.store.write(SETTINGS_KEY, this.settings);
  }
}
