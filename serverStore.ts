import { assertPreviewConfiguration } from './customerOperationsDeployment.js';
import { MessagingError, linkedTicketIds, messageOperationId, bufferedTransaction } from './customerOperationsMessaging.js';
import { applyTicketOperations } from './customerOperationsOperations.js';
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
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { OutboxEntry, StoredSubmission } from './serverEmailAndExcel.js';
import type {
  CustomerOperationsBusiness,
  CustomerOperationsBusinessMembership,
  CustomerOperationsBusinessRole,
  CustomerOperationsActivity,
  CustomerOperationsCallLog,
  CustomerOperationsCallDirection,
  CustomerOperationsCallOutcome,
  CustomerOperationsConversation,
  CustomerOperationsConversationMessage,
  CustomerOperationsConversationStatus,
  CustomerOperationsCustomer,
  CustomerOperationsCustomerStatus,
  CustomerOperationsInternalNote,
  CustomerOperationsMessageChannel,
  CustomerOperationsMessageDeliveryStatus,
  CustomerOperationsMessageVisibility,
  CustomerOperationsPlatformMembership,
  CustomerOperationsPlatformRole,
  CustomerOperationsTicket,
  CustomerOperationsTicketEvent,
  CustomerOperationsTicketPriority,
  CustomerOperationsTicketSource,
  CustomerOperationsTicketStatus,
} from './src/types/customerOperations.js';

const SUBMISSIONS_COLLECTION = 'studioSubmissions';
const OUTBOX_COLLECTION = 'emailOutbox';
const PROJECTS_COLLECTION = 'studioProjects';
const STUDIO_INVITES_COLLECTION = 'studioInvites';
const STUDIO_ADMIN_INVITE_LINKS_COLLECTION = 'studioAdminInviteLinks';
const CUSTOMER_OPERATIONS_BUSINESSES_COLLECTION = 'customerOperationsBusinesses';
const CUSTOMER_OPERATIONS_BUSINESS_MEMBERSHIPS_COLLECTION = 'customerOperationsBusinessMemberships';
const CUSTOMER_OPERATIONS_PLATFORM_MEMBERSHIPS_COLLECTION = 'customerOperationsPlatformMemberships';
const CUSTOMER_OPERATIONS_AUDIT_COLLECTION = 'customerOperationsAuditLogs';
const CUSTOMER_OPERATIONS_CUSTOMERS_COLLECTION = 'customerOperationsCustomers';
const CUSTOMER_OPERATIONS_TICKETS_COLLECTION = 'customerOperationsTickets';
const CUSTOMER_OPERATIONS_ACTIVITY_COLLECTION = 'customerOperationsActivity';
const CUSTOMER_OPERATIONS_CONVERSATIONS_COLLECTION = 'customerOperationsConversations';
const CUSTOMER_OPERATIONS_CALL_LOGS_COLLECTION = 'customerOperationsCallLogs';
const FIRESTORE_BATCH_LIMIT = 450;

interface StoredCustomerOperationsConversation extends CustomerOperationsConversation {
  customerLinkTokenHash: string | null;
  subjectSearch?: string;
  requestFingerprint?:string;
}

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

export interface StudioAdminInviteLink {
  email: string;
  kind: 'studio' | 'betadesk';
  role: 'admin' | 'project_manager' | 'viewer' | 'betadesk_admin';
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
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
  projectId?: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  claimedAt?: string;
}

let firebaseApp: App | undefined;

export function getFirebaseApp(): App {
  assertPreviewConfiguration();
  if (!firebaseApp) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedServiceAccount=serviceAccount?JSON.parse(serviceAccount):null;
    if(process.env.FIREBASE_PROJECT_ID&&parsedServiceAccount?.project_id&&process.env.FIREBASE_PROJECT_ID!==parsedServiceAccount.project_id)throw new Error('Server Firebase credentials do not match FIREBASE_PROJECT_ID.');
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulatorHost && (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^127\.0\.0\.1:\d+$/.test(emulatorHost) || process.env.NODE_ENV === 'production')) throw new Error('Emulators require a demo project, loopback host and non-production mode.');
    firebaseApp = getApps()[0] || initializeApp({
      ...(process.env.FIREBASE_PROJECT_ID ? {projectId:process.env.FIREBASE_PROJECT_ID} : {}),
      ...(process.env.FIREBASE_STORAGE_BUCKET ? {storageBucket:process.env.FIREBASE_STORAGE_BUCKET} : {}),
      ...(emulatorHost ? {projectId:process.env.GCLOUD_PROJECT,storageBucket:`${process.env.GCLOUD_PROJECT}.appspot.com`} : {}),
      credential: serviceAccount
        ? cert(parsedServiceAccount)
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

function getStudioAdminInviteLinksCollection() {
  return getFirestore(getFirebaseApp()).collection(STUDIO_ADMIN_INVITE_LINKS_COLLECTION);
}

function getCustomerOperationsBusinessesCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_BUSINESSES_COLLECTION);
}

function getCustomerOperationsBusinessMembershipsCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_BUSINESS_MEMBERSHIPS_COLLECTION);
}

function getCustomerOperationsPlatformMembershipsCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_PLATFORM_MEMBERSHIPS_COLLECTION);
}

function getCustomerOperationsAuditCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_AUDIT_COLLECTION);
}

function getCustomerOperationsCustomersCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_CUSTOMERS_COLLECTION);
}

function getCustomerOperationsTicketsCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_TICKETS_COLLECTION);
}

function getCustomerOperationsActivityCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_ACTIVITY_COLLECTION);
}

function getCustomerOperationsConversationsCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_CONVERSATIONS_COLLECTION);
}

function getCustomerOperationsCallLogsCollection() {
  return getFirestore(getFirebaseApp()).collection(CUSTOMER_OPERATIONS_CALL_LOGS_COLLECTION);
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

export async function saveStudioAdminInviteLink(
  tokenHash: string,
  invite: StudioAdminInviteLink
): Promise<void> {
  await getStudioAdminInviteLinksCollection().doc(tokenHash).create(invite);
}

export async function loadStudioAdminInviteLinks(): Promise<Array<{
  id: string;
  email: string;
  kind: StudioAdminInviteLink['kind'];
  role: StudioAdminInviteLink['role'];
  createdAt: string;
  expiresAt: string;
}>> {
  const snapshot = await getStudioAdminInviteLinksCollection().get();
  const now = Date.now();
  const expiredDocuments = snapshot.docs.filter((document) => {
    const expiresAt = Date.parse((document.data() as StudioAdminInviteLink).expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= now;
  });
  for (let offset = 0; offset < expiredDocuments.length; offset += FIRESTORE_BATCH_LIMIT) {
    const batch = getFirestore(getFirebaseApp()).batch();
    for (const document of expiredDocuments.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }

  return snapshot.docs
    .map((document) => ({
      id: document.id,
      ...(document.data() as StudioAdminInviteLink),
    }))
    .filter((invite) => Date.parse(invite.expiresAt) > now)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function revokeStudioAdminInviteLink(tokenHash: string): Promise<void> {
  await getStudioAdminInviteLinksCollection().doc(tokenHash).delete();
}

export async function claimStudioAdminInviteLink(
  tokenHash: string,
  email: string
): Promise<'claimed_studio' | 'claimed_betadesk' | 'email_mismatch' | 'expired' | 'invalid'> {
  const firestore = getFirestore(getFirebaseApp());
  const linkRef = getStudioAdminInviteLinksCollection().doc(tokenHash);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(linkRef);
    if (!snapshot.exists) return 'invalid';

    const invite = snapshot.data() as StudioAdminInviteLink;
    const expiresAt = Date.parse(invite.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      transaction.delete(linkRef);
      return 'expired';
    }

    if (invite.email !== email.trim().toLowerCase()) return 'email_mismatch';

    if (invite.kind === 'studio') {
      if (!['admin', 'project_manager', 'viewer'].includes(invite.role)) {
        transaction.delete(linkRef);
        return 'invalid';
      }
      transaction.set(getStudioInvitesCollection().doc(invite.email), {
        email: invite.email,
        role: invite.role,
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt,
      });
    } else if (invite.kind === 'betadesk' && invite.role === 'betadesk_admin') {
      transaction.set(getBetaDeskAdminsCollection().doc(invite.email), {
        email: invite.email,
        active: true,
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt,
      });
    } else {
      transaction.delete(linkRef);
      return 'invalid';
    }

    transaction.delete(linkRef);
    return invite.kind === 'studio' ? 'claimed_studio' : 'claimed_betadesk';
  });
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

export async function createBetaDeskTester(tokenHash: string, projectId: string): Promise<BetaDeskTester> {
  const db = getFirestore(getFirebaseApp());
  const accessRef = getBetaDeskTesterAccessCollection().doc(tokenHash);
  const tester = {
    id: randomUUID(),
    projectId,
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

export async function deleteBetaDeskTester(testerId: string): Promise<boolean> {
  const db = getFirestore(getFirebaseApp());
  const testerRef = getBetaDeskTestersCollection().doc(testerId);
  const tester = await testerRef.get();
  if (!tester.exists) return false;

  const accessSnapshot = await getBetaDeskTesterAccessCollection().where('testerId', '==', testerId).get();
  if (accessSnapshot.empty) {
    await testerRef.delete();
    return true;
  }

  for (let offset = 0; offset < accessSnapshot.docs.length; offset += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    if (offset === 0) batch.delete(testerRef);
    for (const document of accessSnapshot.docs.slice(offset, offset + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(document.ref);
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

const customerOperationsEmailId = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const customerOperationsBusinessMembershipRef = (businessId: string, email: string) =>
  getCustomerOperationsBusinessMembershipsCollection()
    .doc(`${businessId}_${customerOperationsEmailId(email)}`);
const validTicketTransitions: Record<CustomerOperationsTicketStatus, CustomerOperationsTicketStatus[]> = {
  new: ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'],
  open: ['new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'],
  in_progress: ['open', 'waiting_on_customer', 'resolved', 'closed'],
  waiting_on_customer: ['open', 'in_progress', 'resolved', 'closed'],
  resolved: ['open', 'in_progress', 'closed'],
  closed: ['open'],
};

export async function createCustomerOperationsBusiness(input: {
  name: string;
  ownerEmail: string;
  createdBy: string;
}): Promise<CustomerOperationsBusiness> {
  const db = getFirestore(getFirebaseApp());
  const businessId = randomUUID();
  const now = new Date().toISOString();
  const business: CustomerOperationsBusiness = {
    id: businessId,
    name: input.name,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };
  const membership: CustomerOperationsBusinessMembership = {
    businessId,
    businessName: input.name,
    email: input.ownerEmail,
    role: 'business_owner',
    active: false,
    createdAt: now,
    invitedBy: input.createdBy,
  };
  const businessRef = getCustomerOperationsBusinessesCollection().doc(businessId);
  const membershipRef = getCustomerOperationsBusinessMembershipsCollection()
    .doc(`${businessId}_${customerOperationsEmailId(input.ownerEmail)}`);
  const auditRef = getCustomerOperationsAuditCollection().doc(randomUUID());

  await db.runTransaction(async (transaction) => {
    const platformMembership = await transaction.get(
      getCustomerOperationsPlatformMembershipsCollection().doc(customerOperationsEmailId(input.ownerEmail))
    );
    if (platformMembership.exists
      && (platformMembership.data() as CustomerOperationsPlatformMembership).active) {
      throw new Error('Platform members cannot be assigned as business owners.');
    }
    transaction.create(businessRef, business);
    transaction.create(membershipRef, membership);
    transaction.create(auditRef, {
      action: 'business_created',
      actorEmail: input.createdBy,
      targetType: 'business',
      targetId: businessId,
      metadata: { name: input.name, ownerEmail: input.ownerEmail },
      createdAt: now,
    });
  });
  return business;
}

export async function loadCustomerOperationsBusinesses(): Promise<CustomerOperationsBusiness[]> {
  const snapshot = await getCustomerOperationsBusinessesCollection()
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsBusiness);
}

export async function loadCustomerOperationsBusiness(
  businessId: string
): Promise<CustomerOperationsBusiness | null> {
  const document = await getCustomerOperationsBusinessesCollection().doc(businessId).get();
  return document.exists ? document.data() as CustomerOperationsBusiness : null;
}

export async function loadCustomerOperationsBusinessMemberships(
  email: string
): Promise<CustomerOperationsBusinessMembership[]> {
  const snapshot = await getCustomerOperationsBusinessMembershipsCollection()
    .where('email', '==', email.trim().toLowerCase())
    .get();
  const memberships = snapshot.docs
    .map((document) => document.data() as CustomerOperationsBusinessMembership)
    .filter((membership) => membership.active);
  const resolved = await Promise.all(memberships.map(async (membership) => {
    const business = await loadCustomerOperationsBusiness(membership.businessId);
    if (!business || business.status !== 'active') return null;
    return { ...membership, businessName: business.name };
  }));
  return resolved.filter(
    (membership): membership is CustomerOperationsBusinessMembership => membership !== null
  );
}

export async function loadCustomerOperationsBusinessMembers(
  businessId: string
): Promise<CustomerOperationsBusinessMembership[]> {
  const snapshot = await getCustomerOperationsBusinessMembershipsCollection()
    .where('businessId', '==', businessId)
    .get();
  return snapshot.docs
    .map((document) => document.data() as CustomerOperationsBusinessMembership)
    .filter((membership) => membership.active)
    .sort((left, right) => left.email.localeCompare(right.email));
}

export async function saveCustomerOperationsBusinessMembership(input: {
  businessId: string;
  email: string;
  role: CustomerOperationsBusinessRole;
  invitedBy: string;
}): Promise<CustomerOperationsBusinessMembership> {
  const db = getFirestore(getFirebaseApp());
  const businessRef = getCustomerOperationsBusinessesCollection().doc(input.businessId);
  const membershipRef = getCustomerOperationsBusinessMembershipsCollection()
    .doc(`${input.businessId}_${customerOperationsEmailId(input.email)}`);
  const now = new Date().toISOString();
  const auditRef = getCustomerOperationsAuditCollection().doc(randomUUID());
  return db.runTransaction(async (transaction) => {
    const [businessSnapshot, membershipSnapshot, platformMembershipSnapshot] = await Promise.all([
      transaction.get(businessRef),
      transaction.get(membershipRef),
      transaction.get(getCustomerOperationsPlatformMembershipsCollection().doc(customerOperationsEmailId(input.email))),
    ]);
    const business = businessSnapshot.exists
      ? businessSnapshot.data() as CustomerOperationsBusiness
      : null;
    if (!business || business.status !== 'active') {
      throw new Error('Business does not exist or is inactive.');
    }
    if (platformMembershipSnapshot.exists
      && (platformMembershipSnapshot.data() as CustomerOperationsPlatformMembership).active) {
      throw new Error('Platform members cannot be assigned business membership.');
    }
    if (membershipSnapshot.exists) {
      const current = membershipSnapshot.data() as CustomerOperationsBusinessMembership;
      if (current.active && current.role === 'business_owner') {
        throw new Error('An existing business owner cannot be downgraded.');
      }
    }
    const membership: CustomerOperationsBusinessMembership = {
      businessId: input.businessId,
      businessName: business.name,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      grantVersion:(membershipSnapshot.get('grantVersion')||0)+1,
      active: Boolean(membershipSnapshot.exists && membershipSnapshot.get('active') && membershipSnapshot.get('uid')),
      ...(membershipSnapshot.get('uid') ? { uid: membershipSnapshot.get('uid') as string } : {}),
      createdAt: now,
      invitedBy: input.invitedBy,
    };
    const previous = membershipSnapshot.exists
      ? membershipSnapshot.data() as CustomerOperationsBusinessMembership
      : null;
    transaction.set(membershipRef, membership);
    transaction.create(auditRef, {
      action: previous?.active ? 'business_member_role_changed' : 'business_member_granted',
      actorEmail: input.invitedBy,
      targetType: 'business_membership',
      targetId: `${input.businessId}:${membership.email}`,
      metadata: {
        role: input.role,
      grantVersion:(membershipSnapshot.get('grantVersion')||0)+1,
        ...(previous?.role ? { previousRole: previous.role } : {}),
      },
      createdAt: now,
    });
    return membership;
  });
}

export async function deactivateCustomerOperationsBusinessMembership(input: {
  businessId: string;
  email: string;
  actorEmail: string;
}): Promise<void> {
  const db = getFirestore(getFirebaseApp());
  const membershipRef = getCustomerOperationsBusinessMembershipsCollection()
    .doc(`${input.businessId}_${customerOperationsEmailId(input.email)}`);
  const auditRef = getCustomerOperationsAuditCollection().doc(randomUUID());
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(membershipRef);
    if (!snapshot.exists || !(snapshot.data() as CustomerOperationsBusinessMembership).active) {
      throw new Error('Business membership was not found.');
    }
    const membership = snapshot.data() as CustomerOperationsBusinessMembership;
    if (membership.role === 'business_owner') {
      throw new Error('Business owner membership cannot be deactivated here.');
    }
    transaction.update(membershipRef, { active: false,grantVersion:(snapshot.get('grantVersion')||0)+1 });
    transaction.create(auditRef, {
      action: 'business_member_deactivated',
      actorEmail: input.actorEmail,
      targetType: 'business_membership',
      targetId: `${input.businessId}:${membership.email}`,
      metadata: { role: membership.role },
      createdAt: now,
    });
  });
}

export async function loadCustomerOperationsPlatformMembership(
  email: string
): Promise<CustomerOperationsPlatformMembership | null> {
  const document = await getCustomerOperationsPlatformMembershipsCollection()
    .doc(customerOperationsEmailId(email))
    .get();
  if (!document.exists) return null;
  const membership = document.data() as CustomerOperationsPlatformMembership;
  return membership.active ? membership : null;
}

export async function loadCustomerOperationsPlatformMemberships():
Promise<CustomerOperationsPlatformMembership[]> {
  const snapshot = await getCustomerOperationsPlatformMembershipsCollection()
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs
    .map((document) => document.data() as CustomerOperationsPlatformMembership)
    .filter((membership) => membership.active);
}

export async function saveCustomerOperationsPlatformMembership(input: {
  email: string;
  role: CustomerOperationsPlatformRole;
  invitedBy: string;
}): Promise<CustomerOperationsPlatformMembership> {
  const db = getFirestore(getFirebaseApp());
  const membership: CustomerOperationsPlatformMembership = {
    email: input.email.trim().toLowerCase(),
    role: input.role,
    active: true,
    createdAt: new Date().toISOString(),
    invitedBy: input.invitedBy,
  };
  const membershipRef = getCustomerOperationsPlatformMembershipsCollection()
    .doc(customerOperationsEmailId(membership.email));
  const businessMembershipQuery = getCustomerOperationsBusinessMembershipsCollection()
    .where('email', '==', membership.email);
  const auditRef = getCustomerOperationsAuditCollection().doc(randomUUID());
  await db.runTransaction(async (transaction) => {
    const [previousSnapshot, businessMemberships] = await Promise.all([
      transaction.get(membershipRef),
      transaction.get(businessMembershipQuery),
    ]);
    if (businessMemberships.docs.some((document) =>
      (document.data() as CustomerOperationsBusinessMembership).active
    )) {
      throw new Error('Business members cannot be granted platform support access.');
    }
    const previous = previousSnapshot.exists
      ? previousSnapshot.data() as CustomerOperationsPlatformMembership
      : null;
    transaction.set(membershipRef, membership);
    transaction.create(auditRef, {
      action: previous?.active ? 'platform_member_updated' : 'platform_member_granted',
      actorEmail: input.invitedBy,
      targetType: 'platform_member',
      targetId: membership.email,
      metadata: {
        role: input.role,
        ...(previous?.role ? { previousRole: previous.role } : {}),
      },
      createdAt: membership.createdAt,
    });
  });
  return membership;
}

export async function deactivateCustomerOperationsPlatformMembership(
  email: string,
  actorEmail: string
): Promise<void> {
  const db = getFirestore(getFirebaseApp());
  const membershipRef = getCustomerOperationsPlatformMembershipsCollection()
    .doc(customerOperationsEmailId(email));
  const auditRef = getCustomerOperationsAuditCollection().doc(randomUUID());
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(membershipRef);
    if (!snapshot.exists || !(snapshot.data() as CustomerOperationsPlatformMembership).active) {
      throw new Error('Platform membership was not found.');
    }
    const membership = snapshot.data() as CustomerOperationsPlatformMembership;
    transaction.update(membershipRef, { active: false,grantVersion:(snapshot.get('grantVersion')||0)+1 });
    transaction.create(auditRef, {
      action: 'platform_member_deactivated',
      actorEmail,
      targetType: 'platform_member',
      targetId: email,
      metadata: { role: membership.role },
      createdAt: now,
    });
  });
}

export async function createCustomerOperationsCustomer(input: {
  businessId: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company: string;
  tags: string[];
  assignedOwner: string;
  actorEmail: string;
}): Promise<CustomerOperationsCustomer> {
  const db = getFirestore(getFirebaseApp());
  const id = randomUUID();
  const now = new Date().toISOString();
  const customer: CustomerOperationsCustomer = {
    id,
    businessId: input.businessId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    whatsapp: input.whatsapp,
    company: input.company,
    status: 'active',
    tags: input.tags,
    assignedOwner: input.assignedOwner,
    nameSearch: input.name.toLocaleLowerCase(),
    emailSearch: input.email.toLocaleLowerCase(),
    companySearch: input.company.toLocaleLowerCase(),
    createdAt: now,
    updatedAt: now,
    lastInteractionAt: null,
    createdBy: input.actorEmail,
  };
  const customerRef = getCustomerOperationsCustomersCollection().doc(id);
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  await db.runTransaction(async (transaction) => {
    const businessRef = getCustomerOperationsBusinessesCollection().doc(input.businessId);
    const reads = [transaction.get(businessRef)];
    if (input.assignedOwner) reads.push(transaction.get(customerOperationsBusinessMembershipRef(input.businessId, input.assignedOwner)));
    const snapshots = await Promise.all(reads);
    const business = snapshots[0];
    if (!business.exists || (business.data() as CustomerOperationsBusiness).status !== 'active') {
      throw new Error('Business does not exist or is inactive.');
    }
    if (input.assignedOwner && (!snapshots[1]?.exists
      || !(snapshots[1].data() as CustomerOperationsBusinessMembership).active)) {
      throw new Error('Assigned owner is not an active member of this business.');
    }
    transaction.create(customerRef, customer);
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: id,
      ticketId: null,
      action: 'customer_created',
      actorEmail: input.actorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
  });
  return customer;
}

export async function loadCustomerOperationsCustomer(
  businessId: string,
  customerId: string
): Promise<CustomerOperationsCustomer | null> {
  const document = await getCustomerOperationsCustomersCollection().doc(customerId).get();
  if (!document.exists) return null;
  const customer = document.data() as CustomerOperationsCustomer;
  return customer.businessId === businessId ? customer : null;
}

export async function listCustomerOperationsCustomers(input: {
  businessId: string;
  limit: number;
  cursor?: { updatedAt: string; id: string };
  search?: string;
  status?: CustomerOperationsCustomerStatus;
}): Promise<{ items: CustomerOperationsCustomer[]; nextCursor: string | null }> {
  const collection = getCustomerOperationsCustomersCollection();
  const search = input.search?.trim().toLocaleLowerCase() || '';
  if (search) {
    const fields = ['nameSearch', 'emailSearch', 'companySearch'] as const;
    const snapshots = await Promise.all(fields.map((field) => collection
      .where('businessId', '==', input.businessId)
      .where(field, '>=', search)
      .where(field, '<=', `${search}\uf8ff`)
      .orderBy(field)
      .limit(input.limit)
      .get()));
    const unique = new Map<string, CustomerOperationsCustomer>();
    for (const snapshot of snapshots) {
      for (const document of snapshot.docs) {
        const customer = document.data() as CustomerOperationsCustomer;
        if (!input.status || customer.status === input.status) unique.set(customer.id, customer);
      }
    }
    const items = [...unique.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input.limit);
    return { items, nextCursor: null };
  }

  let query = collection.where('businessId', '==', input.businessId)
    .orderBy('updatedAt', 'desc')
    .orderBy('id', 'desc');
  if (input.status) query = query.where('status', '==', input.status) as typeof query;
  if (input.cursor) query = query.startAfter(input.cursor.updatedAt, input.cursor.id) as typeof query;
  const snapshot = await query.limit(input.limit + 1).get();
  const documents = snapshot.docs.slice(0, input.limit);
  const items = documents.map((document) => document.data() as CustomerOperationsCustomer);
  const last = documents.at(-1)?.data() as CustomerOperationsCustomer | undefined;
  return {
    items,
    nextCursor: snapshot.docs.length > input.limit && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString('base64url')
      : null,
  };
}

export async function updateCustomerOperationsCustomer(input: {
  businessId: string;
  customerId: string;
  changes: Partial<Pick<CustomerOperationsCustomer, 'name' | 'email' | 'phone' | 'whatsapp' | 'company' | 'status' | 'tags' | 'assignedOwner'>>;
  actorEmail: string;
}): Promise<CustomerOperationsCustomer | null> {
  const db = getFirestore(getFirebaseApp());
  const customerRef = getCustomerOperationsCustomersCollection().doc(input.customerId);
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const reads = [transaction.get(customerRef)];
    if (input.changes.assignedOwner) {
      reads.push(transaction.get(customerOperationsBusinessMembershipRef(input.businessId, input.changes.assignedOwner)));
    }
    const snapshots = await Promise.all(reads);
    const snapshot = snapshots[0];
    if (!snapshot.exists) return null;
    const current = snapshot.data() as CustomerOperationsCustomer;
    if (current.businessId !== input.businessId) return null;
    if (input.changes.assignedOwner && (!snapshots[1]?.exists
      || !(snapshots[1].data() as CustomerOperationsBusinessMembership).active)) {
      throw new Error('Assigned owner is not an active member of this business.');
    }
    const next = {
      ...current,
      ...input.changes,
      ...(input.changes.name !== undefined ? { nameSearch: input.changes.name.toLocaleLowerCase() } : {}),
      ...(input.changes.email !== undefined ? { emailSearch: input.changes.email.toLocaleLowerCase() } : {}),
      ...(input.changes.company !== undefined ? { companySearch: input.changes.company.toLocaleLowerCase() } : {}),
      updatedAt: now,
    };
    const changedFields = Object.keys(input.changes).filter((key) =>
      current[key as keyof CustomerOperationsCustomer] !== input.changes[key as keyof typeof input.changes]
    );
    if (!changedFields.length) return current;
    transaction.update(customerRef, next);
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: input.customerId,
      ticketId: null,
      action: 'customer_updated',
      actorEmail: input.actorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return next;
  });
}

export async function listCustomerOperationsCustomerActivity(
  businessId: string,
  customerId: string
): Promise<CustomerOperationsActivity[]> {
  const snapshot = await getCustomerOperationsActivityCollection()
    .where('businessId', '==', businessId)
    .where('customerId', '==', customerId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsActivity);
}

export async function addCustomerOperationsCustomerNote(input: {
  businessId: string;
  customerId: string;
  body: string;
  authorEmail: string;
}): Promise<CustomerOperationsInternalNote | null> {
  const db = getFirestore(getFirebaseApp());
  const customerRef = getCustomerOperationsCustomersCollection().doc(input.customerId);
  const noteRef = customerRef.collection('internalNotes').doc(randomUUID());
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  const note: CustomerOperationsInternalNote = {
    id: noteRef.id,
    body: input.body,
    authorEmail: input.authorEmail,
    createdAt: now,
  };
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(customerRef);
    if (!snapshot.exists || (snapshot.data() as CustomerOperationsCustomer).businessId !== input.businessId) {
      return null;
    }
    transaction.create(noteRef, note);
    transaction.update(customerRef, { updatedAt: now, lastInteractionAt: now });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: input.customerId,
      ticketId: null,
      action: 'customer_internal_note_added',
      actorEmail: input.authorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return note;
  });
}

export async function listCustomerOperationsCustomerNotes(
  businessId: string,
  customerId: string
): Promise<CustomerOperationsInternalNote[] | null> {
  const customer = await loadCustomerOperationsCustomer(businessId, customerId);
  if (!customer) return null;
  const snapshot = await getCustomerOperationsCustomersCollection().doc(customerId)
    .collection('internalNotes')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsInternalNote);
}

export async function createCustomerOperationsTicket(input: {
  businessId: string;
  customerId: string;
  subject: string;
  description: string;
  category: string;
  tags: string[];
  priority: CustomerOperationsTicketPriority;
  assignedAgent: string;
  assignedTeam: string;
  source: CustomerOperationsTicketSource;
  actorEmail: string;
}): Promise<CustomerOperationsTicket> {
  const db = getFirestore(getFirebaseApp());
  const ticketId = randomUUID();
  const now = new Date().toISOString();
  const ticketRef = getCustomerOperationsTicketsCollection().doc(ticketId);
  const eventRef = ticketRef.collection('events').doc(randomUUID());
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const counterRef = getCustomerOperationsBusinessesCollection().doc(input.businessId)
    .collection('counters').doc('tickets');
  return db.runTransaction(async (transaction) => {
    const reads = [
      transaction.get(getCustomerOperationsBusinessesCollection().doc(input.businessId)),
      transaction.get(getCustomerOperationsCustomersCollection().doc(input.customerId)),
      transaction.get(counterRef),
    ];
    if (input.assignedAgent) {
      reads.push(transaction.get(customerOperationsBusinessMembershipRef(input.businessId, input.assignedAgent)));
    }
    const [businessSnapshot, customerSnapshot, counterSnapshot, assignedMemberSnapshot] = await Promise.all(reads);
    const business = businessSnapshot.exists
      ? businessSnapshot.data() as CustomerOperationsBusiness
      : null;
    const customer = customerSnapshot.exists
      ? customerSnapshot.data() as CustomerOperationsCustomer
      : null;
    if (!business || business.status !== 'active') {
      throw new Error('Business does not exist or is inactive.');
    }
    if (!customer || customer.businessId !== input.businessId || customer.status !== 'active') {
      throw new Error('Customer does not exist in this business.');
    }
    if (input.assignedAgent && (!assignedMemberSnapshot?.exists
      || !(assignedMemberSnapshot.data() as CustomerOperationsBusinessMembership).active)) {
      throw new Error('Assigned agent is not an active member of this business.');
    }
    if(input.assignedTeam){const team=await transaction.get(getCustomerOperationsBusinessesCollection().doc(input.businessId).collection('teams').doc(input.assignedTeam));if(!team.exists||!team.get('active'))throw new Error('Assigned team is not active in this business.');}
    const currentCount = counterSnapshot.exists
      ? Number(counterSnapshot.get('count')) || 1000
      : 1000;
    const nextCount = currentCount + 1;
    const ticket: CustomerOperationsTicket = {
      id: ticketId,
      businessId: input.businessId,
      ticketNumber: `TKT-${nextCount}`,
      ticketNumberSearch: `tkt-${nextCount}`,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      subject: input.subject,
      subjectSearch: input.subject.toLocaleLowerCase(),
      description: input.description,
      category: input.category,
      tags: input.tags,
      priority: input.priority,
      status: 'new',
      assignedAgent: input.assignedAgent,
      assignedTeam: input.assignedTeam,
      source: input.source,
      createdAt: now,
      updatedAt: now,
      firstResponseAt: null,
      resolvedAt: null,
      createdBy: input.actorEmail,
    };
    Object.assign(ticket, await applyTicketOperations(db, transaction, ticket, null, eventRef.id, input.actorEmail, 'created', now));
    transaction.set(counterRef, { count: nextCount });
    transaction.create(ticketRef, ticket);
    transaction.create(eventRef, {
      id: eventRef.id,
      action: 'ticket_created',
      actorEmail: input.actorEmail,
      changes: {},
      createdAt: now,
    } satisfies CustomerOperationsTicketEvent);
    transaction.update(getCustomerOperationsCustomersCollection().doc(customer.id), {
      updatedAt: now,
      lastInteractionAt: now,
    });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: customer.id,
      ticketId,
      action: 'ticket_created',
      actorEmail: input.actorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return ticket;
  });
}

export async function loadCustomerOperationsTicket(
  businessId: string,
  ticketId: string
): Promise<CustomerOperationsTicket | null> {
  const document = await getCustomerOperationsTicketsCollection().doc(ticketId).get();
  if (!document.exists) return null;
  const ticket = document.data() as CustomerOperationsTicket;
  return ticket.businessId === businessId ? ticket : null;
}

export async function listCustomerOperationsTickets(input: {
  businessId: string;
  limit: number;
  cursor?: { updatedAt: string; id: string };
  search?: string;
  customerId?: string;
  status?: CustomerOperationsTicketStatus;
  priority?: CustomerOperationsTicketPriority;
}): Promise<{ items: CustomerOperationsTicket[]; nextCursor: string | null }> {
  const collection = getCustomerOperationsTicketsCollection();
  const search = input.search?.trim().toLocaleLowerCase() || '';
  if (search) {
    const snapshots = await Promise.all(['subjectSearch', 'ticketNumberSearch'].map((field) => {
      let query = collection.where('businessId', '==', input.businessId);
      if (input.customerId) query = query.where('customerId', '==', input.customerId) as typeof query;
      return query.where(field, '>=', search)
        .where(field, '<=', `${search}\uf8ff`)
        .orderBy(field)
        .limit(input.limit)
        .get();
    }));
    const unique = new Map<string, CustomerOperationsTicket>();
    for (const snapshot of snapshots) {
      for (const document of snapshot.docs) {
        const ticket = document.data() as CustomerOperationsTicket;
        if ((!input.status || ticket.status === input.status)
          && (!input.priority || ticket.priority === input.priority)) {
          unique.set(ticket.id, ticket);
        }
      }
    }
    return {
      items: [...unique.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, input.limit),
      nextCursor: null,
    };
  }

  let query = collection.where('businessId', '==', input.businessId)
    .orderBy('updatedAt', 'desc')
    .orderBy('id', 'desc');
  if (input.customerId) query = query.where('customerId', '==', input.customerId) as typeof query;
  if (input.status) query = query.where('status', '==', input.status) as typeof query;
  if (input.priority) query = query.where('priority', '==', input.priority) as typeof query;
  if (input.cursor) query = query.startAfter(input.cursor.updatedAt, input.cursor.id) as typeof query;
  const snapshot = await query.limit(input.limit + 1).get();
  const documents = snapshot.docs.slice(0, input.limit);
  const items = documents.map((document) => document.data() as CustomerOperationsTicket);
  const last = documents.at(-1)?.data() as CustomerOperationsTicket | undefined;
  return {
    items,
    nextCursor: snapshot.docs.length > input.limit && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString('base64url')
      : null,
  };
}

export async function updateCustomerOperationsTicket(input: {
  businessId: string;
  ticketId: string;
  changes: Partial<Pick<CustomerOperationsTicket, 'subject' | 'category' | 'tags' | 'priority' | 'status' | 'assignedAgent' | 'assignedTeam'>>;
  actorEmail: string;
}): Promise<CustomerOperationsTicket | null> {
  const db = getFirestore(getFirebaseApp());
  const ticketRef = getCustomerOperationsTicketsCollection().doc(input.ticketId);
  const eventRef = ticketRef.collection('events').doc(randomUUID());
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const customerRef = getCustomerOperationsCustomersCollection();
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ticketRef);
    if (!snapshot.exists) return null;
    const current = snapshot.data() as CustomerOperationsTicket;
    if (current.businessId !== input.businessId) return null;
    if (input.changes.status && input.changes.status !== current.status
      && !validTicketTransitions[current.status].includes(input.changes.status)) {
      throw new Error('Ticket status transition is not allowed.');
    }
    if (input.changes.assignedAgent) {
      const membershipSnapshot = await transaction.get(
        customerOperationsBusinessMembershipRef(input.businessId, input.changes.assignedAgent)
      );
      if (!membershipSnapshot.exists || !(membershipSnapshot.data() as CustomerOperationsBusinessMembership).active) {
        throw new Error('Assigned agent is not an active member of this business.');
      }
    }
    if(input.changes.assignedTeam){const team=await transaction.get(getCustomerOperationsBusinessesCollection().doc(input.businessId).collection('teams').doc(input.changes.assignedTeam));if(!team.exists||!team.get('active'))throw new Error('Assigned team is not active in this business.');}
    const changedFields = Object.keys(input.changes).filter((key) =>
      current[key as keyof CustomerOperationsTicket] !== input.changes[key as keyof typeof input.changes]
    );
    if (!changedFields.length) return current;
    const changes: CustomerOperationsTicketEvent['changes'] = {};
    for (const field of changedFields) {
      const key = field as keyof typeof input.changes;
      changes[field] = {
        from: Array.isArray(current[key as keyof CustomerOperationsTicket])
          ? (current[key as keyof CustomerOperationsTicket] as string[]).join(', ')
          : String(current[key as keyof CustomerOperationsTicket] ?? ''),
        to: Array.isArray(input.changes[key])
          ? (input.changes[key] as string[]).join(', ')
          : String(input.changes[key] ?? ''),
      };
    }
    const next: CustomerOperationsTicket = {
      ...current,
      ...input.changes,
      ...(input.changes.subject !== undefined ? { subjectSearch: input.changes.subject.toLocaleLowerCase() } : {}),
      updatedAt: now,
      ...(input.changes.status && ['resolved','closed'].includes(input.changes.status) && !['resolved','closed'].includes(current.status) ? { resolvedAt: now } : {}),
      ...(input.changes.status && !['resolved', 'closed'].includes(input.changes.status) && ['resolved', 'closed'].includes(current.status) ? { resolvedAt: null } : {}),
    };
    Object.assign(next, await applyTicketOperations(db, transaction, next, current, eventRef.id, input.actorEmail, ['resolved','closed'].includes(next.status) && !['resolved','closed'].includes(current.status) ? 'resolved' : 'updated', now));
    transaction.set(ticketRef, next);
    transaction.create(eventRef, {
      id: eventRef.id,
      action: 'ticket_updated',
      actorEmail: input.actorEmail,
      changes,
      createdAt: now,
    } satisfies CustomerOperationsTicketEvent);
    transaction.update(customerRef.doc(current.customerId), {
      updatedAt: now,
      lastInteractionAt: now,
    });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: current.customerId,
      ticketId: current.id,
      action: 'ticket_updated',
      actorEmail: input.actorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return next;
  });
}

export async function addCustomerOperationsTicketNote(input: {
  businessId: string;
  ticketId: string;
  body: string;
  authorEmail: string;
}): Promise<CustomerOperationsInternalNote | null> {
  const db = getFirestore(getFirebaseApp());
  const ticketRef = getCustomerOperationsTicketsCollection().doc(input.ticketId);
  const customerRef = getCustomerOperationsCustomersCollection();
  const noteRef = ticketRef.collection('internalNotes').doc(randomUUID());
  const eventRef = ticketRef.collection('events').doc(randomUUID());
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  const note: CustomerOperationsInternalNote = {
    id: noteRef.id,
    body: input.body,
    authorEmail: input.authorEmail,
    createdAt: now,
  };
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ticketRef);
    if (!snapshot.exists) return null;
    const ticket = snapshot.data() as CustomerOperationsTicket;
    if (ticket.businessId !== input.businessId) return null;
    transaction.create(noteRef, note);
    transaction.create(eventRef, {
      id: eventRef.id,
      action: 'internal_note_added',
      actorEmail: input.authorEmail,
      changes: {},
      createdAt: now,
    } satisfies CustomerOperationsTicketEvent);
    transaction.update(customerRef.doc(ticket.customerId), { updatedAt: now, lastInteractionAt: now });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: ticket.customerId,
      ticketId: input.ticketId,
      action: 'ticket_internal_note_added',
      actorEmail: input.authorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return note;
  });
}

export async function listCustomerOperationsTicketNotes(
  businessId: string,
  ticketId: string
): Promise<CustomerOperationsInternalNote[] | null> {
  const ticket = await loadCustomerOperationsTicket(businessId, ticketId);
  if (!ticket) return null;
  const snapshot = await getCustomerOperationsTicketsCollection().doc(ticketId)
    .collection('internalNotes')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsInternalNote);
}

export async function listCustomerOperationsTicketEvents(
  businessId: string,
  ticketId: string
): Promise<CustomerOperationsTicketEvent[] | null> {
  const ticket = await loadCustomerOperationsTicket(businessId, ticketId);
  if (!ticket) return null;
  const snapshot = await getCustomerOperationsTicketsCollection().doc(ticketId)
    .collection('events')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsTicketEvent);
}

function publicCustomerOperationsConversation(
  stored: StoredCustomerOperationsConversation
): CustomerOperationsConversation {
  return {
    id: stored.id,
    businessId: stored.businessId,
    customerId: stored.customerId,
    customerName: stored.customerName,
    customerEmail: stored.customerEmail,
    ticketId: stored.ticketId,
    ticketIds: linkedTicketIds(stored),
    assignedAgent: stored.assignedAgent || '',
    revision:stored.revision||0,
    ticketNumber: stored.ticketNumber,
    subject: stored.subject,
    status: stored.status,
    lastMessagePreview: stored.lastMessagePreview,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    createdBy: stored.createdBy,
    customerLinkExpiresAt: stored.customerLinkExpiresAt,
  };
}

async function loadCustomerOperationsConversationMessages(
  conversationId: string,
  customerVisibleOnly = false
): Promise<CustomerOperationsConversationMessage[]> {
  const collection = getCustomerOperationsConversationsCollection().doc(conversationId).collection('messages');
  const query = customerVisibleOnly
    ? collection.where('visibility', '==', 'customer').orderBy('createdAt', 'desc')
    : collection.orderBy('createdAt', 'desc');
  const snapshot = await query.limit(200).get();
  const messages = snapshot.docs.map((document) => {
    const stored = document.data() as Partial<CustomerOperationsConversationMessage>;
    return {
      ...stored,
      channel: stored.channel || 'in_app',
      deliveryStatus: stored.deliveryStatus || 'not_applicable',
      deliveryError: stored.deliveryError || null,
      externalMessageId: stored.externalMessageId || null,
    } as CustomerOperationsConversationMessage;
  }).filter((message) => !customerVisibleOnly
    || message.channel !== 'email'
    || message.deliveryStatus === 'sent');
  return messages.reverse();
}

export async function createCustomerOperationsConversation(input: {
  businessId: string;
  customerId: string;
  ticketId: string | null;
  subject: string;
  body: string;
  actorEmail: string;
  requestId?: string;
}): Promise<CustomerOperationsConversation | null> {
  const db = getFirestore(getFirebaseApp());
  const conversationId = input.requestId ? messageOperationId(input.businessId,input.actorEmail,input.requestId) : randomUUID();
  const conversationRef = getCustomerOperationsConversationsCollection().doc(conversationId);
  const messageRef = conversationRef.collection('messages').doc(randomUUID());
  const customerRef = getCustomerOperationsCustomersCollection().doc(input.customerId);
  const ticketRef = input.ticketId ? getCustomerOperationsTicketsCollection().doc(input.ticketId) : null;
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  const requestFingerprint=createHash('sha256').update(JSON.stringify({customerId:input.customerId,ticketId:input.ticketId,subject:input.subject,body:input.body})).digest('hex');

  return db.runTransaction(async (transaction) => {
    const businessSnapshot = await transaction.get(getCustomerOperationsBusinessesCollection().doc(input.businessId));
    const customerSnapshot = await transaction.get(customerRef);
    const ticketSnapshot = ticketRef ? await transaction.get(ticketRef) : null;
    if (!businessSnapshot.exists || (businessSnapshot.data() as CustomerOperationsBusiness).status !== 'active') {
      throw new Error('Business does not exist or is inactive.');
    }
    const customer = customerSnapshot.exists
      ? customerSnapshot.data() as CustomerOperationsCustomer
      : null;
    if (!customer || customer.businessId !== input.businessId) {
      throw new Error('Customer does not exist in this business.');
    }
    let ticket: CustomerOperationsTicket | null = null;
    if (ticketRef) {
      ticket = ticketSnapshot?.exists ? ticketSnapshot.data() as CustomerOperationsTicket : null;
      if (!ticket || ticket.businessId !== input.businessId || ticket.customerId !== input.customerId) {
        throw new Error('Ticket does not belong to this customer and business.');
      }
    }
    const existingConversation = await transaction.get(conversationRef);
    if (existingConversation.exists) {
      if (existingConversation.get('businessId') === input.businessId && existingConversation.get('createdBy') === input.actorEmail && input.requestId && existingConversation.get('requestFingerprint')===requestFingerprint) return publicCustomerOperationsConversation(existingConversation.data() as StoredCustomerOperationsConversation);
      throw new MessagingError(409,'Conversation creation conflicts with an existing request.');
    }

    const conversation: StoredCustomerOperationsConversation = {
      id: conversationId,
      requestFingerprint,
      businessId: input.businessId,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      ticketId: ticket?.id || null,
      ticketIds: ticket ? [ticket.id] : [],
      assignedAgent: '',
      revision:0,
      ticketNumber: ticket?.ticketNumber || null,
      subject: input.subject,
      subjectSearch: input.subject.toLowerCase(),
      status: 'open',
      lastMessagePreview: input.body.slice(0, 180),
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorEmail,
      customerLinkTokenHash: null,
      customerLinkExpiresAt: null,
    };
    const message: CustomerOperationsConversationMessage = {
      id: messageRef.id,
      conversationId,
      authorType: 'staff',
      authorEmail: input.actorEmail,
      visibility: 'customer',
      channel: 'in_app',
      deliveryStatus: 'not_applicable',
      deliveryError: null,
      externalMessageId: null,
      body: input.body,
      createdAt: now,
    };
    if (ticketRef) transaction.create(db.collection('customerOperationsConversationTickets').doc(messageOperationId(input.businessId,conversationId,ticketRef.id)),{businessId:input.businessId,conversationId,ticketId:ticketRef.id,customerId:input.customerId,createdAt:now,createdBy:input.actorEmail});
    transaction.create(conversationRef, conversation);
    transaction.create(messageRef, message);
    transaction.update(customerRef, { updatedAt: now, lastInteractionAt: now });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: customer.id,
      ticketId: ticket?.id || null,
      action: 'conversation_started',
      actorEmail: input.actorEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    if (ticketRef) transaction.update(ticketRef, { updatedAt: now, ...(!ticket?.firstResponseAt ? { firstResponseAt: now } : {}) });
    return publicCustomerOperationsConversation(conversation);
  });
}

export async function listCustomerOperationsConversations(input: {
  businessId: string;
  limit: number;
  cursor?: { updatedAt: string; id: string };
  status?: CustomerOperationsConversationStatus;
  assignedAgent?: string;
  search?:string;
}): Promise<{ items: CustomerOperationsConversation[]; nextCursor: string | null }> {
  if(input.search){
    const search=input.search.trim().toLowerCase();
    let query=getCustomerOperationsConversationsCollection().where('businessId','==',input.businessId).where('subjectSearch','>=',search).where('subjectSearch','<=',search+'\uf8ff').orderBy('subjectSearch').orderBy('id').limit(input.limit+1);
    if(input.status)query=query.where('status','==',input.status);
    if(input.assignedAgent!==undefined)query=query.where('assignedAgent','==',input.assignedAgent);
    if(input.cursor)query=query.startAfter(input.cursor.updatedAt,input.cursor.id);
    const result=await query.get(),items=result.docs.slice(0,input.limit).map(d=>publicCustomerOperationsConversation(d.data() as StoredCustomerOperationsConversation)),last=result.docs[Math.min(result.size,input.limit)-1];
    return {items,nextCursor:result.size>input.limit&&last?Buffer.from(JSON.stringify({updatedAt:last.get('subjectSearch'),id:last.id})).toString('base64url'):null};
  }
  let query = getCustomerOperationsConversationsCollection()
    .where('businessId', '==', input.businessId)
    .orderBy('updatedAt', 'desc')
    .orderBy('id', 'desc');
  if(input.assignedAgent!==undefined)query=query.where('assignedAgent','==',input.assignedAgent) as typeof query;
  if (input.status) query = query.where('status', '==', input.status) as typeof query;
  if (input.cursor) query = query.startAfter(input.cursor.updatedAt, input.cursor.id) as typeof query;
  const snapshot = await query.limit(input.limit + 1).get();
  const documents = snapshot.docs.slice(0, input.limit);
  const items = documents.map((document) =>
    publicCustomerOperationsConversation(document.data() as StoredCustomerOperationsConversation)
  );
  const last = items.at(-1);
  return {
    items,
    nextCursor: snapshot.docs.length > input.limit && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString('base64url')
      : null,
  };
}

export async function loadCustomerOperationsConversation(
  businessId: string,
  conversationId: string
): Promise<{
  conversation: CustomerOperationsConversation;
  messages: CustomerOperationsConversationMessage[];
} | null> {
  const snapshot = await getCustomerOperationsConversationsCollection().doc(conversationId).get();
  if (!snapshot.exists) return null;
  const stored = snapshot.data() as StoredCustomerOperationsConversation;
  if (stored.businessId !== businessId) return null;
  return {
    conversation: publicCustomerOperationsConversation(stored),
    messages: await loadCustomerOperationsConversationMessages(conversationId),
  };
}

export async function addCustomerOperationsConversationMessage(input: {
  businessId: string;
  conversationId: string;
  body: string;
  authorType: 'staff' | 'customer';
  authorEmail: string | null;
  visibility: CustomerOperationsMessageVisibility;
  channel: CustomerOperationsMessageChannel;
  deliveryStatus?: CustomerOperationsMessageDeliveryStatus;
  tokenHash?: string;
  requestId?: string;
  attachmentIds?: string[];
  expectedUpdatedAt?: string;
  expectedRevision?:number;
}): Promise<CustomerOperationsConversationMessage | null> {
  const db = getFirestore(getFirebaseApp());
  const conversationRef = getCustomerOperationsConversationsCollection().doc(input.conversationId);
  const messageRef = conversationRef.collection('messages').doc(input.requestId ? messageOperationId(input.businessId,input.conversationId,input.authorEmail || 'customer',input.requestId) : randomUUID());
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const conversationSnapshot = await transaction.get(conversationRef);
    if (!conversationSnapshot.exists) return null;
    const conversation = conversationSnapshot.data() as StoredCustomerOperationsConversation;
    if (conversation.businessId !== input.businessId
      || (input.tokenHash !== undefined && (
        conversation.customerLinkTokenHash !== input.tokenHash
        || !conversation.customerLinkExpiresAt
        || Date.parse(conversation.customerLinkExpiresAt) <= Date.now()
      ))) {
      return null;
    }
    const duplicate = await transaction.get(messageRef);
    if (duplicate.exists) {
      if (duplicate.get('body') !== input.body || duplicate.get('visibility') !== input.visibility || duplicate.get('channel') !== input.channel || JSON.stringify((duplicate.get('attachments')||[]).map((a:{id:string})=>a.id))!==JSON.stringify(input.attachmentIds||[])) throw new MessagingError(409,'This idempotency key was already used for a different message.');
      return duplicate.data() as CustomerOperationsConversationMessage;
    }
    if(input.expectedRevision!==undefined&&input.expectedRevision!==(conversation.revision||0))throw new MessagingError(409,'Another agent updated this conversation. Review new messages before replying.');
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== conversation.updatedAt) throw new MessagingError(409,'Another agent updated this conversation. Review new messages before replying.');
    const extraIds = linkedTicketIds(conversation).filter(id=>id!==conversation.ticketId);
    const extraSnapshots = await Promise.all(extraIds.map(id=>transaction.get(getCustomerOperationsTicketsCollection().doc(id))));
    if(extraSnapshots.some(t=>!t.exists||t.get('businessId')!==input.businessId||t.get('customerId')!==conversation.customerId))throw new MessagingError(409,'A linked ticket is no longer accessible.');
    const customerRef = getCustomerOperationsCustomersCollection().doc(conversation.customerId);
    const customerSnapshot = await transaction.get(customerRef);
    const ticketRef = conversation.ticketId
      ? getCustomerOperationsTicketsCollection().doc(conversation.ticketId)
      : null;
    const ticketSnapshot = ticketRef ? await transaction.get(ticketRef) : null;
    if (!customerSnapshot.exists
      || (customerSnapshot.data() as CustomerOperationsCustomer).businessId !== input.businessId) {
      return null;
    }
    if (ticketRef && (!ticketSnapshot?.exists
      || (ticketSnapshot.data() as CustomerOperationsTicket).businessId !== input.businessId)) {
      return null;
    }

    const attachmentIds=input.attachmentIds||[];
    if(attachmentIds.length>8||new Set(attachmentIds).size!==attachmentIds.length||attachmentIds.some(id=>!/^[0-9a-f-]{36}$/.test(id)))throw new MessagingError(400,'Choose up to eight valid attachments.');
    const attachmentSnapshots=await Promise.all(attachmentIds.map(id=>transaction.get(db.collection('customerOperationsAttachments').doc(id))));
    const attachmentOwner=input.authorEmail || input.tokenHash;
    if(attachmentSnapshots.some(a=>!a.exists||a.get('businessId')!==input.businessId||a.get('conversationId')!==input.conversationId||a.get('owner')!==attachmentOwner||a.get('visibility')!==input.visibility||a.get('messageId')))throw new MessagingError(404,'An attachment is not available for this message.');
    const message: CustomerOperationsConversationMessage = {
      id: messageRef.id,
      attachments:attachmentSnapshots.map(a=>({id:a.id,name:a.get('name'),mime:a.get('mime'),size:a.get('size')})),
      conversationId: input.conversationId,
      authorType: input.authorType,
      authorEmail: input.authorEmail,
      visibility: input.visibility,
      channel: input.channel,
      deliveryStatus: input.deliveryStatus || 'not_applicable',
      deliveryError: null,
      externalMessageId: null,
      body: input.body,
      createdAt: now,
    };
    const buffered=bufferedTransaction(transaction);
    const ticketSnapshots=[...(ticketSnapshot?.exists?[ticketSnapshot]:[]),...extraSnapshots];
    const updatedTickets=[] as Array<{ref: typeof ticketRef;value:CustomerOperationsTicket;previousStatus:string}>;
    for(const snapshot of ticketSnapshots){
      let value={...snapshot.data()} as CustomerOperationsTicket;
      if(input.authorType==='customer') value=await applyTicketOperations(db,buffered.transaction,value,value,messageRef.id,'customer','customer_reply',now);
      if(input.authorType==='staff'&&input.visibility==='customer'&&input.channel==='in_app'&&!value.firstResponseAt)value.firstResponseAt=now;
      updatedTickets.push({ref:snapshot.ref,value,previousStatus:snapshot.get('status')});
    }
    buffered.flush();
    for(const attachment of attachmentSnapshots)transaction.update(attachment.ref,{messageId:messageRef.id});
    transaction.create(messageRef, message);
    transaction.update(conversationRef, {
      revision:(conversation.revision||0)+1,
      lastMessagePreview: input.body.slice(0, 180),
      updatedAt: now,
      ...(input.authorType === 'customer' ? { status: 'open' } : {}),
    });
    transaction.update(customerRef, { updatedAt: now, lastInteractionAt: now });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: conversation.customerId,
      ticketId: conversation.ticketId,
      action: 'conversation_message_added',
      actorEmail: input.authorEmail || 'customer',
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    for(const item of updatedTickets) if(item.ref){
      transaction.set(item.ref,{...item.value,updatedAt:now});
      if(item.previousStatus!==item.value.status)transaction.create(item.ref.collection('events').doc(messageRef.id),{id:messageRef.id,action:'customer_reply_reopened',actorEmail:'customer',changes:{status:{from:item.previousStatus,to:item.value.status}},createdAt:now});
    }
    return message;
  });
}

export async function updateCustomerOperationsConversationMessageDelivery(input: {
  businessId: string;
  conversationId: string;
  messageId: string;
  status: Extract<CustomerOperationsMessageDeliveryStatus, 'pending' | 'sent' | 'failed'>;
  error?: string | null;
  externalMessageId?: string | null;
}): Promise<CustomerOperationsConversationMessage | null> {
  const db = getFirestore(getFirebaseApp());
  const conversationRef = getCustomerOperationsConversationsCollection().doc(input.conversationId);
  const messageRef = conversationRef.collection('messages').doc(input.messageId);
  return db.runTransaction(async (transaction) => {
    const [conversationSnapshot, messageSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef),
    ]);
    if (!conversationSnapshot.exists
      || (conversationSnapshot.data() as StoredCustomerOperationsConversation).businessId !== input.businessId
      || !messageSnapshot.exists) return null;
    const message = messageSnapshot.data() as CustomerOperationsConversationMessage;
    if (message.channel !== 'email' || message.visibility !== 'customer') return null;
    const next: CustomerOperationsConversationMessage = {
      ...message,
      deliveryStatus: input.status,
      deliveryError: input.status === 'failed' ? input.error || 'Email delivery failed.' : null,
      externalMessageId: input.status === 'sent' ? input.externalMessageId || null : null,
    };
    const ticketId = conversationSnapshot.get('ticketId');
    const ticketRef = ticketId ? getCustomerOperationsTicketsCollection().doc(ticketId) : null;
    const ticketSnapshot = ticketRef && input.status === 'sent' ? await transaction.get(ticketRef) : null;
    if (message.authorType === 'staff' && ticketRef && ticketSnapshot?.exists && ticketSnapshot.get('businessId') === input.businessId && !ticketSnapshot.get('firstResponseAt')) transaction.update(ticketRef, { firstResponseAt: new Date().toISOString() });
    transaction.set(messageRef, next);
    return next;
  });
}

export async function loadCustomerOperationsConversationMessage(
  businessId: string,
  conversationId: string,
  messageId: string
): Promise<CustomerOperationsConversationMessage | null> {
  const conversation = await getCustomerOperationsConversationsCollection().doc(conversationId).get();
  if (!conversation.exists
    || (conversation.data() as StoredCustomerOperationsConversation).businessId !== businessId) return null;
  const message = await getCustomerOperationsConversationsCollection().doc(conversationId)
    .collection('messages').doc(messageId).get();
  return message.exists ? message.data() as CustomerOperationsConversationMessage : null;
}

export async function updateCustomerOperationsConversationStatus(input: {
  businessId: string;
  conversationId: string;
  status: CustomerOperationsConversationStatus;
}): Promise<CustomerOperationsConversation | null> {
  const conversationRef = getCustomerOperationsConversationsCollection().doc(input.conversationId);
  const updatedAt = new Date().toISOString();
  return getFirestore(getFirebaseApp()).runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    if (!snapshot.exists) return null;
    const stored = snapshot.data() as StoredCustomerOperationsConversation;
    if (stored.businessId !== input.businessId) return null;
    const next = { ...stored, status: input.status, updatedAt };
    transaction.set(conversationRef, next);
    return publicCustomerOperationsConversation(next);
  });
}

export async function createCustomerOperationsCallLog(input: {
  businessId: string;
  customerId: string;
  direction: CustomerOperationsCallDirection;
  outcome: CustomerOperationsCallOutcome;
  phoneNumber: string;
  durationSeconds: number;
  summary: string;
  agentEmail: string;
}): Promise<CustomerOperationsCallLog | null> {
  const db = getFirestore(getFirebaseApp());
  const callRef = getCustomerOperationsCallLogsCollection().doc(randomUUID());
  const customerRef = getCustomerOperationsCustomersCollection().doc(input.customerId);
  const activityRef = getCustomerOperationsActivityCollection().doc(randomUUID());
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const businessRef = getCustomerOperationsBusinessesCollection().doc(input.businessId);
    const [businessSnapshot, customerSnapshot] = await Promise.all([
      transaction.get(businessRef),
      transaction.get(customerRef),
    ]);
    if (!businessSnapshot.exists || (businessSnapshot.data() as CustomerOperationsBusiness).status !== 'active') {
      throw new Error('Business does not exist or is inactive.');
    }
    const customer = customerSnapshot.exists
      ? customerSnapshot.data() as CustomerOperationsCustomer
      : null;
    if (!customer || customer.businessId !== input.businessId) {
      throw new Error('Customer does not exist in this business.');
    }
    const call: CustomerOperationsCallLog = {
      id: callRef.id,
      businessId: input.businessId,
      customerId: customer.id,
      customerName: customer.name,
      direction: input.direction,
      outcome: input.outcome,
      phoneNumber: input.phoneNumber || customer.phone || customer.whatsapp,
      durationSeconds: input.durationSeconds,
      summary: input.summary,
      agentEmail: input.agentEmail,
      createdAt: now,
    };
    transaction.create(callRef, call);
    transaction.update(customerRef, { updatedAt: now, lastInteractionAt: now });
    transaction.create(activityRef, {
      id: activityRef.id,
      businessId: input.businessId,
      customerId: customer.id,
      ticketId: null,
      action: 'call_logged',
      actorEmail: input.agentEmail,
      createdAt: now,
    } satisfies CustomerOperationsActivity);
    return call;
  });
}

export async function listCustomerOperationsCallLogs(input: {
  businessId: string;
  customerId?: string;
  limit: number;
}): Promise<CustomerOperationsCallLog[]> {
  let query = getCustomerOperationsCallLogsCollection()
    .where('businessId', '==', input.businessId)
    .orderBy('createdAt', 'desc');
  if (input.customerId) query = query.where('customerId', '==', input.customerId) as typeof query;
  const snapshot = await query.limit(input.limit).get();
  return snapshot.docs.map((document) => document.data() as CustomerOperationsCallLog);
}

export async function setCustomerOperationsConversationCustomerLink(input: {
  businessId: string;
  conversationId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<CustomerOperationsConversation | null> {
  const conversationRef = getCustomerOperationsConversationsCollection().doc(input.conversationId);
  return getFirestore(getFirebaseApp()).runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    if (!snapshot.exists) return null;
    const stored = snapshot.data() as StoredCustomerOperationsConversation;
    if (stored.businessId !== input.businessId) return null;
    const next = {
      ...stored,
      customerLinkTokenHash: input.tokenHash,
      customerLinkExpiresAt: input.expiresAt,
    };
    transaction.set(conversationRef, next);
    return publicCustomerOperationsConversation(next);
  });
}

export async function revokeCustomerOperationsConversationCustomerLink(input: {
  businessId: string;
  conversationId: string;
}): Promise<boolean> {
  const conversationRef = getCustomerOperationsConversationsCollection().doc(input.conversationId);
  return getFirestore(getFirebaseApp()).runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    if (!snapshot.exists) return false;
    const stored = snapshot.data() as StoredCustomerOperationsConversation;
    if (stored.businessId !== input.businessId) return false;
    transaction.update(conversationRef, {
      customerLinkTokenHash: null,
      customerLinkExpiresAt: null,
    });
    return true;
  });
}

export async function loadCustomerOperationsConversationByTokenHash(
  tokenHash: string
): Promise<{
  conversation: CustomerOperationsConversation;
  messages: CustomerOperationsConversationMessage[];
} | null> {
  const snapshot = await getCustomerOperationsConversationsCollection()
    .where('customerLinkTokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const stored = snapshot.docs[0].data() as StoredCustomerOperationsConversation;
  if (!stored.customerLinkExpiresAt || Date.parse(stored.customerLinkExpiresAt) <= Date.now()) return null;
  const [business, customer] = await Promise.all([
    loadCustomerOperationsBusiness(stored.businessId),
    loadCustomerOperationsCustomer(stored.businessId, stored.customerId),
  ]);
  if (!business || business.status !== 'active' || !customer || customer.status !== 'active') return null;
  return {
    conversation: publicCustomerOperationsConversation(stored),
    messages: await loadCustomerOperationsConversationMessages(stored.id, true),
  };
}
// Project only fields needed by the report; never load customer identities,
// descriptions, notes, messages or link tokens for analytics.
export async function loadCustomerOperationsReportTickets(
  businessId: string,
  range: { start: string; endExclusive: string }
): Promise<import('./customerOperationsReporting.js').ReportTicket[]> {
  const snapshot = await getCustomerOperationsTicketsCollection()
    .where('businessId', '==', businessId)
    .where('createdAt', '>=', range.start)
    .where('createdAt', '<', range.endExclusive)
    .orderBy('createdAt', 'asc')
    .select('businessId', 'createdAt', 'status', 'priority', 'assignedAgent', 'source', 'category', 'firstResponseAt', 'resolvedAt', 'slaTargetAt', 'reopenCount')
    .limit(5001).get();
  return snapshot.docs.map(doc => doc.data() as import('./customerOperationsReporting.js').ReportTicket);
}

export async function loadCustomerOperationsReportFeedback(businessId:string,range:{start:string;endExclusive:string}):Promise<import('./customerOperationsReporting.js').ReportFeedback[]> {
  const snapshot=await getCustomerOperationsBusinessesCollection().doc(businessId).collection('surveys')
    .where('createdAt','>=',range.start).where('createdAt','<',range.endExclusive)
    .orderBy('createdAt').select('score','resolved','submittedAt').limit(5001).get();
  return snapshot.docs.map(doc=>doc.data());
}
