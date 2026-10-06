import { differenceInCalendarDays } from 'date-fns';
import type { Shipment } from '../types/shipment';

export type Urgency = 'late' | 'today' | 'tomorrow' | 'none';

/**
 * Delivery urgency relative to the promised ETA. A shipment is only "late" once the
 * whole promised day has passed - couriers deliver until evening, so flagging at
 * 00:01 on the ETA date would cry wolf on every in-flight shipment.
 */
export function getUrgency(shipment: Shipment): Urgency {
  if (shipment.status === 'delivered' || !shipment.estimatedDelivery) return 'none';

  const daysOut = differenceInCalendarDays(new Date(shipment.estimatedDelivery), new Date());
  if (daysOut < 0) return 'late';
  if (daysOut === 0) return 'today';
  if (daysOut === 1) return 'tomorrow';
  return 'none';
}

export function daysLate(shipment: Shipment): number {
  if (!shipment.estimatedDelivery) return 0;
  return Math.max(0, -differenceInCalendarDays(new Date(shipment.estimatedDelivery), new Date()));
}

/**
 * The triage rule: an unworked exception, or a shipment that has blown its ETA.
 * Exceptions someone has already claimed ("being followed up") drop out - they're
 * handled, and leaving them in the band trains people to ignore it.
 */
export function needsAttention(shipment: Shipment): boolean {
  if (shipment.status === 'exception' && !shipment.exceptionFollowUp?.isBeingFollowedUp) return true;
  return getUrgency(shipment) === 'late';
}

export function attentionReason(shipment: Shipment): string {
  if (shipment.status === 'exception' && !shipment.exceptionFollowUp?.isBeingFollowedUp) {
    const latest = shipment.checkpoints?.[shipment.checkpoints.length - 1];
    return latest?.description || 'Exception - needs follow-up';
  }
  const late = daysLate(shipment);
  return `${late} day${late === 1 ? '' : 's'} past promised delivery`;
}
