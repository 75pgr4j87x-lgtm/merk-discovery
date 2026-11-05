import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import type { OutboxEntry, StoredSubmission } from './serverEmailAndExcel.js';

const SUBMISSIONS_COLLECTION = 'studioSubmissions';
const OUTBOX_COLLECTION = 'emailOutbox';
const PROJECTS_COLLECTION = 'studioProjects';
const STUDIO_INVITES_COLLECTION = 'studioInvites';
const FIRESTORE_BATCH_LIMIT = 450;

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  priority: 'Severe' | 'High' | 'Medium' | 'Low';
  estimatedEffortDays: number;
  amount: number;
}

export interface ProjectComment {
  id: string;
  taskId?: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface StudioProject {
  submissionId: string;
  title: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  brandColors: string[];
  shareTokenHash: string;
  columns: string[];
  tasks: ProjectTask[];
  comments: ProjectComment[];
  invoiceNumber: string;
  invoiceDueDate: string;
  currency: string;
  projectCharge: number;
  discountPercent: number;
  projectStartDate: string;
  projectEndDate: string;
  invoiceNotes: string;
  updatedAt: string;
}

export interface StudioInvite {
  email: string;
  role: 'admin' | 'project_manager' | 'viewer';
  invitedBy: string;
  createdAt: string;
}

export type BetaDeskStatus =
  | 'Open'
  | 'Under Review'
  | 'In Progress'
  | 'Awaiting User Response'
  | 'Resolved'
  | 'Closed';

export type BetaDeskPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type BetaDeskCategory =
  | 'Bug Report'
  | 'Feature Request'
  | 'General Feedback'
  | 'UI/UX Improvement'
  | 'Technical Issue'
  | 'Other';

export interface BetaDeskTicket {
  id: string;
  ticketNumber: string;
  projectId: string;
  testerId: string;
  subject: string;
  description: string;
  category: BetaDeskCategory;
  priority: BetaDeskPriority;
  status: BetaDeskStatus;
  submitterName: string;
  platform: string;
  appVersion: string;
  deviceModel: string;
  operatingSystem: string;
  attachments: BetaDeskAttachment[];
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface BetaDeskProject {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface BetaDeskAttachment {
  uploadId: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface BetaDeskUploadGrant {
  uploadId: string;
  testerId: string;
  objectPath: string;
  fileName: string;
  contentType: string;
  maxSize: number;
  createdAt: string;
  usedByTicket?: string;
}

export interface BetaDeskComment {
  id: string;
  authorType: 'tester' | 'admin';
  authorName: string;
  message: string;
  visibility: 'public' | 'internal';
  createdAt: string;
}

export interface BetaDeskNotification {
  id: string;
  ticketNumber: string;
  recipient: string;
  notificationType: 'admin_new_ticket';
  deliveryStatus: 'sent' | 'recorded' | 'failed';
  createdAt: string;
  errorMessage?: string;
}

export interface BetaDeskTester {
  id: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  claimedAt?: string;
}

let firebaseApp: App | undefined;

export function getFirebaseApp(): App {
  if (!firebaseApp) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    firebaseApp = getApps()[0] || initializeApp({
      credential: serviceAccount
        ? cert(JSON.parse(serviceAccount))
        : applicationDefault(),
    });
  }
  return firebaseApp;
}

export function getStudioAuth() {
  return getAuth(getFirebaseApp());
}

function getSubmissionsCollection() {
  return getFirestore(getFirebaseApp()).collection(SUBMISSIONS_COLLECTION);
}

function getOutboxCollection() {
  return getFirestore(getFirebaseApp()).collection(OUTBOX_COLLECTION);
}

function getProjectsCollection() {
  return getFirestore(getFirebaseApp()).collection(PROJECTS_COLLECTION);
}

function getStudioInvitesCollection() {
  return getFirestore(getFirebaseApp()).collection(STUDIO_INVITES_COLLECTION);
}

function getBetaDeskTicketsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskTickets');
}

function getBetaDeskProjectsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskProjects');
}

function getBetaDeskTestersCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskTesters');
}

function getBetaDeskTesterAccessCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskTesterAccess');
}

function getBetaDeskNotificationsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskNotificationLogs');
}

function getBetaDeskRateLimitsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskRateLimits');
}

function getBetaDeskAdminsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskAdmins');
}

function getBetaDeskUploadGrantsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskUploadGrants');
}

function getBetaDeskStorageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET is not configured.');
  return getStorage(getFirebaseApp()).bucket(bucketName);
}

const betaDeskAttachmentLimits: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/gif': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'video/mp4': 50 * 1024 * 1024,
  'video/quicktime': 50 * 1024 * 1024,
  'video/webm': 50 * 1024 * 1024,
};

function isValidBetaDeskFileSignature(contentType: string, buffer: Buffer): boolean {
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/gif') return buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (contentType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (['video/mp4', 'video/quicktime'].includes(contentType)) {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (contentType === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

export async function createBetaDeskUploadGrant(
  testerId: string,
  fileName: string,
  contentType: string,
  size: number
): Promise<{ grant: BetaDeskUploadGrant; url: string; fields: Record<string, string> }> {
  const maxSize = betaDeskAttachmentLimits[contentType];
  if (!maxSize || size < 1 || size > maxSize) {
    throw new Error('Unsupported file type or size limit exceeded.');
  }

  const uploadId = randomUUID();
  const objectPath = `betaDesk/${testerId}/${uploadId}`;
  const createdAt = new Date().toISOString();
  const grant: BetaDeskUploadGrant = {
    uploadId,
    testerId,
    objectPath,
    fileName,
    contentType,
    maxSize,
    createdAt,
  };
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const file = getBetaDeskStorageBucket().file(objectPath);
  const [policy] = await file.generateSignedPostPolicyV4({
    expires: expiresAt,
    fields: {
      key: objectPath,
      'Content-Type': contentType,
      'success_action_status': '201',
      'x-goog-meta-betadesk-tester': testerId,
      'x-goog-meta-betadesk-upload': uploadId,
      'x-goog-meta-betadesk-name': encodeURIComponent(fileName),
    },
    conditions: [
      ['eq', '$key', objectPath],
      ['eq', '$Content-Type', contentType],
      ['eq', '$success_action_status', '201'],
      ['eq', '$x-goog-meta-betadesk-tester', testerId],
      ['eq', '$x-goog-meta-betadesk-upload', uploadId],
      ['eq', '$x-goog-meta-betadesk-name', encodeURIComponent(fileName)],
      ['content-length-range', 1, maxSize],
    ],
  });
  await getBetaDeskUploadGrantsCollection().doc(uploadId).create({
    ...grant,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  return { grant, url: policy.url, fields: policy.fields };
}

export async function verifyBetaDeskUploadGrant(
  testerId: string,
  uploadId: string
): Promise<BetaDeskAttachment | null> {
  const document = await getBetaDeskUploadGrantsCollection().doc(uploadId).get();
  if (!document.exists) return null;
  const grant = document.data() as BetaDeskUploadGrant & { expiresAt: string };
  if (
    grant.testerId !== testerId
    || grant.usedByTicket
    || Date.parse(grant.expiresAt) <= Date.now()
  ) return null;

  const file = getBetaDeskStorageBucket().file(grant.objectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  const custom = metadata.metadata || {};
  if (
    size < 1
    || size > grant.maxSize
    || metadata.contentType !== grant.contentType
    ||     custom['betadesk-tester'] !== testerId
    || custom['betadesk-upload'] !== uploadId
    || custom['betadesk-name'] !== encodeURIComponent(grant.fileName)
  ) return null;
  const [signature] = await file.download({ start: 0, end: 31 });
  if (!isValidBetaDeskFileSignature(grant.contentType, signature)) return null;

  return {
    uploadId,
    fileName: grant.fileName,
    contentType: grant.contentType,
    size,
  };
}

export async function getBetaDeskAttachmentUrl(
  testerId: string,
  ticketNumber: string,
  uploadId: string
): Promise<string | null> {
  const ticket = await loadBetaDeskTicket(ticketNumber);
  if (!ticket || ticket.testerId !== testerId || !ticket.attachments.some((item) => item.uploadId === uploadId)) {
    return null;
  }
  const document = await getBetaDeskUploadGrantsCollection().doc(uploadId).get();
  if (!document.exists) return null;
  const grant = document.data() as BetaDeskUploadGrant;
  if (grant.testerId !== testerId || grant.usedByTicket !== ticketNumber) return null;
  const [url] = await getBetaDeskStorageBucket().file(grant.objectPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000,
  });
  return url;
}

export async function saveBetaDeskAdmin(email: string, invitedBy: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await getBetaDeskAdminsCollection().doc(normalizedEmail).set({
    email: normalizedEmail,
    active: true,
    invitedBy,
    createdAt: new Date().toISOString(),
  });
}

export async function loadBetaDeskAdmin(email: string): Promise<{ email: string; active: boolean } | null> {
  const document = await getBetaDeskAdminsCollection().doc(email.trim().toLowerCase()).get();
  return document.exists ? document.data() as { email: string; active: boolean } : null;
}

export async function loadBetaDeskAdmins(): Promise<Array<{
  email: string;
  active: boolean;
  invitedBy: string;
  createdAt: string;
}>> {
  const snapshot = await getBetaDeskAdminsCollection().orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((document) => document.data() as {
    email: string;
    active: boolean;
    invitedBy: string;
    createdAt: string;
  });
}

export async function removeBetaDeskAdmin(email: string): Promise<void> {
  await getBetaDeskAdminsCollection().doc(email.trim().toLowerCase()).delete();
}

export async function createBetaDeskProject(
  name: string,
  description: string,
  createdBy: string,
  id: string = randomUUID()
): Promise<BetaDeskProject> {
  const project: BetaDeskProject = {
    id,
    name,
    description,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  await getBetaDeskProjectsCollection().doc(id).create(project);
  return project;
}

export async function loadBetaDeskProjects(): Promise<BetaDeskProject[]> {
  const collection = getBetaDeskProjectsCollection();
  const snapshot = await collection.orderBy('createdAt', 'asc').get();
  if (snapshot.empty) {
    await createBetaDeskProject(
      'Legacy / Unassigned Tickets',
      'Existing tickets created before project tracking was enabled.',
      'system',
      'legacy'
    );
    return loadBetaDeskProjects();
  }

  const legacyProject = snapshot.docs.find((document) => document.id === 'legacy');
  if (legacyProject) {
    const tickets = await getBetaDeskTicketsCollection().get();
    const unassigned = tickets.docs.filter((document) => !document.data().projectId);
    for (let offset = 0; offset < unassigned.length; offset += FIRESTORE_BATCH_LIMIT) {
      const batch = getFirestore(getFirebaseApp()).batch();
      for (const ticket of unassigned.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
        batch.update(ticket.ref, { projectId: 'legacy' });
      }
      await batch.commit();
    }
  }
  return snapshot.docs.map((document) => document.data() as BetaDeskProject);
}

export async function loadBetaDeskProject(projectId: string): Promise<BetaDeskProject | null> {
  const document = await getBetaDeskProjectsCollection().doc(projectId).get();
  return document.exists ? document.data() as BetaDeskProject : null;
}

export async function hasStudioInvite(email: string): Promise<boolean> {
  const document = await getStudioInvitesCollection().doc(email.trim().toLowerCase()).get();
  return document.exists;
}

export async function loadStudioInvite(email: string): Promise<StudioInvite | null> {
  const document = await getStudioInvitesCollection().doc(email.trim().toLowerCase()).get();
  if (!document.exists) return null;
  const invite = document.data() as StudioInvite;
  return {
    ...invite,
    role: ['admin', 'project_manager', 'viewer'].includes(invite.role) ? invite.role : 'project_manager',
  };
}

export async function loadStudioInvites(): Promise<StudioInvite[]> {
  const snapshot = await getStudioInvitesCollection().get();
  return snapshot.docs
    .map((document) => document.data() as StudioInvite)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function saveStudioInvite(invite: StudioInvite): Promise<void> {
  await getStudioInvitesCollection().doc(invite.email.trim().toLowerCase()).set(invite);
}

export async function deleteStudioInvite(email: string): Promise<void> {
  await getStudioInvitesCollection().doc(email.trim().toLowerCase()).delete();
}

export async function loadStudioProject(id: string): Promise<StudioProject | null> {
  const document = await getProjectsCollection().doc(id).get();
  return document.exists ? document.data() as StudioProject : null;
}

export async function saveStudioProject(project: StudioProject): Promise<void> {
  await getProjectsCollection().doc(project.submissionId).set(project);
}

export async function findProjectByShareTokenHash(tokenHash: string): Promise<StudioProject | null> {
  const snapshot = await getProjectsCollection()
    .where('shareTokenHash', '==', tokenHash)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0].data() as StudioProject;
}

export async function loadSubmissions(): Promise<StoredSubmission[]> {
  const snapshot = await getSubmissionsCollection().get();
  return snapshot.docs
    .map((document) => document.data() as StoredSubmission)
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

export async function saveSubmission(submission: StoredSubmission): Promise<void> {
  await getSubmissionsCollection().doc(submission.id).set(submission);
}

export async function deleteSubmission(id: string): Promise<void> {
  await getSubmissionsCollection().doc(id).delete();
}

export async function loadOutbox(): Promise<OutboxEntry[]> {
  const snapshot = await getOutboxCollection().get();
  return snapshot.docs
    .map((document) => document.data() as OutboxEntry)
    .sort((left, right) => Date.parse(right.sentAt) - Date.parse(left.sentAt));
}

export async function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  await getOutboxCollection().doc(entry.id).set(entry);
}

export async function importJsonData(
  submissions: StoredSubmission[],
  outbox: OutboxEntry[]
): Promise<void> {
  const db = getFirestore(getFirebaseApp());
  const writes = [
    ...submissions.map((entry) => ({ ref: db.collection(SUBMISSIONS_COLLECTION).doc(entry.id), data: entry })),
    ...outbox.map((entry) => ({ ref: db.collection(OUTBOX_COLLECTION).doc(entry.id), data: entry })),
  ];

  for (let offset = 0; offset < writes.length; offset += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
      batch.set(write.ref, write.data);
    }
    await batch.commit();
  }
}

export async function purgeClientDataByEmail(clientEmail: string): Promise<{
  deletedCount: number;
  remainingCount: number;
}> {
  const normalizedEmail = clientEmail.trim().toLowerCase();
  const [submissionsSnapshot, outboxSnapshot, projectsSnapshot] = await Promise.all([
    getSubmissionsCollection().get(),
    getOutboxCollection().get(),
    getProjectsCollection().get(),
  ]);
  const matchingSubmissions = submissionsSnapshot.docs.filter(
    (document) => (document.data().clientEmail || '').trim().toLowerCase() === normalizedEmail
  );
  const matchingOutbox = outboxSnapshot.docs.filter(
    (document) => (document.data().clientEmail || '').trim().toLowerCase() === normalizedEmail
  );
  const matchingProjects = projectsSnapshot.docs.filter(
    (document) => (document.data().clientEmail || '').trim().toLowerCase() === normalizedEmail
  );
  const references = [
    ...matchingSubmissions.map((document) => document.ref),
    ...matchingOutbox.map((document) => document.ref),
    ...matchingProjects.map((document) => document.ref),
  ];
  const db = getFirestore(getFirebaseApp());

  for (let offset = 0; offset < references.length; offset += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const reference of references.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(reference);
    }
    await batch.commit();
  }

  return {
    deletedCount: matchingSubmissions.length,
    remainingCount: submissionsSnapshot.size - matchingSubmissions.length,
  };
}

export async function createBetaDeskTicket(
  ticket: Omit<BetaDeskTicket, 'ticketNumber'>,
  idempotencyKey: string
): Promise<{ ticket: BetaDeskTicket; duplicate: boolean }> {
  const db = getFirestore(getFirebaseApp());
  const counterRef = db.collection('systemCounters').doc('betaDeskTickets');
  const idempotencyRef = db.collection('betaDeskIdempotency').doc(idempotencyKey);

  return db.runTransaction(async (transaction) => {
    const idempotencySnapshot = await transaction.get(idempotencyRef);

    if (idempotencySnapshot.exists) {
      const existingId = idempotencySnapshot.get('ticketId') as string;
      const existingRef = getBetaDeskTicketsCollection().doc(existingId);
      const existingSnapshot = await transaction.get(existingRef);
      if (existingSnapshot.exists) {
        const existingTicket = existingSnapshot.data() as BetaDeskTicket;
        if (existingTicket.testerId !== ticket.testerId) {
          throw new Error('Idempotency key cannot be reused for a different tester.');
        }
        return { ticket: existingTicket, duplicate: true };
      }
    }

    const counterSnapshot = await transaction.get(counterRef);
    const nextNumber = Number(counterSnapshot.get('currentNumber') || 1000) + 1;
    const ticketNumber = `BETA-${nextNumber}`;
    const ticketRef = getBetaDeskTicketsCollection().doc(ticketNumber);
    const createdTicket: BetaDeskTicket = { ...ticket, id: ticketNumber, ticketNumber };
    const now = new Date().toISOString();
    const uploadRefs = ticket.attachments.map((attachment) => getBetaDeskUploadGrantsCollection().doc(attachment.uploadId));
    const uploadSnapshots = await Promise.all(uploadRefs.map((reference) => transaction.get(reference)));
    if (uploadSnapshots.some((snapshot) => {
      if (!snapshot.exists) return true;
      const grant = snapshot.data() as BetaDeskUploadGrant & { expiresAt: string };
      return grant.testerId !== ticket.testerId
        || grant.usedByTicket !== undefined
        || Date.parse(grant.expiresAt) <= Date.now();
    })) {
      throw new Error('One or more attachments are invalid, expired, or already used.');
    }

    transaction.set(counterRef, { currentNumber: nextNumber, updatedAt: now });
    transaction.set(ticketRef, createdTicket);
    transaction.set(idempotencyRef, {
      ticketId: ticketNumber,
      createdAt: now,
    });
    for (const reference of uploadRefs) {
      transaction.update(reference, { usedByTicket: ticketNumber });
    }

    return { ticket: createdTicket, duplicate: false };
  });
}

export async function createBetaDeskTester(tokenHash: string): Promise<BetaDeskTester> {
  const db = getFirestore(getFirebaseApp());
  const accessRef = getBetaDeskTesterAccessCollection().doc(tokenHash);
  const tester = {
    id: randomUUID(),
    displayName: '',
    active: true,
    createdAt: new Date().toISOString(),
  };
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(accessRef);
    if (existing.exists) throw new Error('Tester access token collision.');
    transaction.set(getBetaDeskTestersCollection().doc(tester.id), tester);
    transaction.set(accessRef, { testerId: tester.id, revokedAt: null, createdAt: tester.createdAt });
  });
  return tester;
}

export async function loadBetaDeskTesterByTokenHash(tokenHash: string): Promise<BetaDeskTester | null> {
  const access = await getBetaDeskTesterAccessCollection().doc(tokenHash).get();
  if (!access.exists || access.get('revokedAt')) return null;
  const tester = await loadBetaDeskTester(access.get('testerId') as string);
  return tester?.active ? tester : null;
}

export async function loadBetaDeskTester(testerId: string): Promise<BetaDeskTester | null> {
  const document = await getBetaDeskTestersCollection().doc(testerId).get();
  return document.exists ? document.data() as BetaDeskTester : null;
}

export async function loadBetaDeskTesters(): Promise<BetaDeskTester[]> {
  const snapshot = await getBetaDeskTestersCollection().orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((document) => document.data() as BetaDeskTester);
}

export async function claimBetaDeskTesterName(
  testerId: string,
  displayName: string
): Promise<BetaDeskTester | null> {
  const db = getFirestore(getFirebaseApp());
  const ref = getBetaDeskTestersCollection().doc(testerId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const tester = snapshot.data() as BetaDeskTester;
    if (!tester.active) return null;
    if (tester.displayName) return tester;
    const claimedTester = { ...tester, displayName, claimedAt: new Date().toISOString() };
    transaction.set(ref, claimedTester);
    return claimedTester;
  });
}

export async function loadBetaDeskTicketsForTester(testerId: string): Promise<BetaDeskTicket[]> {
  const snapshot = await getBetaDeskTicketsCollection().where('testerId', '==', testerId).get();
  return snapshot.docs
    .map((document) => document.data() as BetaDeskTicket)
    .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt));
}

export async function revokeBetaDeskTester(testerId: string): Promise<boolean> {
  const db = getFirestore(getFirebaseApp());
  const testerRef = getBetaDeskTestersCollection().doc(testerId);
  const accessSnapshot = await getBetaDeskTesterAccessCollection().where('testerId', '==', testerId).get();
  if (accessSnapshot.empty) return false;
  const now = new Date().toISOString();
  for (let offset = 0; offset < accessSnapshot.docs.length; offset += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    if (offset === 0) batch.update(testerRef, { active: false, revokedAt: now });
    for (const document of accessSnapshot.docs.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
      batch.update(document.ref, { revokedAt: now });
    }
    await batch.commit();
  }
  return true;
}

export async function loadBetaDeskTickets(): Promise<BetaDeskTicket[]> {
  const snapshot = await getBetaDeskTicketsCollection().get();
  return snapshot.docs
    .map((document) => document.data() as BetaDeskTicket)
    .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt));
}

export async function loadBetaDeskTicket(ticketNumber: string): Promise<BetaDeskTicket | null> {
  const document = await getBetaDeskTicketsCollection().doc(ticketNumber).get();
  return document.exists ? document.data() as BetaDeskTicket : null;
}

export async function loadBetaDeskComments(
  ticketNumber: string,
  includeInternal: boolean
): Promise<BetaDeskComment[]> {
  const snapshot = await getBetaDeskTicketsCollection()
    .doc(ticketNumber)
    .collection('comments')
    .orderBy('createdAt', 'asc')
    .get();
  return snapshot.docs
    .map((document) => document.data() as BetaDeskComment)
    .filter((comment) => includeInternal || comment.visibility === 'public');
}

export async function addBetaDeskComment(
  ticketNumber: string,
  comment: Omit<BetaDeskComment, 'id' | 'createdAt'>
): Promise<BetaDeskComment | null> {
  const db = getFirestore(getFirebaseApp());
  const ticketRef = getBetaDeskTicketsCollection().doc(ticketNumber);
  const commentRef = ticketRef.collection('comments').doc(randomUUID());
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const ticketSnapshot = await transaction.get(ticketRef);
    if (!ticketSnapshot.exists) return null;

    const storedComment: BetaDeskComment = { ...comment, id: commentRef.id, createdAt: now };
    transaction.set(commentRef, storedComment);
    transaction.update(ticketRef, { updatedAt: now, lastActivityAt: now });
    return storedComment;
  });
}

export async function updateBetaDeskTicket(
  ticketNumber: string,
  changes: Partial<Pick<BetaDeskTicket, 'status' | 'priority' | 'assignedTo' | 'projectId'>>,
  actor: string
): Promise<BetaDeskTicket | null> {
  const db = getFirestore(getFirebaseApp());
  const ticketRef = getBetaDeskTicketsCollection().doc(ticketNumber);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const ticketSnapshot = await transaction.get(ticketRef);
    if (!ticketSnapshot.exists) return null;

    const previous = ticketSnapshot.data() as BetaDeskTicket;
    const next: BetaDeskTicket = {
      ...previous,
      ...changes,
      updatedAt: now,
      lastActivityAt: now,
    };
    if (changes.status === 'Resolved' && previous.status !== 'Resolved') next.resolvedAt = now;
    if (changes.status === 'Closed' && previous.status !== 'Closed') next.closedAt = now;
    if (changes.status && changes.status !== 'Resolved') delete next.resolvedAt;
    if (changes.status && changes.status !== 'Closed') delete next.closedAt;

    const logRef = ticketRef.collection('activityLogs').doc(randomUUID());
    transaction.set(ticketRef, next);
    for (const [field, newValue] of Object.entries(changes)) {
      const oldValue = previous[field as keyof BetaDeskTicket];
      if (oldValue === newValue) continue;
      transaction.set(ticketRef.collection('activityLogs').doc(`${logRef.id}_${field}`), {
        action: field,
        previousValue: oldValue || '',
        newValue: newValue || '',
        performedBy: actor,
        performedByType: 'admin',
        createdAt: now,
      });
    }
    return next;
  });
}

export async function consumeBetaDeskRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const db = getFirestore(getFirebaseApp());
  const ref = getBetaDeskRateLimitsCollection().doc(key);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const existing = snapshot.exists
      ? snapshot.data() as { windowStartedAt: number; count: number }
      : null;
    if (!existing || now - existing.windowStartedAt >= windowMs) {
      transaction.set(ref, { windowStartedAt: now, count: 1 });
      return true;
    }
    if (existing.count >= limit) return false;
    transaction.update(ref, { count: existing.count + 1 });
    return true;
  });
}

export async function saveBetaDeskNotification(notification: BetaDeskNotification): Promise<void> {
  await getBetaDeskNotificationsCollection().doc(notification.id).set(notification);
}