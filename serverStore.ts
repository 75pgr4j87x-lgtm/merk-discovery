import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { OutboxEntry, StoredSubmission } from './serverEmailAndExcel.js';

const SUBMISSIONS_COLLECTION = 'studioSubmissions';
const OUTBOX_COLLECTION = 'emailOutbox';
const PROJECTS_COLLECTION = 'studioProjects';
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