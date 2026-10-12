export type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';

export interface Checkpoint {
  status: ShipmentStatus;
  statusRaw: string;
  location: string;
  description: string;
  checkpointTime: string;
  source: string;
}

export interface ProductDetails {
  name: string;
  sku: string;
  quantity: number;
  category: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface ExceptionNote {
  text: string;
  authorName: string;
  createdAt: string;
}

export interface ExceptionFollowUp {
  isBeingFollowedUp: boolean;
  notes: ExceptionNote[];
}

export interface DeliveryAddress {
  line: string;
  city: string;
  state: string;
  pincode: string;
}

/** What the courier reports about the route - city/state level only. */
export interface CarrierRoute {
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  pickupAt: string | null;
  deliveredAt: string | null;
  fetchedAt: string | null;
}

export interface ShipmentBooking {
  invoiceNumber: string;
  shipmentValue: number | null;
  boxes: number | null;
  dimensions: string;
  shipmentType: string;
  paymentType: string;
  pickupPincode: string;
  trackingLink: string;
  notes: string;
  source: string;
}

export interface Shipment {
  _id: string;
  trackingNumber: string;
  carrierCode: string;
  carrierName: string;
  trackingMoreId: string;
  productDetails: ProductDetails;
  customerInfo: CustomerInfo;
  shippingDate?: string;
  estimatedDelivery?: string;
  weightKg?: number | null;
  freightAmount?: number | null;
  deliveryAddress?: DeliveryAddress;
  carrierRoute?: CarrierRoute;
  status: ShipmentStatus;
  /** The Zoho Books invoice it was matched to (freight / e-way bill source). */
  zohoInvoice?: { invoiceId: string; number: string; matchedBy: string };
  /** GST e-way bill for the consignment. */
  ewayBill?: { number: string; generatedAt: string | null; validUntil: string | null };
  /** Booking details from the logistics master sheet. */
  booking?: ShipmentBooking;
  /** When it was actually delivered (from the courier's delivered scan). */
  deliveredAt?: string | null;
  currentLocation: string;
  checkpoints: Checkpoint[];
  exceptionFollowUp: ExceptionFollowUp;
  lastCheckedAt?: string;
  isArchived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What an edit sends: any shipment field, and only the booking fields being changed. */
export type ShipmentUpdate = Partial<Omit<Shipment, 'booking'>> & { booking?: Partial<ShipmentBooking>; isBeingFollowedUp?: boolean };

/** A courier from TrackingMore's catalog. */
export interface Carrier {
  code: string;
  name: string;
  /** ISO-2 country, e.g. "IN". */
  country: string;
  logo: string;
  url: string;
  phone: string;
  /** Extra details the courier needs to track, e.g. "tracking_postal_code". */
  requiredFields: string[];
}

export interface CreateShipmentInput {
  trackingNumber: string;
  /** Any TrackingMore courier code; omitted -> the default courier. */
  carrierCode?: string;
  productDetails?: Partial<ProductDetails>;
  customerInfo?: Partial<CustomerInfo>;
  shippingDate?: string;
  estimatedDelivery?: string;
  weightKg?: number | null;
  freightAmount?: number | null;
  deliveryAddress?: Partial<DeliveryAddress>;
  /** Only for the few couriers that need more than the AWB to track. */
  trackingExtras?: { postalCode?: string; trackingKey?: string; accountNumber?: string };
  ewayBill?: { number: string; generatedAt?: string | null; validUntil?: string | null };
}

export type LabelField =
  | 'trackingNumber'
  | 'courier'
  | 'customerName'
  | 'customerPhone'
  | 'customerEmail'
  | 'address'
  | 'pincode'
  | 'productName'
  | 'quantity'
  | 'weightKg'
  | 'freightAmount'
  | 'shippingDate'
  | 'estimatedDelivery';

/** What the label reader found on a photo - a draft for the Add shipment form. */
export interface LabelDraft {
  trackingNumber: string;
  carrierCode: string;
  carrierName: string;
  printedCourierName: string;
  customerInfo: { name: string; phone: string; email: string };
  deliveryAddress: DeliveryAddress;
  productDetails: { name: string; quantity: number | null; sku: string };
  weightKg: number | null;
  freightAmount: number | null;
  shippingDate: string;
  estimatedDelivery: string;
  uncertainFields: LabelField[];
  notes: string;
  stockMatch: { name: string; productCode: string } | null;
  ewayBill?: { number: string; generatedAt: string; validUntil: string };
  existingShipmentId: string | null;
}

export interface BulkImportResult {
  imported: number;
  failed: { row: number; trackingNumber: string; error: string }[];
  totalRows: number;
  expectedColumns: string[];
}

export interface PublicTracking {
  trackingNumber: string;
  carrierName: string;
  status: ShipmentStatus;
  currentLocation: string;
  shippingDate?: string;
  estimatedDelivery?: string;
  deliveredAt?: string | null;
  lastCheckedAt?: string;
  productName: string;
  checkpoints: Pick<Checkpoint, 'status' | 'location' | 'description' | 'checkpointTime'>[];
}
