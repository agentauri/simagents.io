/**
 * Employment System queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/employment.ts`.
 *
 * CRUD operations for job offers and employments backed by the in-memory
 * store. Supports the employer/worker economic
 * system.
 */

import { v4 as uuid } from 'uuid';
import type {
  JobOffer,
  NewJobOffer,
  Employment,
  NewEmployment,
} from '../../db/schema';
import { store } from '../store';

// =============================================================================
// JOB OFFERS
// =============================================================================

/**
 * Create a new job offer
 */
export async function createJobOffer(offer: NewJobOffer): Promise<JobOffer> {
  const now = new Date();
  const created: JobOffer = {
    id: offer.id ?? uuid(),
    tenantId: offer.tenantId ?? null,
    employerId: offer.employerId,
    salary: offer.salary,
    duration: offer.duration,
    paymentType: offer.paymentType,
    escrowAmount: offer.escrowAmount ?? 0,
    description: offer.description ?? null,
    status: offer.status ?? 'open',
    x: offer.x,
    y: offer.y,
    createdAtTick: offer.createdAtTick,
    expiresAtTick: offer.expiresAtTick ?? null,
    createdAt: offer.createdAt ?? now,
    updatedAt: offer.updatedAt ?? now,
  };
  store.jobOffers.set(created.id, created);
  return created;
}

/**
 * Get job offer by ID
 */
export async function getJobOfferById(id: string): Promise<JobOffer | undefined> {
  return store.jobOffers.get(id);
}

/**
 * Get all open job offers near a position (within visibility radius)
 */
export async function getOpenJobOffersNearPosition(
  x: number,
  y: number,
  radius: number,
  currentTick: number
): Promise<JobOffer[]> {
  // Get all open, non-expired offers, then filter by Manhattan distance.
  return [...store.jobOffers.values()].filter((offer) => {
    if (offer.status !== 'open') return false;
    if (offer.expiresAtTick !== null && offer.expiresAtTick < currentTick) return false;
    const distance = Math.abs(offer.x - x) + Math.abs(offer.y - y);
    return distance <= radius;
  });
}

/**
 * Get all open job offers by employer
 */
export async function getOpenJobOffersByEmployer(employerId: string): Promise<JobOffer[]> {
  return [...store.jobOffers.values()].filter(
    (offer) => offer.employerId === employerId && offer.status === 'open'
  );
}

/**
 * Update job offer status
 */
export async function updateJobOfferStatus(
  id: string,
  status: 'open' | 'accepted' | 'cancelled' | 'expired'
): Promise<void> {
  const offer = store.jobOffers.get(id);
  if (!offer) return;
  store.jobOffers.set(id, { ...offer, status, updatedAt: new Date() });
}

/**
 * Expire all offers past their expiration tick
 */
export async function expireJobOffers(currentTick: number): Promise<number> {
  const offersToExpire = [...store.jobOffers.values()].filter(
    (offer) =>
      offer.status === 'open' &&
      offer.expiresAtTick !== null &&
      offer.expiresAtTick <= currentTick
  );

  if (offersToExpire.length === 0) {
    return 0;
  }

  for (const offer of offersToExpire) {
    store.jobOffers.set(offer.id, { ...offer, status: 'expired', updatedAt: new Date() });
  }

  return offersToExpire.length;
}

// =============================================================================
// EMPLOYMENTS
// =============================================================================

/**
 * Create a new employment contract
 */
export async function createEmployment(employment: NewEmployment): Promise<Employment> {
  const now = new Date();
  const created: Employment = {
    id: employment.id ?? uuid(),
    tenantId: employment.tenantId ?? null,
    jobOfferId: employment.jobOfferId,
    employerId: employment.employerId,
    workerId: employment.workerId,
    salary: employment.salary,
    paymentType: employment.paymentType,
    escrowAmount: employment.escrowAmount ?? 0,
    ticksRequired: employment.ticksRequired,
    ticksWorked: employment.ticksWorked ?? 0,
    amountPaid: employment.amountPaid ?? 0,
    status: employment.status ?? 'active',
    startedAtTick: employment.startedAtTick,
    endedAtTick: employment.endedAtTick ?? null,
    createdAt: employment.createdAt ?? now,
    updatedAt: employment.updatedAt ?? now,
  };
  store.employments.set(created.id, created);
  return created;
}

/**
 * Get employment by ID
 */
export async function getEmploymentById(id: string): Promise<Employment | undefined> {
  return store.employments.get(id);
}

/**
 * Get active employments for a worker
 */
export async function getActiveEmploymentsForWorker(workerId: string): Promise<Employment[]> {
  return [...store.employments.values()].filter(
    (e) => e.workerId === workerId && e.status === 'active'
  );
}

/**
 * Get active employments for an employer
 */
export async function getActiveEmploymentsForEmployer(employerId: string): Promise<Employment[]> {
  return [...store.employments.values()].filter(
    (e) => e.employerId === employerId && e.status === 'active'
  );
}

/**
 * Get the oldest active employment for a worker (for work tick attribution)
 */
export async function getOldestActiveEmployment(workerId: string): Promise<Employment | undefined> {
  return [...store.employments.values()]
    .filter((e) => e.workerId === workerId && e.status === 'active')
    .sort((a, b) => a.startedAtTick - b.startedAtTick)[0];
}

/**
 * Increment ticks worked and handle per-tick payment
 */
export async function incrementTicksWorked(
  employmentId: string,
  paymentAmount: number = 0
): Promise<Employment> {
  const employment = store.employments.get(employmentId);
  // Mirror the DB version which fetches the (now-updated) record at the end.
  // If it doesn't exist, this returns undefined just like the DB select would.
  if (!employment) return employment as unknown as Employment;

  const updated: Employment = {
    ...employment,
    ticksWorked: employment.ticksWorked + 1,
    amountPaid: employment.amountPaid + paymentAmount,
    updatedAt: new Date(),
  };
  store.employments.set(employmentId, updated);
  return updated;
}

/**
 * Update employment status
 */
export async function updateEmploymentStatus(
  id: string,
  status: 'active' | 'completed' | 'abandoned' | 'unpaid' | 'fired',
  endedAtTick?: number
): Promise<void> {
  const employment = store.employments.get(id);
  if (!employment) return;
  store.employments.set(id, {
    ...employment,
    status,
    endedAtTick: endedAtTick ?? null,
    updatedAt: new Date(),
  });
}

/**
 * Mark employment as completed and update final payment
 */
export async function completeEmployment(
  id: string,
  finalPayment: number,
  endedAtTick: number
): Promise<void> {
  const employment = store.employments.get(id);
  if (!employment) return;
  store.employments.set(id, {
    ...employment,
    status: 'completed',
    amountPaid: employment.amountPaid + finalPayment,
    endedAtTick,
    updatedAt: new Date(),
  });
}

export async function updateEmploymentStatusAndPayment(
  id: string,
  status: 'active' | 'completed' | 'abandoned' | 'unpaid' | 'fired',
  amountPaid: number,
  endedAtTick?: number
): Promise<void> {
  const employment = store.employments.get(id);
  if (!employment) return;
  store.employments.set(id, {
    ...employment,
    status,
    amountPaid,
    endedAtTick: endedAtTick ?? null,
    updatedAt: new Date(),
  });
}

/**
 * Get all employments that need payment (completed but unpaid for on_completion)
 */
export async function getCompletedUnpaidEmployments(employerId: string): Promise<Employment[]> {
  return [...store.employments.values()].filter(
    (e) =>
      e.employerId === employerId &&
      e.status === 'active' &&
      e.paymentType === 'on_completion' &&
      e.ticksWorked >= e.ticksRequired
  );
}

/**
 * Get employment statistics for an agent
 */
export async function getEmploymentStats(agentId: string): Promise<{
  asWorker: { active: number; completed: number; abandoned: number; totalEarned: number };
  asEmployer: { active: number; completed: number; unpaid: number; totalPaid: number };
}> {
  // Worker stats
  const workerEmployments = [...store.employments.values()].filter((e) => e.workerId === agentId);

  const workerStats = {
    active: workerEmployments.filter((e) => e.status === 'active').length,
    completed: workerEmployments.filter((e) => e.status === 'completed').length,
    abandoned: workerEmployments.filter((e) => e.status === 'abandoned').length,
    totalEarned: workerEmployments.reduce((sum, e) => sum + e.amountPaid, 0),
  };

  // Employer stats
  const employerEmployments = [...store.employments.values()].filter(
    (e) => e.employerId === agentId
  );

  const employerStats = {
    active: employerEmployments.filter((e) => e.status === 'active').length,
    completed: employerEmployments.filter((e) => e.status === 'completed').length,
    unpaid: employerEmployments.filter((e) => e.status === 'unpaid').length,
    totalPaid: employerEmployments.reduce((sum, e) => sum + e.amountPaid, 0),
  };

  return { asWorker: workerStats, asEmployer: employerStats };
}

// =============================================================================
// COMBINED QUERIES
// =============================================================================

/**
 * Get full employment context for an agent (for LLM prompt)
 */
export async function getAgentEmploymentContext(agentId: string): Promise<{
  activeEmployments: Employment[];
  pendingPayments: Employment[];
  openOffers: JobOffer[];
}> {
  const [activeEmployments, pendingPayments, openOffers] = await Promise.all([
    getActiveEmploymentsForWorker(agentId),
    getCompletedUnpaidEmployments(agentId),
    getOpenJobOffersByEmployer(agentId),
  ]);

  return { activeEmployments, pendingPayments, openOffers };
}
