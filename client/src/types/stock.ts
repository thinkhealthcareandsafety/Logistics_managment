export type ListStyle = 'plain' | 'numbers' | 'letters';

export interface StockCategory {
  _id: string;
  name: string;
  sortOrder: number;
  listStyle: ListStyle;
}

export interface StockItem {
  _id: string;
  categoryId: string;
  name: string;
  /** Optional size / dimension, e.g. "5×4", "Big". Separate from the name. */
  size: string;
  /** Total on the shelf - old + new when the line is split. */
  quantity: number;
  /** How many of `quantity` are old stock. null = the line isn't split. */
  oldQuantity: number | null;
  /** Public remark, shown in the WhatsApp update. */
  note: string;
  /** The manager's own note - never leaves the app. */
  internalNote: string;
  expiryDates: string[];
  lowStockAt: number | null;
  productCode: string;
  /** Linked Zoho Books item; '' = not linked. */
  zohoItemId: string;
  zohoItemName: string;
  sortOrder: number;
  updatedAt: string;
}

export interface StockSettings {
  shareToken: string;
  hideZeroInMessage: boolean;
  broadcast: {
    enabled: boolean;
    time: string;
    recipients: string[];
    lastSentAt: string | null;
  };
  lastCountAt: string | null;
  lastCountBy: string;
  whatsappConfigured: boolean;
}

export interface StockSnapshot {
  categories: StockCategory[];
  items: StockItem[];
  settings: StockSettings;
}

export interface StockMovement {
  _id: string;
  itemId: string;
  itemName: string;
  change: number;
  quantityAfter: number;
  reason: 'count' | 'dispatch' | 'shipment' | 'created' | 'zoho';
  note: string;
  customer: string;
  trackingNumber: string;
  shipmentId: string | null;
  userName: string;
  createdAt: string;
}

export interface ZohoStatus {
  configured: boolean;
  connected: boolean;
  needsOrganization: boolean;
  dataCenter: string;
  redirectUri: string;
  organizationId: string;
  organizationName: string;
  organizations: { id: string; name: string }[];
  connectedAt: string | null;
  connectedBy: string;
  autoCreate: boolean;
  autoCategory: string;
  syncSchedule: string;
  webhookUrl: string | null;
  lastWebhookAt: string | null;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string;
  lastSyncSummary: { zohoItems: number; linked: number; created: number; stockIn: number; stockOut: number };
  linkedItems: number;
}

export interface StockCountChange {
  itemId: string;
  quantity: number;
  oldQuantity?: number;
}

export interface StockItemInput {
  name?: string;
  size?: string;
  categoryId?: string;
  quantity?: number;
  oldQuantity?: number | null;
  splitOldNew?: boolean;
  note?: string;
  internalNote?: string;
  expiryDates?: string[];
  lowStockAt?: number | null;
  productCode?: string;
}

export interface PublicStock {
  updatedAt: string;
  message: string;
  categories: {
    id: string;
    name: string;
    listStyle: ListStyle;
    items: {
      id: string;
      name: string;
      size: string;
      quantity: number;
      oldQuantity: number | null;
      note: string;
      expiryDates: string[];
    }[];
  }[];
}
