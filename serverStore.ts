import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
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
  driveOwnerEmail: string;
  fileName: string;
  contentType: string;
  maxSize: number;
  createdAt: string;
  fileId?: string;
  uploadedAt?: string;
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

function getBetaDeskDriveConnectionsCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskDriveConnections');
}

function getBetaDeskDriveOAuthStatesCollection() {
  return getFirestore(getFirebaseApp()).collection('betaDeskDriveOAuthStates');
}

const BETA_DESK_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BETA_DESK_ATTACHMENT_CHUNK_SIZE = 4 * 1024 * 1024;
const BETA_DESK_DRIVE_FOLDER_NAME = 'BetaDesk Attachments';

interface BetaDeskDriveConnection {
  email: string;
  folderId: string;
  encryptedRefreshToken: string;
  connectedAt: string;
}

function getBetaDeskOAuthClient(): OAuth2Client {
  const clientId = process.env.BETADESK_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.BETADESK_GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.BETADESK_GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('BetaDesk Google Drive OAuth is not configured.');
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

function getBetaDeskTokenEncryptionKey(): Buffer {
  const encodedKey = process.env.BETADESK_OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error('BETADESK_OAUTH_TOKEN_ENCRYPTION_KEY is not configured.');
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('BETADESK_OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

function encryptBetaDeskToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getBetaDeskTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptBetaDeskToken(value: string): string {
  const [encodedIv, encodedTag, encodedData] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedData) throw new Error('Stored BetaDesk Drive credential is invalid.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getBetaDeskTokenEncryptionKey(),
    Buffer.from(encodedIv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export async function saveBetaDeskDriveOAuthState(
  state: string,
  email: string,
  initiatedByUid: string
): Promise<void> {
  await getBetaDeskDriveOAuthStatesCollection().doc(state).create({
    email: email.trim().toLowerCase(),
    initiatedByUid,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
}

export async function consumeBetaDeskDriveOAuthState(state: string): Promise<{
  email: string;
  initiatedByUid: string;
} | null> {
  const stateRef = getBetaDeskDriveOAuthStatesCollection().doc(state);
  return getFirestore(getFirebaseApp()).runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data() as { email: string; initiatedByUid: string; expiresAt: string };
    transaction.delete(stateRef);
    if (Date.parse(data.expiresAt) <= Date.now()) return null;
    return { email: data.email, initiatedByUid: data.initiatedByUid };
  });
}

export async function createBetaDeskDriveAuthorizationUrl(
  email: string,
  initiatedByUid: string
): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  await saveBetaDeskDriveOAuthState(state, email, initiatedByUid);
  return getBetaDeskOAuthClient().generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: [BETA_DESK_DRIVE_SCOPE, 'openid', 'email'],
    state,
  });
}

export async function completeBetaDeskDriveAuthorization(
  code: string,
  state: string,
  expectedOwnerEmail: string
): Promise<{ email: string; folderName: string }> {
  const oauthState = await consumeBetaDeskDriveOAuthState(state);
  if (!oauthState) throw new Error('This Google Drive authorization request expired. Start again from BetaDesk.');
  const expectedEmail = expectedOwnerEmail.trim().toLowerCase();
  if (!expectedEmail || oauthState.email !== expectedEmail) {
    throw new Error('The Studio Super Admin changed during authorization. Start again from Studio.');
  }

  const oauth = getBetaDeskOAuthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.access_token) throw new Error('Google did not return an access token.');
  oauth.setCredentials(tokens);
  const profile = await oauth.request<{ email?: string; verified_email?: boolean }>({
    url: 'https://openidconnect.googleapis.com/v1/userinfo',
  });
  const email = profile.data.email?.trim().toLowerCase() || '';
  if (!email || profile.data.verified_email === false || email !== oauthState.email) {
    throw new Error('Authorize Google Drive with the Studio Super Admin account.');
  }

  const connectionRef = getBetaDeskDriveConnectionsCollection().doc(email);
  const existing = await connectionRef.get();
  const existingConnection = existing.exists ? existing.data() as BetaDeskDriveConnection : null;
  const refreshToken = tokens.refresh_token
    || (existingConnection ? decryptBetaDeskToken(existingConnection.encryptedRefreshToken) : '');
  if (!refreshToken) {
    throw new Error('Google did not provide offline Drive access. Reconnect and approve the requested permissions.');
  }

  oauth.setCredentials({ refresh_token: refreshToken });
  const folderSearch = await oauth.request<{ files?: Array<{ id: string; name: string }> }>({
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      q: `name = '${BETA_DESK_DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      pageSize: 10,
      fields: 'files(id,name)',
    },
  });
  const folder = folderSearch.data.files?.[0] || await (async () => {
    const created = await oauth.request<{ id?: string }>({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'POST',
      data: {
        name: BETA_DESK_DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { betaDeskStorageFolder: 'true' },
      },
    });
    if (!created.data.id) throw new Error('Google Drive did not return the new BetaDesk folder ID.');
    return { id: created.data.id, name: BETA_DESK_DRIVE_FOLDER_NAME };
  })();

  await connectionRef.set({
    email,
    folderId: folder.id,
    encryptedRefreshToken: encryptBetaDeskToken(refreshToken),
    connectedAt: new Date().toISOString(),
  });
  return { email, folderName: folder.name };
}

export async function loadBetaDeskDriveConnectionStatus(email: string): Promise<boolean> {
  const document = await getBetaDeskDriveConnectionsCollection().doc(email.trim().toLowerCase()).get();
  return document.exists;
}

async function loadBetaDeskDriveFolderId(email: string): Promise<string | null> {
  const document = await getBetaDeskDriveConnectionsCollection().doc(email.trim().toLowerCase()).get();
  return document.exists ? (document.data() as BetaDeskDriveConnection).folderId : null;
}

async function betaDeskDriveRequest(
  driveOwnerEmail: string,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const connectionSnapshot = await getBetaDeskDriveConnectionsCollection().doc(driveOwnerEmail.trim().toLowerCase()).get();
  if (!connectionSnapshot.exists) throw new Error('The Google Drive account for this attachment is not connected.');
  const connection = connectionSnapshot.data() as BetaDeskDriveConnection;
  const client = getBetaDeskOAuthClient();
  client.setCredentials({ refresh_token: decryptBetaDeskToken(connection.encryptedRefreshToken) });
  const accessToken = await client.getAccessToken();
  if (!accessToken.token) throw new Error('Could not authenticate with Google Drive.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken.token}`);
  return fetch(url, { ...init, headers });
}

async function betaDeskDriveError(response: Response, action: string): Promise<Error> {
  const message = (await response.text()).slice(0, 1000);
  console.error(`Google Drive ${action} failed (${response.status}):`, message);
  return new Error(`Google Drive could not ${action}. Check that the Drive API is enabled and the Studio Super Admin has connected Google Drive.`);
}

interface BetaDeskDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  parents?: string[];
  appProperties?: Record<string, string>;
}

async function loadBetaDeskDriveFile(fileId: string, driveOwnerEmail: string): Promise<BetaDeskDriveFile | null> {
  const query = new URLSearchParams({
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,size,parents,appProperties',
  });
  const response = await betaDeskDriveRequest(
    driveOwnerEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${query}`
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await betaDeskDriveError(response, 'read attachment metadata');
  return await response.json() as BetaDeskDriveFile;
}

async function downloadBetaDeskDriveRange(
  fileId: string,
  driveOwnerEmail: string,
  start: number,
  end: number,
  totalSize: number
): Promise<Buffer> {
  const response = await betaDeskDriveRequest(
    driveOwnerEmail,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Range: `bytes=${start}-${end}` } }
  );
  if (response.status !== 206) {
    if (!response.ok) throw await betaDeskDriveError(response, 'download attachment');
    throw new Error('Google Drive did not honor the requested attachment byte range.');
  }
  const contentRange = response.headers.get('content-range');
  if (contentRange !== `bytes ${start}-${end}/${totalSize}`) {
    throw new Error('Google Drive returned an unexpected attachment byte range.');
  }
  return Buffer.from(await response.arrayBuffer());
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
): Promise<{ grant: Omit<BetaDeskUploadGrant, 'driveOwnerEmail'>; uploadUrl: string }> {
  const maxSize = betaDeskAttachmentLimits[contentType];
  if (!maxSize || size < 1 || size > maxSize) {
    throw new Error('Unsupported file type or size limit exceeded.');
  }

  const driveOwnerEmail = process.env.STUDIO_OWNER_EMAIL?.trim().toLowerCase() || '';
  if (!driveOwnerEmail) throw new Error('STUDIO_OWNER_EMAIL is not configured.');
  const driveFolderId = await loadBetaDeskDriveFolderId(driveOwnerEmail);
  if (!driveFolderId) throw new Error('Google Drive is not connected for the Studio Super Admin.');
  const uploadId = randomUUID();
  const createdAt = new Date().toISOString();
  const grant: BetaDeskUploadGrant = {
    uploadId,
    testerId,
    driveOwnerEmail,
    fileName,
    contentType,
    maxSize,
    createdAt,
  };
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const query = new URLSearchParams({
    fields: 'id,name,mimeType,size,parents,appProperties',
    supportsAllDrives: 'true',
    uploadType: 'resumable',
  });
  const response = await betaDeskDriveRequest(
    driveOwnerEmail,
    `https://www.googleapis.com/upload/drive/v3/files?${query}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({
        name: fileName,
        mimeType: contentType,
        parents: [driveFolderId],
        appProperties: {
          betaDeskTesterId: testerId,
          betaDeskUploadId: uploadId,
        },
      }),
    }
  );
  if (!response.ok) throw await betaDeskDriveError(response, 'prepare attachment upload');
  const uploadUrl = response.headers.get('location');
  if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/upload/drive/')) {
    throw new Error('Google Drive did not return a valid resumable upload URL.');
  }
  await getBetaDeskUploadGrantsCollection().doc(uploadId).create({
    ...grant,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  const publicGrant = {
    uploadId,
    testerId,
    fileName,
    contentType,
    maxSize,
    createdAt,
  };
  return { grant: publicGrant, uploadUrl };
}

export async function completeBetaDeskUploadGrant(
  testerId: string,
  uploadId: string,
  fileId: string
): Promise<BetaDeskAttachment | null> {
  const grantRef = getBetaDeskUploadGrantsCollection().doc(uploadId);
  const document = await grantRef.get();
  if (!document.exists) return null;
  const grant = document.data() as BetaDeskUploadGrant & { expiresAt: string };
  if (
    grant.testerId !== testerId
    || grant.fileId
    || Date.parse(grant.expiresAt) <= Date.now()
    || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId)
  ) return null;

  const file = await loadBetaDeskDriveFile(fileId, grant.driveOwnerEmail);
  const size = Number(file?.size);
  const driveFolderId = await loadBetaDeskDriveFolderId(grant.driveOwnerEmail);
  if (
    !file
    || !driveFolderId
    || !file.parents?.includes(driveFolderId)
    || file.mimeType !== grant.contentType
    || size < 1
    || size > grant.maxSize
    || file.appProperties?.betaDeskTesterId !== testerId
    || file.appProperties?.betaDeskUploadId !== uploadId
  ) return null;

  const signature = await downloadBetaDeskDriveRange(fileId, grant.driveOwnerEmail, 0, Math.min(31, size - 1), size);
  if (!isValidBetaDeskFileSignature(grant.contentType, signature)) return null;
  await grantRef.update({ fileId, uploadedAt: new Date().toISOString() });
  return {
    uploadId,
    fileName: grant.fileName,
    contentType: grant.contentType,
    size,
  };
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
    || !grant.fileId
  ) return null;
  const file = await loadBetaDeskDriveFile(grant.fileId, grant.driveOwnerEmail);
  const size = Number(file?.size);
  const driveFolderId = await loadBetaDeskDriveFolderId(grant.driveOwnerEmail);
  if (
    !file
    || !driveFolderId
    || !file.parents?.includes(driveFolderId)
    || size < 1
    || size > grant.maxSize
    || file.mimeType !== grant.contentType
    || file.appProperties?.betaDeskTesterId !== testerId
    || file.appProperties?.betaDeskUploadId !== uploadId
  ) return null;

  return {
    uploadId,
    fileName: grant.fileName,
    contentType: grant.contentType,
    size,
  };
}

export async function getBetaDeskAttachmentChunk(
  testerId: string,
  ticketNumber: string,
  uploadId: string,
  start: number,
  end: number
): Promise<{ data: Buffer; contentType: string; fileName: string; size: number } | null> {
  const ticket = await loadBetaDeskTicket(ticketNumber);
  if (!ticket || ticket.testerId !== testerId || !ticket.attachments.some((item) => item.uploadId === uploadId)) {
    return null;
  }
  const document = await getBetaDeskUploadGrantsCollection().doc(uploadId).get();
  if (!document.exists) return null;
  const grant = document.data() as BetaDeskUploadGrant;
  if (grant.testerId !== testerId || grant.usedByTicket !== ticketNumber || !grant.fileId) return null;
  const file = await loadBetaDeskDriveFile(grant.fileId, grant.driveOwnerEmail);
  const size = Number(file?.size);
  const driveFolderId = await loadBetaDeskDriveFolderId(grant.driveOwnerEmail);
  if (
    !file
    || !driveFolderId
    || !file.parents?.includes(driveFolderId)
    || file.mimeType !== grant.contentType
    || size !== ticket.attachments.find((item) => item.uploadId === uploadId)?.size
    || file.appProperties?.betaDeskTesterId !== testerId
    || file.appProperties?.betaDeskUploadId !== uploadId
    || start < 0
    || end < start
    || end >= size
    || end - start + 1 > BETA_DESK_ATTACHMENT_CHUNK_SIZE
  ) return null;
  const data = await downloadBetaDeskDriveRange(grant.fileId, grant.driveOwnerEmail, start, end, size);
  return { data, contentType: grant.contentType, fileName: grant.fileName, size };
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
        || !grant.fileId
        || !grant.uploadedAt
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