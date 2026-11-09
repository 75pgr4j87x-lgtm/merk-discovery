import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  StoredSubmission,
  buildSubmissionsExcelWorkbook,
  buildSingleClientExcel,
  sendBetaDeskEmail,
  sendAdminInvitationEmail,
  sendBriefCopyEmail,
  DEFAULT_FOUNDER_EMAIL,
} from './serverEmailAndExcel.js';
import {
  deleteSubmission,
  deleteStudioInvite,
  claimStudioAdminInviteLink,
  loadStudioAdminInviteLinks,
  revokeStudioAdminInviteLink,
  saveStudioAdminInviteLink,
  addBetaDeskComment,
  claimBetaDeskTesterName,
  consumeBetaDeskRateLimit,
  createBetaDeskProject,
  createBetaDeskTester,
  createBetaDeskTicket,
  createBetaDeskUploadGrant,
  deleteBetaDeskTester,
  completeBetaDeskUploadGrant,
  completeBetaDeskDriveAuthorization,
  createBetaDeskDriveAuthorizationUrl,
  getBetaDeskAttachmentChunk,
  getStudioAuth,
  loadBetaDeskAdmin,
  loadBetaDeskAdmins,
  loadBetaDeskDriveConnectionStatus,
  loadBetaDeskComments,
  loadBetaDeskProject,
  loadBetaDeskProjects,
  loadBetaDeskTicket,
  loadBetaDeskTickets,
  loadBetaDeskTicketsForTester,
  loadBetaDeskTester,
  loadBetaDeskTesterByTokenHash,
  loadBetaDeskTesters,
  loadStudioInvite,
  findProjectByShareTokenHash,
  loadStudioInvites,
  loadOutbox,
  loadStudioProject,
  loadSubmissions,
  purgeClientDataByEmail,
  saveOutboxEntry,
  saveStudioInvite,
  saveStudioProject,
  saveSubmission,
  saveBetaDeskNotification,
  saveBetaDeskAdmin,
  type ProjectComment,
  type ProjectTask,
  type StudioProject,
  type StudioAdminInviteLink,
  type BetaDeskCategory,
  type BetaDeskPriority,
  type BetaDeskStatus,
  revokeBetaDeskTester,
  removeBetaDeskAdmin,
  verifyBetaDeskUploadGrant,
  updateBetaDeskTicket,
  createCustomerOperationsBusiness,
  addCustomerOperationsCustomerNote,
  addCustomerOperationsTicketNote,
  createCustomerOperationsCustomer,
  createCustomerOperationsTicket,
  deactivateCustomerOperationsBusinessMembership,
  deactivateCustomerOperationsPlatformMembership,
  loadCustomerOperationsBusiness,
  loadCustomerOperationsBusinessMemberships,
  loadCustomerOperationsBusinesses,
  loadCustomerOperationsBusinessMembers,
  loadCustomerOperationsCustomer,
  loadCustomerOperationsTicket,
  listCustomerOperationsCustomerActivity,
  listCustomerOperationsCustomerNotes,
  listCustomerOperationsCustomers,
  listCustomerOperationsTicketEvents,
  listCustomerOperationsTicketNotes,
  listCustomerOperationsTickets,
  loadCustomerOperationsPlatformMembership,
  loadCustomerOperationsPlatformMemberships,
  saveCustomerOperationsBusinessMembership,
  saveCustomerOperationsPlatformMembership,
  updateCustomerOperationsCustomer,
  updateCustomerOperationsTicket,
} from './serverStore.js';
import type {
  CustomerOperationsCustomerStatus,
  CustomerOperationsBusinessRole,
  CustomerOperationsPlatformRole,
  CustomerOperationsTicketPriority,
  CustomerOperationsTicketSource,
  CustomerOperationsTicketStatus,
} from './src/types/customerOperations.js';
import {
  sanitizeSubmissionPayload,
  sanitizeEmail,
  sanitizePlainText,
} from './src/utils/sanitizer.js';

dotenv.config();

const app = express();
const ownerEmail = process.env.STUDIO_OWNER_EMAIL?.trim().toLowerCase() || null;

  // OWASP Top 10 Security Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  const verifyStudioIdentity = async (req: express.Request, res: express.Response) => {
    if (!ownerEmail) {
      res.status(503).json({ error: 'Studio Super Admin is not configured on the server.' });
      return null;
    }
    const authorization = req.get('authorization') || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Studio sign-in required.' });
      return null;
    }
    try {
      const decodedToken = await getStudioAuth().verifyIdToken(token);
      const email = (decodedToken.email || '').trim().toLowerCase();
      if (!email || !decodedToken.email_verified) {
        res.status(403).json({ error: 'A verified Google email is required for Studio access.' });
        return null;
      }
      const isOwner = Boolean(ownerEmail && email === ownerEmail);
      const invite = isOwner ? null : await loadStudioInvite(email);
      return { isOwner, role: isOwner ? 'super_admin' as const : invite?.role || null, email, uid: decodedToken.uid };
    } catch {
      res.status(401).json({ error: 'Invalid or expired studio sign-in.' });
      return null;
    }
  };

  const verifyCustomerOperationsIdentity = async (req: express.Request, res: express.Response) => {
    if (!ownerEmail) {
      res.status(503).json({ error: 'Customer Operations platform administrator is not configured.' });
      return null;
    }
    const token = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Sign-in is required.' });
      return null;
    }
    let decodedToken: { email?: string; email_verified?: boolean; uid: string };
    try {
      decodedToken = await getStudioAuth().verifyIdToken(token);
    } catch (error) {
      console.error('Failed to verify Customer Operations identity token:', error);
      res.status(401).json({ error: 'Invalid or expired sign-in.' });
      return null;
    }
    const email = (decodedToken.email || '').trim().toLowerCase();
    if (!email || !decodedToken.email_verified) {
      res.status(403).json({ error: 'A verified email address is required.' });
      return null;
    }
    const isPlatformSuperAdmin = email === ownerEmail;
    try {
      const platformMembership = isPlatformSuperAdmin
        ? null
        : await loadCustomerOperationsPlatformMembership(email);
      const platformRole = isPlatformSuperAdmin ? 'platform_super_admin' as const : platformMembership?.role || null;
      const businesses = platformRole ? [] : await loadCustomerOperationsBusinessMemberships(email);
      return {
        email,
        uid: decodedToken.uid,
        isPlatformSuperAdmin,
        platformRole,
        businesses,
      };
    } catch (error) {
      console.error('Failed to load Customer Operations memberships:', error);
      res.status(503).json({ error: 'Could not verify Customer Operations access. Please retry.' });
      return null;
    }
  };

  const requireCustomerOperationsSuperAdmin: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyCustomerOperationsIdentity(req, res);
    if (!identity) return;
    if (!identity.isPlatformSuperAdmin) {
      res.status(403).json({ error: 'Only the Platform Super Admin can manage platform settings.' });
      return;
    }
    res.locals.customerOperationsEmail = identity.email;
    next();
  };

  const requireCustomerOperationsBusinessManagement: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyCustomerOperationsIdentity(req, res);
    if (!identity) return;
    if (identity.isPlatformSuperAdmin) {
      res.locals.customerOperationsEmail = identity.email;
      next();
      return;
    }
    const membership = identity.businesses.find((item) => item.businessId === req.params.businessId);
    if (membership?.role !== 'business_owner') {
      res.status(403).json({ error: 'Business owner access is required for this operation.' });
      return;
    }
    res.locals.customerOperationsEmail = identity.email;
    next();
  };

  const requireCustomerOperationsBusinessAccess: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyCustomerOperationsIdentity(req, res);
    if (!identity) return;
    if (identity.isPlatformSuperAdmin || identity.platformRole) {
      res.status(403).json({ error: 'Platform roles do not grant access to private business customer data.' });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(req.params.businessId || '')) {
      res.status(404).json({ error: 'Business workspace not found.' });
      return;
    }
    const membership = identity.businesses.find((item) => item.businessId === req.params.businessId);
    if (!membership) {
      res.status(404).json({ error: 'Business workspace not found.' });
      return;
    }
    res.locals.customerOperationsEmail = identity.email;
    res.locals.customerOperationsBusinessRole = membership.role;
    next();
  };

  const requireStudioAccess: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    if (identity.isOwner || identity.role) {
      res.locals.studioRole = identity.role;
      next();
      return;
    }
    res.status(403).json({ error: 'This verified Google account has not been invited to Studio.' });
  };

  const requireStudioProjectEditor: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    if (identity.isOwner || identity.role === 'admin' || identity.role === 'project_manager') {
      res.locals.studioRole = identity.role;
      next();
      return;
    }
    res.status(403).json({ error: 'Your Studio role does not allow project edits.' });
  };

  const requireStudioAdmin: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    if (identity.isOwner || identity.role === 'admin') {
      res.locals.studioRole = identity.role;
      res.locals.studioEmail = identity.email;
      next();
      return;
    }
    res.status(403).json({ error: 'Your Studio role does not allow this action.' });
  };

  const verifyBetaDeskIdentity = async (req: express.Request, res: express.Response) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return null;
    const isStudioAdmin = identity.isOwner || identity.role === 'admin';
    let isBetaDeskAdmin = false;
    if (!isStudioAdmin) {
      try {
        isBetaDeskAdmin = Boolean((await loadBetaDeskAdmin(identity.email))?.active);
      } catch (error) {
        console.error('Failed to verify BetaDesk admin access:', error);
        res.status(503).json({ error: 'Could not verify BetaDesk access. Refresh the page and try again.' });
        return null;
      }
    }
    return {
      email: identity.email,
      uid: identity.uid,
      isStudioSuperAdmin: identity.isOwner,
      isStudioAdmin,
      isBetaDeskAdmin,
    };
  };

  const requireBetaDeskAdmin: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyBetaDeskIdentity(req, res);
    if (!identity) return;
    if (!identity.isStudioSuperAdmin && !identity.isStudioAdmin && !identity.isBetaDeskAdmin) {
      res.status(403).json({ error: 'This Google account has not been granted BetaDesk admin access.' });
      return;
    }
    res.locals.betaDeskEmail = identity.email;
    res.locals.studioEmail = identity.email;
    res.locals.betaDeskUid = identity.uid;
    next();
  };

  const requireStudioSuperAdmin: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyBetaDeskIdentity(req, res);
    if (!identity) return;
    if (!identity.isStudioSuperAdmin) {
      res.status(403).json({ error: 'Only the Studio Super Admin can connect Google Drive for BetaDesk.' });
      return;
    }
    res.locals.betaDeskEmail = identity.email;
    res.locals.betaDeskUid = identity.uid;
    next();
  };

  const requireStudioOwnerAccess: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    if (identity.isOwner) {
      res.locals.studioEmail = identity.email;
      next();
      return;
    }
    res.status(403).json({ error: 'Only the Studio owner can manage invitations.' });
  };

  const betaDeskCategories: BetaDeskCategory[] = [
    'Bug Report',
    'Feature Request',
    'General Feedback',
    'UI/UX Improvement',
    'Technical Issue',
    'Other',
  ];
  const betaDeskPriorities: BetaDeskPriority[] = ['Critical', 'High', 'Medium', 'Low'];
  const betaDeskStatuses: BetaDeskStatus[] = [
    'Open',
    'Under Review',
    'In Progress',
    'Awaiting User Response',
    'Resolved',
    'Closed',
  ];
  const hashBetaDeskToken = (token: string) => createHash('sha256').update(token).digest('hex');
  const betaDeskAppBaseUrl = (req?: express.Request) => {
    const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
    const configuredUrl = process.env.VERCEL_ENV === 'preview'
      ? deploymentUrl || process.env.PUBLIC_APP_URL
      : process.env.PUBLIC_APP_URL || deploymentUrl;
    const requestHost = req?.get('host') || '';
    const localUrl = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost)
      ? `http://${requestHost}`
      : null;
    const baseUrl = configuredUrl || localUrl;
    if (!baseUrl) throw new Error('PUBLIC_APP_URL must be configured for BetaDesk tester links.');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('PUBLIC_APP_URL must use HTTPS.');
    }
    return url;
  };
  const studioAccessUrl = (req: express.Request, path: string) => {
    const branchUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : null;
    return new URL(path, branchUrl || betaDeskAppBaseUrl(req)).toString();
  };
  const betaDeskPublicUrl = (req: express.Request, token: string) => {
    const url = betaDeskAppBaseUrl(req);
    const shareUrl = new URL('/feedback/tester', url);
    shareUrl.hash = `tester=${encodeURIComponent(token)}`;
    return shareUrl.toString();
  };
  const recordBetaDeskEmail = async (
    ticketNumber: string,
    recipient: string,
    notificationType: 'admin_new_ticket',
    subject: string,
    text: string
  ) => {
    const notificationId = randomUUID();
    let deliveryStatus: 'sent' | 'recorded' | 'failed' = 'failed';
    let errorMessage: string | undefined;
    try {
      deliveryStatus = await sendBetaDeskEmail({ recipient, subject, text });
    } catch (error) {
      console.error(`BetaDesk email delivery failed for ${recipient}:`, error);
      errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.';
    }
    try {
      await saveBetaDeskNotification({
        id: notificationId,
        ticketNumber,
        recipient,
        notificationType,
        deliveryStatus,
        createdAt: new Date().toISOString(),
        ...(errorMessage ? { errorMessage } : {}),
      });
    } catch (error) {
      console.error(`Failed to store BetaDesk notification log for ${recipient}:`, error);
    }
    return deliveryStatus;
  };
  const betaDeskTesterToken = (req: express.Request) => {
    const token = (req.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{40,60})$/i)?.[1];
    return token || null;
  };
  const betaDeskProjectFromRequest = (req: express.Request, res: express.Response) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (!projectId || projectId.length > 80) {
      res.status(400).json({ error: 'Choose a project to access this BetaDesk feature.' });
      return null;
    }
    return projectId;
  };

  app.get('/api/betadesk/admin/access', async (req, res) => {
    const identity = await verifyBetaDeskIdentity(req, res);
    if (!identity) return;
    return res.json({
      allowed: identity.isStudioSuperAdmin || identity.isStudioAdmin || identity.isBetaDeskAdmin,
      canManageAdmins: identity.isStudioSuperAdmin,
      email: identity.email,
    });
  });

  app.post('/api/betadesk/admin/drive/connect', requireStudioSuperAdmin, async (_req, res) => {
    try {
      const authorizationUrl = await createBetaDeskDriveAuthorizationUrl(
        res.locals.betaDeskEmail,
        res.locals.betaDeskUid
      );
      return res.json({ authorizationUrl });
    } catch (error) {
      console.error('Failed to start BetaDesk Google Drive authorization:', error);
      return res.status(503).json({ error: error instanceof Error ? error.message : 'Could not connect Google Drive.' });
    }
  });

  app.get('/api/betadesk/admin/drive/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const providerError = typeof req.query.error === 'string' ? req.query.error : '';
    const requestHost = req.get('host') || '';
    const localBase = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost) ? `http://${requestHost}` : null;
    const appBase = process.env.PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : localBase);
    if (!appBase) return res.status(503).send('BetaDesk callback URL is not configured.');
    const settingsUrl = new URL('/studio', appBase);
    if (providerError || !code || !state) {
      settingsUrl.searchParams.set('drive', 'error');
      return res.redirect(settingsUrl.toString());
    }
    try {
      const result = await completeBetaDeskDriveAuthorization(code, state, ownerEmail || '');
      if (result.email !== ownerEmail) throw new Error('Drive authorization must use the Studio Super Admin account.');
      settingsUrl.searchParams.set('drive', 'connected');
      return res.redirect(settingsUrl.toString());
    } catch (error) {
      console.error('BetaDesk Google Drive authorization failed:', error);
      settingsUrl.searchParams.set('drive', 'error');
      return res.redirect(settingsUrl.toString());
    }
  });

  app.get('/api/betadesk/admin/projects', requireBetaDeskAdmin, async (_req, res) => {
    try {
      return res.json(await loadBetaDeskProjects());
    } catch (error) {
      console.error('Failed to load BetaDesk projects:', error);
      return res.status(500).json({ error: 'Could not load projects.' });
    }
  });

  app.post('/api/betadesk/admin/projects', requireBetaDeskAdmin, async (req, res) => {
    const name = sanitizePlainText(req.body?.name, 100);
    const description = sanitizePlainText(req.body?.description, 500);
    if (name.length < 2) return res.status(400).json({ error: 'Enter a project name.' });
    try {
      const project = await createBetaDeskProject(name, description, res.locals.betaDeskEmail || 'BetaDesk admin');
      return res.status(201).json(project);
    } catch (error) {
      console.error('Failed to create BetaDesk project:', error);
      return res.status(500).json({ error: 'Could not create project.' });
    }
  });

  app.post('/api/betadesk/admin/testers', requireBetaDeskAdmin, async (req, res) => {
    const projectId = sanitizePlainText(req.body?.projectId, 80);
    if (!projectId) return res.status(400).json({ error: 'Choose a project for this tester link.' });
    try {
      const project = await loadBetaDeskProject(projectId);
      if (!project?.active || project.id === 'legacy') {
        return res.status(400).json({ error: 'Choose an active project for this tester link.' });
      }
      const token = randomBytes(32).toString('base64url');
      const tester = await createBetaDeskTester(hashBetaDeskToken(token), projectId);
      return res.status(201).json({
        tester,
        shareUrl: betaDeskPublicUrl(req, token),
      });
    } catch (error) {
      console.error('Failed to create BetaDesk tester link:', error);
      return res.status(500).json({ error: 'Could not create a tester link.' });
    }
  });

  app.get('/api/betadesk/admin/testers', requireBetaDeskAdmin, async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (!projectId) return res.status(400).json({ error: 'Choose a project to load tester profiles.' });
    try {
      const project = await loadBetaDeskProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const [testers, tickets] = await Promise.all([loadBetaDeskTesters(), loadBetaDeskTickets()]);
      const projectTickets = tickets.filter((ticket) => ticket.projectId === projectId);
      const projectTesterIds = new Set(projectTickets.map((ticket) => ticket.testerId));
      return res.json(testers
        .filter((tester) => tester.projectId === projectId || (!tester.projectId && projectTesterIds.has(tester.id)))
        .map((tester) => ({
        ...tester,
        ticketCount: projectTickets.filter((ticket) => ticket.testerId === tester.id).length,
      })));
    } catch (error) {
      console.error('Failed to load BetaDesk testers:', error);
      return res.status(500).json({ error: 'Could not load tester profiles.' });
    }
  });

  const loadBetaDeskTesterForProject = async (testerId: string, projectId: string) => {
    const tester = await loadBetaDeskTester(testerId);
    if (!tester || (tester.projectId && tester.projectId !== projectId)) return null;
    if (!tester.projectId) {
      const tickets = await loadBetaDeskTicketsForTester(testerId);
      if (!tickets.some((ticket) => ticket.projectId === projectId)) return null;
    }
    return tester;
  };

  app.post('/api/betadesk/admin/testers/:testerId/revoke', requireBetaDeskAdmin, async (req, res) => {
    const testerId = req.params.testerId;
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    if (!/^[0-9a-f-]{36}$/i.test(testerId)) return res.status(400).json({ error: 'Invalid tester profile.' });
    try {
      const tester = await loadBetaDeskTesterForProject(testerId, projectId);
      if (!tester) return res.status(404).json({ error: 'Tester profile not found.' });
      const revoked = await revokeBetaDeskTester(testerId);
      if (!revoked) return res.status(404).json({ error: 'Tester profile not found.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke BetaDesk tester link:', error);
      return res.status(500).json({ error: 'Could not revoke this tester link.' });
    }
  });

  app.delete('/api/betadesk/admin/testers/:testerId', requireBetaDeskAdmin, async (req, res) => {
    const testerId = req.params.testerId;
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    if (!/^[0-9a-f-]{36}$/i.test(testerId)) return res.status(400).json({ error: 'Invalid tester profile.' });
    try {
      const tester = await loadBetaDeskTesterForProject(testerId, projectId);
      if (!tester) return res.status(404).json({ error: 'Tester profile not found in this project.' });
      const deleted = await deleteBetaDeskTester(testerId);
      if (!deleted) return res.status(404).json({ error: 'Tester profile not found.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete BetaDesk tester profile:', error);
      return res.status(500).json({ error: 'Could not delete this tester profile.' });
    }
  });

  app.get('/api/betadesk/tester', async (req, res) => {
    const token = betaDeskTesterToken(req);
    if (!token) {
      return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const tickets = tester.displayName ? await loadBetaDeskTicketsForTester(tester.id) : [];
      return res.json({ tester, tickets });
    } catch (error) {
      console.error('Failed to load BetaDesk tester portal:', error);
      return res.status(500).json({ error: 'Could not load this tester profile.' });
    }
  });

  app.get('/api/betadesk/tester/projects', async (req, res) => {
    const token = betaDeskTesterToken(req);
    if (!token) return res.status(401).json({ error: 'Tester link required.' });
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const allProjects = await loadBetaDeskProjects();
      const projects = allProjects
        .filter((project) => project.active && project.id !== 'legacy' && (
          !tester.projectId || project.id === tester.projectId
        ))
        .map(({ id, name, description, active, createdAt }) => ({ id, name, description, active, createdAt }));
      return res.json(projects);
    } catch (error) {
      console.error('Failed to load tester project list:', error);
      return res.status(500).json({ error: 'Could not load projects.' });
    }
  });

  app.post('/api/betadesk/tester/profile', async (req, res) => {
    const token = betaDeskTesterToken(req);
    const displayName = sanitizePlainText(req.body?.displayName, 100);
    if (!token || displayName.length < 1) {
      return res.status(400).json({ error: 'Enter your name to activate this tester link.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const claimed = await claimBetaDeskTesterName(tester.id, displayName);
      if (!claimed) return res.status(404).json({ error: 'This tester profile is unavailable.' });
      return res.json({ tester: claimed, tickets: await loadBetaDeskTicketsForTester(claimed.id) });
    } catch (error) {
      console.error('Failed to claim BetaDesk tester name:', error);
      return res.status(500).json({ error: 'Could not save your name.' });
    }
  });

  app.post('/api/betadesk/tester/uploads', async (req, res) => {
    const token = betaDeskTesterToken(req);
    if (!token) return res.status(401).json({ error: 'Tester link required.' });
    const fileName = sanitizePlainText(req.body?.fileName, 120).replace(/[\\/]/g, '_');
    const contentType = sanitizePlainText(req.body?.contentType, 100).toLowerCase();
    const size = Number(req.body?.size);
    if (!fileName || !Number.isSafeInteger(size) || size < 1) {
      return res.status(400).json({ error: 'Provide a valid file name, type, and size.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      if (!await consumeBetaDeskRateLimit(`uploads_${tester.id}`, 10, 60 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many upload links requested. Try again later.' });
      }
      const upload = await createBetaDeskUploadGrant(tester.id, fileName, contentType, size);
      return res.status(201).json(upload);
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Google Drive')
        || error.message.includes('BETADESK_OAUTH_TOKEN_ENCRYPTION_KEY')
      )) {
        return res.status(503).json({ error: 'File uploads are not configured on this server.' });
      }
      console.error('Failed to create a BetaDesk upload grant:', error);
      return res.status(500).json({ error: 'Could not prepare this upload.' });
    }
  });

  app.post('/api/betadesk/tester/uploads/:uploadId/complete', async (req, res) => {
    const token = betaDeskTesterToken(req);
    if (!token) return res.status(401).json({ error: 'Tester link required.' });
    const { uploadId } = req.params;
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !fileId) {
      return res.status(400).json({ error: 'Invalid attachment upload.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const attachment = await completeBetaDeskUploadGrant(tester.id, uploadId, fileId);
      if (!attachment) return res.status(400).json({ error: 'The uploaded file could not be verified.' });
      return res.json({ attachment });
    } catch (error) {
      console.error('Failed to verify BetaDesk Drive upload:', error);
      return res.status(500).json({ error: 'Could not verify this attachment.' });
    }
  });

  app.post('/api/betadesk/tester/tickets', async (req, res) => {
    const token = betaDeskTesterToken(req);
    const subject = sanitizePlainText(req.body?.subject, 150);
    const description = sanitizePlainText(req.body?.description, 5000);
    const category = req.body?.category as BetaDeskCategory;
    const platform = sanitizePlainText(req.body?.platform, 80);
    const appVersion = sanitizePlainText(req.body?.appVersion, 80);
    const deviceModel = sanitizePlainText(req.body?.deviceModel, 120);
    const operatingSystem = sanitizePlainText(req.body?.operatingSystem, 120);
    const projectId = sanitizePlainText(req.body?.projectId, 80);
    const attachmentIds = req.body?.attachments;
    const idempotencyHeader = req.get('Idempotency-Key') || '';
    if (
      !token
      || subject.length < 3
      || description.length < 10
      || !projectId
      || !Array.isArray(attachmentIds)
      || attachmentIds.length > 8
      || attachmentIds.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
      || !betaDeskCategories.includes(category)
      || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyHeader)
    ) {
      return res.status(400).json({ error: 'Complete the required fields with valid values and retry.' });
    }

    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      if (!tester.displayName) return res.status(409).json({ error: 'Save your name before submitting feedback.' });
      const project = await loadBetaDeskProject(projectId);
      if (!project?.active || project.id === 'legacy') {
        return res.status(400).json({ error: 'Select an active beta-testing project.' });
      }
      if (tester.projectId && tester.projectId !== projectId) {
        return res.status(403).json({ error: 'This tester link is assigned to a different project.' });
      }
      if (!await consumeBetaDeskRateLimit(`tester_${tester.id}`, 10, 60 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
      }

      const uniqueAttachmentIds = [...new Set(attachmentIds as string[])];
      if (uniqueAttachmentIds.length !== attachmentIds.length) {
        return res.status(400).json({ error: 'An attachment was selected more than once.' });
      }
      const attachments = await Promise.all(uniqueAttachmentIds.map(async (uploadId) => {
        const attachment = await verifyBetaDeskUploadGrant(tester.id, uploadId);
        if (!attachment) throw new Error('An attachment is invalid, expired, or could not be verified.');
        return attachment;
      }));
      if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) {
        return res.status(400).json({ error: 'Attachments cannot exceed 100 MB total per ticket.' });
      }

      const now = new Date().toISOString();
      const result = await createBetaDeskTicket(
        {
          id: '',
          projectId,
          testerId: tester.id,
          subject,
          description,
          category,
          priority: 'Medium',
          status: 'Open',
          submitterName: tester.displayName,
          platform,
          appVersion,
          deviceModel,
          operatingSystem,
          attachments,
          assignedTo: '',
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
        createHash('sha256').update(`${tester.id}\u0000${idempotencyHeader}`).digest('hex')
      );

      const adminEmails = new Set<string>();
      if (ownerEmail) adminEmails.add(ownerEmail);
      for (const admin of await loadBetaDeskAdmins()) {
        if (admin.active) adminEmails.add(admin.email.toLowerCase());
      }
      const notificationResults = await Promise.all([...adminEmails].map((recipient) => recordBetaDeskEmail(
        result.ticket.ticketNumber,
        recipient,
        'admin_new_ticket',
        `New BetaDesk ticket ${result.ticket.ticketNumber}: ${subject}`,
        `${tester.displayName} submitted a ${category}.\n\n${description}\n\nReview: ${new URL('/studio/beta-feedback', betaDeskAppBaseUrl()).toString()}`
      )));
      return res.status(result.duplicate ? 200 : 201).json({
        ticket: result.ticket,
        duplicate: result.duplicate,
        notifications: notificationResults,
      });
    } catch (error) {
      console.error('Failed to create BetaDesk ticket:', error);
      return res.status(500).json({ error: 'Could not create the ticket. Please retry shortly.' });
    }
  });

  app.get('/api/betadesk/tester/tickets/:ticketNumber', async (req, res) => {
    const token = betaDeskTesterToken(req);
    const ticketNumber = req.params.ticketNumber;
    if (!token || !/^BETA-\d+$/.test(ticketNumber)) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const ticket = await loadBetaDeskTicket(ticketNumber);
      if (!ticket || ticket.testerId !== tester.id) return res.status(404).json({ error: 'Ticket not found.' });
      const comments = await loadBetaDeskComments(ticketNumber, false);
      return res.json({ ticket, comments });
    } catch (error) {
      console.error('Failed to load tester ticket details:', error);
      return res.status(500).json({ error: 'Could not load this ticket.' });
    }
  });

  app.get('/api/betadesk/tester/tickets/:ticketNumber/attachments/:uploadId', async (req, res) => {
    const token = betaDeskTesterToken(req);
    if (!token) return res.status(401).json({ error: 'Tester link required.' });
    const range = (req.get('range') || '').match(/^bytes=(\d+)-(\d+)$/);
    if (!range) return res.status(416).json({ error: 'A valid byte range is required.' });
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start + 1 > 4 * 1024 * 1024) {
      return res.status(416).json({ error: 'Requested byte range is too large or invalid.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const attachment = await getBetaDeskAttachmentChunk(tester.id, req.params.ticketNumber, req.params.uploadId, start, end);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
      res.set({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        'Content-Length': String(attachment.data.length),
        'Content-Range': `bytes ${start}-${end}/${attachment.size}`,
        'Content-Type': attachment.contentType,
      });
      return res.status(206).send(attachment.data);
    } catch (error) {
      console.error('Failed to prepare tester attachment download:', error);
      return res.status(500).json({ error: 'Could not access this attachment.' });
    }
  });

  app.post('/api/betadesk/tester/tickets/:ticketNumber/comments', async (req, res) => {
    const token = betaDeskTesterToken(req);
    const ticketNumber = req.params.ticketNumber;
    const message = sanitizePlainText(req.body?.message, 3000);
    if (!token || !/^BETA-\d+$/.test(ticketNumber) || message.length < 2) {
      return res.status(400).json({ error: 'Enter a message and use your tester link.' });
    }
    try {
      const tester = await loadBetaDeskTesterByTokenHash(hashBetaDeskToken(token));
      if (!tester) return res.status(404).json({ error: 'This tester link is invalid or revoked.' });
      const ticket = await loadBetaDeskTicket(ticketNumber);
      if (!ticket || ticket.testerId !== tester.id) return res.status(404).json({ error: 'Ticket not found.' });
      if (ticket.status === 'Closed') return res.status(409).json({ error: 'This ticket is closed.' });
      const comment = await addBetaDeskComment(ticketNumber, {
        authorType: 'tester',
        authorName: tester.displayName,
        message,
        visibility: 'public',
      });
      if (!comment) return res.status(404).json({ error: 'Ticket not found.' });

      const adminEmails = new Set<string>();
      if (ownerEmail) adminEmails.add(ownerEmail);
      for (const admin of await loadBetaDeskAdmins()) {
        if (admin.active) adminEmails.add(admin.email.toLowerCase());
      }
      const notificationResults = await Promise.all([...adminEmails].map((recipient) => recordBetaDeskEmail(
        ticketNumber,
        recipient,
        'admin_new_ticket',
        `Tester replied to ${ticketNumber}`,
        `${tester.displayName} replied:\n\n${message}\n\nReview: ${new URL('/studio/beta-feedback', betaDeskAppBaseUrl()).toString()}`
      )));
      return res.status(201).json({ comment, notifications: notificationResults });
    } catch (error) {
      console.error('Failed to add tester comment:', error);
      return res.status(500).json({ error: 'Could not send your reply.' });
    }
  });

  app.get('/api/betadesk/admin/tickets', requireBetaDeskAdmin, async (req, res) => {
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    try {
      await loadBetaDeskProjects();
      const project = await loadBetaDeskProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const tickets = await loadBetaDeskTickets();
      return res.json(tickets.filter((ticket) => ticket.projectId === projectId));
    } catch (error) {
      console.error('Failed to load BetaDesk tickets:', error);
      return res.status(500).json({ error: 'Could not load tickets.' });
    }
  });

  app.get('/api/betadesk/admin/tickets/:ticketNumber', requireBetaDeskAdmin, async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    if (!/^BETA-\d+$/.test(ticketNumber)) return res.status(400).json({ error: 'Invalid ticket reference.' });
    try {
      const ticket = await loadBetaDeskTicket(ticketNumber);
      if (!ticket || ticket.projectId !== projectId) return res.status(404).json({ error: 'Ticket not found in this project.' });
      const comments = await loadBetaDeskComments(ticketNumber, true);
      return res.json({ ticket, comments });
    } catch (error) {
      console.error('Failed to load BetaDesk ticket details:', error);
      return res.status(500).json({ error: 'Could not load ticket details.' });
    }
  });

  app.get('/api/betadesk/admin/tickets/:ticketNumber/attachments/:uploadId', requireBetaDeskAdmin, async (req, res) => {
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    const range = (req.get('range') || '').match(/^bytes=(\d+)-(\d+)$/);
    if (!range) return res.status(416).json({ error: 'A valid byte range is required.' });
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start + 1 > 4 * 1024 * 1024) {
      return res.status(416).json({ error: 'Requested byte range is too large or invalid.' });
    }
    try {
      const ticket = await loadBetaDeskTicket(req.params.ticketNumber);
      if (!ticket || ticket.projectId !== projectId || !ticket.attachments?.some((attachment) => attachment.uploadId === req.params.uploadId)) {
        return res.status(404).json({ error: 'Attachment not found.' });
      }
      const attachment = await getBetaDeskAttachmentChunk(ticket.testerId, ticket.ticketNumber, req.params.uploadId, start, end);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
      res.set({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        'Content-Length': String(attachment.data.length),
        'Content-Range': `bytes ${start}-${end}/${attachment.size}`,
        'Content-Type': attachment.contentType,
      });
      return res.status(206).send(attachment.data);
    } catch (error) {
      console.error('Failed to prepare BetaDesk admin attachment download:', error);
      return res.status(500).json({ error: 'Could not access this attachment.' });
    }
  });

  app.patch('/api/betadesk/admin/tickets/:ticketNumber', requireBetaDeskAdmin, async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    const { status, priority, assignedTo } = req.body || {};
    let normalizedAssignee: string | undefined;
    if (typeof assignedTo === 'string' && assignedTo.trim()) {
      const assignee = sanitizeEmail(assignedTo);
      if (!assignee.isValid) return res.status(400).json({ error: 'Assignment must be an administrator email.' });
      normalizedAssignee = assignee.email;
    } else if (typeof assignedTo === 'string') {
      normalizedAssignee = '';
    }
    if (
      !/^BETA-\d+$/.test(ticketNumber)
      || (status !== undefined && !betaDeskStatuses.includes(status))
      || (priority !== undefined && !betaDeskPriorities.includes(priority))
      || (assignedTo !== undefined && (typeof assignedTo !== 'string' || assignedTo.length > 254))
      || (status === undefined && priority === undefined && assignedTo === undefined)
    ) {
      return res.status(400).json({ error: 'Provide valid ticket changes.' });
    }
    try {
      if (normalizedAssignee) {
        const [studioInvite, betaDeskAdmin] = await Promise.all([
          loadStudioInvite(normalizedAssignee),
          loadBetaDeskAdmin(normalizedAssignee),
        ]);
        const isStudioAdmin = normalizedAssignee === ownerEmail || studioInvite?.role === 'admin';
        if (!isStudioAdmin && !betaDeskAdmin?.active) {
          return res.status(400).json({ error: 'Tickets can only be assigned to an active BetaDesk administrator.' });
        }
      }
      const existingTicket = await loadBetaDeskTicket(ticketNumber);
      if (!existingTicket || existingTicket.projectId !== projectId) {
        return res.status(404).json({ error: 'Ticket not found in this project.' });
      }
      const ticket = await updateBetaDeskTicket(
        ticketNumber,
        {
          ...(status !== undefined ? { status } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(normalizedAssignee !== undefined ? { assignedTo: normalizedAssignee } : {}),
        },
        res.locals.studioEmail || 'Studio admin'
      );
      if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
      return res.json(ticket);
    } catch (error) {
      console.error('Failed to update BetaDesk ticket:', error);
      return res.status(500).json({ error: 'Could not update this ticket.' });
    }
  });

  app.post('/api/betadesk/admin/tickets/:ticketNumber/comments', requireBetaDeskAdmin, async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    const projectId = betaDeskProjectFromRequest(req, res);
    if (!projectId) return;
    const message = sanitizePlainText(req.body?.message, 3000);
    const visibility = req.body?.visibility;
    if (!/^BETA-\d+$/.test(ticketNumber) || message.length < 2 || !['public', 'internal'].includes(visibility)) {
      return res.status(400).json({ error: 'Enter a message and choose a valid visibility.' });
    }
    try {
      const ticket = await loadBetaDeskTicket(ticketNumber);
      if (!ticket || ticket.projectId !== projectId) return res.status(404).json({ error: 'Ticket not found in this project.' });
      const comment = await addBetaDeskComment(ticketNumber, {
        authorType: 'admin',
        authorName: res.locals.studioEmail || 'Studio admin',
        message,
        visibility,
      });
      if (!comment) return res.status(404).json({ error: 'Ticket not found.' });

      return res.status(201).json(comment);
    } catch (error) {
      console.error('Failed to add BetaDesk admin comment:', error);
      return res.status(500).json({ error: 'Could not add this reply.' });
    }
  });

  app.get('/api/studio/access', async (req, res) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    return res.json({ allowed: identity.isOwner || Boolean(identity.role), isOwner: identity.isOwner, role: identity.role });
  });

  app.get('/api/customer-operations/access', async (req, res) => {
    const identity = await verifyCustomerOperationsIdentity(req, res);
    if (!identity) return;
    return res.json({
      allowed: identity.isPlatformSuperAdmin || Boolean(identity.platformRole) || identity.businesses.length > 0,
      email: identity.email,
      platformRole: identity.platformRole,
      businesses: identity.businesses,
    });
  });

  app.get('/api/customer-operations/businesses', requireCustomerOperationsSuperAdmin, async (_req, res) => {
    try {
      return res.json(await loadCustomerOperationsBusinesses());
    } catch (error) {
      console.error('Failed to load Customer Operations businesses:', error);
      return res.status(500).json({ error: 'Could not load businesses.' });
    }
  });

  app.post('/api/customer-operations/businesses', requireCustomerOperationsSuperAdmin, async (req, res) => {
    const name = sanitizePlainText(req.body?.name, 150);
    const { isValid, email: ownerEmailAddress } = sanitizeEmail(req.body?.ownerEmail);
    if (!name || !isValid) {
      return res.status(400).json({ error: 'A business name and valid owner email are required.' });
    }
    if (ownerEmailAddress === ownerEmail) {
      return res.status(409).json({ error: 'The Platform Super Admin cannot also be assigned a business-owner membership.' });
    }
    try {
      if (await loadCustomerOperationsPlatformMembership(ownerEmailAddress)) {
        return res.status(409).json({ error: 'Platform Support Agents cannot be assigned as business owners.' });
      }
      const business = await createCustomerOperationsBusiness({
        name,
        ownerEmail: ownerEmailAddress,
        createdBy: res.locals.customerOperationsEmail,
      });
      return res.status(201).json(business);
    } catch (error) {
      if (error instanceof Error && error.message === 'Platform members cannot be assigned as business owners.') {
        return res.status(409).json({ error: error.message });
      }
      console.error('Failed to create Customer Operations business:', error);
      return res.status(500).json({ error: 'Could not create the business.' });
    }
  });

  app.get('/api/customer-operations/platform-members', requireCustomerOperationsSuperAdmin, async (_req, res) => {
    try {
      return res.json(await loadCustomerOperationsPlatformMemberships());
    } catch (error) {
      console.error('Failed to load Customer Operations platform members:', error);
      return res.status(500).json({ error: 'Could not load platform members.' });
    }
  });

  app.post('/api/customer-operations/platform-members', requireCustomerOperationsSuperAdmin, async (req, res) => {
    const { isValid, email } = sanitizeEmail(req.body?.email);
    const role = req.body?.role as CustomerOperationsPlatformRole;
    if (!isValid || role !== 'platform_support_agent') {
      return res.status(400).json({ error: 'Provide a valid email address and platform support agent role.' });
    }
    if (email === ownerEmail) {
      return res.status(400).json({ error: 'The Platform Super Admin role is reserved for the configured owner.' });
    }
    try {
      if ((await loadCustomerOperationsBusinessMemberships(email)).length) {
        return res.status(409).json({ error: 'A business member cannot also be granted a platform support role.' });
      }
      const member = await saveCustomerOperationsPlatformMembership({
        email,
        role,
        invitedBy: res.locals.customerOperationsEmail,
      });
      return res.status(201).json(member);
    } catch (error) {
      if (error instanceof Error && error.message === 'Business members cannot be granted platform support access.') {
        return res.status(409).json({ error: error.message });
      }
      console.error('Failed to grant Customer Operations platform access:', error);
      return res.status(500).json({ error: 'Could not grant platform access.' });
    }
  });

  app.delete(
    '/api/customer-operations/platform-members/:email',
    requireCustomerOperationsSuperAdmin,
    async (req, res) => {
      const { isValid, email } = sanitizeEmail(req.params.email);
      if (!isValid) return res.status(400).json({ error: 'A valid email address is required.' });
      if (email === ownerEmail) {
        return res.status(400).json({ error: 'The Platform Super Admin cannot be deactivated here.' });
      }
      try {
        const existing = await loadCustomerOperationsPlatformMembership(email);
        if (!existing) return res.status(404).json({ error: 'Platform membership was not found.' });
        await deactivateCustomerOperationsPlatformMembership(email, res.locals.customerOperationsEmail);
        return res.json({ success: true });
      } catch (error) {
        if (error instanceof Error && error.message === 'Platform membership was not found.') {
          return res.status(404).json({ error: error.message });
        }
        console.error('Failed to remove Customer Operations platform access:', error);
        return res.status(500).json({ error: 'Could not remove platform access.' });
      }
    }
  );

  app.get(
    '/api/customer-operations/businesses/:businessId/members',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      try {
        const business = await loadCustomerOperationsBusiness(req.params.businessId);
        if (!business) return res.status(404).json({ error: 'Business was not found.' });
        return res.json(await loadCustomerOperationsBusinessMembers(business.id));
      } catch (error) {
        console.error('Failed to load Customer Operations business members:', error);
        return res.status(500).json({ error: 'Could not load business members.' });
      }
    }
  );

  app.post(
    '/api/customer-operations/businesses/:businessId/members',
    requireCustomerOperationsBusinessManagement,
    async (req, res) => {
      const { isValid, email } = sanitizeEmail(req.body?.email);
      const role = req.body?.role as CustomerOperationsBusinessRole;
      if (!isValid || !['business_manager', 'business_support_agent'].includes(role)) {
        return res.status(400).json({ error: 'Provide a valid email and a permitted business role.' });
      }
      if (email === res.locals.customerOperationsEmail) {
        return res.status(400).json({ error: 'You cannot change your own business owner membership.' });
      }
      try {
        if (email === ownerEmail || await loadCustomerOperationsPlatformMembership(email)) {
          return res.status(409).json({ error: 'Platform administrators and support agents cannot be granted business membership.' });
        }
        const member = await saveCustomerOperationsBusinessMembership({
          businessId: req.params.businessId,
          email,
          role,
          invitedBy: res.locals.customerOperationsEmail,
        });
        return res.status(201).json(member);
      } catch (error) {
        if (error instanceof Error && error.message === 'Platform members cannot be assigned business membership.') {
          return res.status(409).json({ error: error.message });
        }
        if (error instanceof Error && error.message === 'An existing business owner cannot be downgraded.') {
          return res.status(409).json({ error: error.message });
        }
        if (error instanceof Error && error.message === 'Business does not exist or is inactive.') {
          return res.status(404).json({ error: 'Business was not found or is inactive.' });
        }
        console.error('Failed to grant Customer Operations business access:', error);
        return res.status(500).json({ error: 'Could not grant business access.' });
      }
    }
  );

  app.delete(
    '/api/customer-operations/businesses/:businessId/members/:email',
    requireCustomerOperationsBusinessManagement,
    async (req, res) => {
      const { isValid, email } = sanitizeEmail(req.params.email);
      if (!isValid) return res.status(400).json({ error: 'A valid email address is required.' });
      if (email === res.locals.customerOperationsEmail) {
        return res.status(400).json({ error: 'You cannot deactivate your own business membership.' });
      }
      try {
        await deactivateCustomerOperationsBusinessMembership({
          businessId: req.params.businessId,
          email,
          actorEmail: res.locals.customerOperationsEmail,
        });
        return res.json({ success: true });
      } catch (error) {
        if (error instanceof Error && error.message === 'Business membership was not found.') {
          return res.status(404).json({ error: error.message });
        }
        if (error instanceof Error && error.message === 'Business owner membership cannot be deactivated here.') {
          return res.status(409).json({ error: error.message });
        }
        console.error('Failed to remove Customer Operations business access:', error);
        return res.status(500).json({ error: 'Could not remove business access.' });
      }
    }
  );

  const customerStatuses: CustomerOperationsCustomerStatus[] = ['active', 'inactive'];
  const ticketStatuses: CustomerOperationsTicketStatus[] = [
    'new', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed',
  ];
  const ticketPriorities: CustomerOperationsTicketPriority[] = ['low', 'normal', 'high', 'urgent'];
  const ticketSources: CustomerOperationsTicketSource[] = ['manual'];
  const allowedTicketTransitions: Record<CustomerOperationsTicketStatus, CustomerOperationsTicketStatus[]> = {
    new: ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'],
    open: ['new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'],
    in_progress: ['open', 'waiting_on_customer', 'resolved', 'closed'],
    waiting_on_customer: ['open', 'in_progress', 'resolved', 'closed'],
    resolved: ['open', 'in_progress', 'closed'],
    closed: ['open'],
  };
  const customerOperationsTags = (value: unknown): string[] | null => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20) return null;
    const tags = value.map((tag) => sanitizePlainText(tag, 40)).filter(Boolean);
    if (tags.length !== value.length || new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length) {
      return null;
    }
    return tags;
  };
  const customerOperationsCursor = (value: unknown): { updatedAt: string; id: string } | null | false => {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.length > 500) return false;
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        updatedAt?: unknown;
        id?: unknown;
      };
      return typeof parsed.updatedAt === 'string'
        && !Number.isNaN(Date.parse(parsed.updatedAt))
        && typeof parsed.id === 'string'
        && /^[0-9a-f-]{36}$/i.test(parsed.id)
        ? { updatedAt: parsed.updatedAt, id: parsed.id }
        : false;
    } catch {
      return false;
    }
  };
  const validBusinessAssignee = async (businessId: string, email: string) => {
    if (!email) return true;
    const members = await loadCustomerOperationsBusinessMembers(businessId);
    return members.some((member) => member.email === email && member.active);
  };

  app.get(
    '/api/customer-operations/businesses/:businessId/customers',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      const limitValue = req.query.limit === undefined ? 50 : Number(req.query.limit);
      const status = req.query.status as CustomerOperationsCustomerStatus | undefined;
      const cursor = customerOperationsCursor(req.query.cursor);
      if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100
        || (status && !customerStatuses.includes(status)) || cursor === false) {
        return res.status(400).json({ error: 'Invalid customer list filters or cursor.' });
      }
      try {
        const result = await listCustomerOperationsCustomers({
          businessId: req.params.businessId,
          limit: limitValue,
          ...(cursor ? { cursor } : {}),
          ...(typeof req.query.search === 'string' ? { search: sanitizePlainText(req.query.search, 120) } : {}),
          ...(status ? { status } : {}),
        });
        return res.json(result);
      } catch (error) {
        console.error('Failed to list Customer Operations customers:', error);
        return res.status(500).json({ error: 'Could not load customers.' });
      }
    }
  );

  app.post(
    '/api/customer-operations/businesses/:businessId/customers',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      const name = sanitizePlainText(req.body?.name, 120);
      const emailInput = req.body?.email ? sanitizeEmail(req.body.email) : { isValid: true, email: '' };
      const phone = sanitizePlainText(req.body?.phone, 40);
      const whatsapp = sanitizePlainText(req.body?.whatsapp, 40);
      const company = sanitizePlainText(req.body?.company, 150);
      const assignedOwner = req.body?.assignedOwner ? sanitizeEmail(req.body.assignedOwner) : { isValid: true, email: '' };
      const tags = customerOperationsTags(req.body?.tags);
      if (name.length < 2 || !emailInput.isValid || !assignedOwner.isValid || tags === null) {
        return res.status(400).json({ error: 'Enter a customer name and valid contact, owner, and tag values.' });
      }
      try {
        if (!await validBusinessAssignee(req.params.businessId, assignedOwner.email)) {
          return res.status(400).json({ error: 'The assigned owner must be an active member of this business.' });
        }
        const customer = await createCustomerOperationsCustomer({
          businessId: req.params.businessId,
          name,
          email: emailInput.email,
          phone,
          whatsapp,
          company,
          tags,
          assignedOwner: assignedOwner.email,
          actorEmail: res.locals.customerOperationsEmail,
        });
        return res.status(201).json(customer);
      } catch (error) {
        if (error instanceof Error && error.message === 'Business does not exist or is inactive.') {
          return res.status(404).json({ error: 'Business workspace not found.' });
        }
        if (error instanceof Error && error.message === 'Assigned owner is not an active member of this business.') {
          return res.status(409).json({ error: 'The assigned owner is no longer an active member. Refresh and retry.' });
        }
        console.error('Failed to create Customer Operations customer:', error);
        return res.status(500).json({ error: 'Could not create the customer.' });
      }
    }
  );

  app.get(
    '/api/customer-operations/businesses/:businessId/customers/:customerId',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.customerId)) {
        return res.status(404).json({ error: 'Customer not found.' });
      }
      try {
        const customer = await loadCustomerOperationsCustomer(req.params.businessId, req.params.customerId);
        if (!customer) return res.status(404).json({ error: 'Customer not found.' });
        const [notes, activity] = await Promise.all([
          listCustomerOperationsCustomerNotes(req.params.businessId, customer.id),
          listCustomerOperationsCustomerActivity(req.params.businessId, customer.id),
        ]);
        return res.json({ customer, internalNotes: notes, activity });
      } catch (error) {
        console.error('Failed to load Customer Operations customer:', error);
        return res.status(500).json({ error: 'Could not load the customer.' });
      }
    }
  );

  app.patch(
    '/api/customer-operations/businesses/:businessId/customers/:customerId',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.customerId)) {
        return res.status(404).json({ error: 'Customer not found.' });
      }
      const changes: Record<string, unknown> = {};
      if (req.body?.name !== undefined) changes.name = sanitizePlainText(req.body.name, 120);
      if (req.body?.email !== undefined) {
        const value = req.body.email ? sanitizeEmail(req.body.email) : { isValid: true, email: '' };
        if (!value.isValid) return res.status(400).json({ error: 'Enter a valid email address.' });
        changes.email = value.email;
      }
      for (const key of ['phone', 'whatsapp', 'company'] as const) {
        if (req.body?.[key] !== undefined) {
          changes[key] = sanitizePlainText(req.body[key], key === 'company' ? 150 : 40);
        }
      }
      if (req.body?.status !== undefined) {
        if (!customerStatuses.includes(req.body.status)) return res.status(400).json({ error: 'Invalid customer status.' });
        changes.status = req.body.status;
      }
      if (req.body?.tags !== undefined) {
        const tags = customerOperationsTags(req.body.tags);
        if (tags === null) return res.status(400).json({ error: 'Tags must be unique and contain no more than 20 values.' });
        changes.tags = tags;
      }
      if (req.body?.assignedOwner !== undefined) {
        const assignee = req.body.assignedOwner ? sanitizeEmail(req.body.assignedOwner) : { isValid: true, email: '' };
        if (!assignee.isValid) return res.status(400).json({ error: 'Enter a valid assigned owner email.' });
        try {
          if (!await validBusinessAssignee(req.params.businessId, assignee.email)) {
            return res.status(400).json({ error: 'The assigned owner must be an active member of this business.' });
          }
        } catch (error) {
          console.error('Failed to validate Customer Operations customer owner:', error);
          return res.status(503).json({ error: 'Could not verify the assigned owner. Please retry.' });
        }
        changes.assignedOwner = assignee.email;
      }
      if (changes.name !== undefined && String(changes.name).length < 2) {
        return res.status(400).json({ error: 'Customer name must contain at least 2 characters.' });
      }
      if (!Object.keys(changes).length) return res.status(400).json({ error: 'No valid customer changes were provided.' });
      try {
        const customer = await updateCustomerOperationsCustomer({
          businessId: req.params.businessId,
          customerId: req.params.customerId,
          changes: changes as Parameters<typeof updateCustomerOperationsCustomer>[0]['changes'],
          actorEmail: res.locals.customerOperationsEmail,
        });
        return customer ? res.json(customer) : res.status(404).json({ error: 'Customer not found.' });
      } catch (error) {
        if (error instanceof Error && error.message === 'Assigned owner is not an active member of this business.') {
          return res.status(409).json({ error: 'The assigned owner is no longer an active member. Refresh and retry.' });
        }
        console.error('Failed to update Customer Operations customer:', error);
        return res.status(500).json({ error: 'Could not update the customer.' });
      }
    }
  );

  app.post(
    '/api/customer-operations/businesses/:businessId/customers/:customerId/internal-notes',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.customerId)) {
        return res.status(404).json({ error: 'Customer not found.' });
      }
      const body = sanitizePlainText(req.body?.body, 3000);
      if (body.length < 2) return res.status(400).json({ error: 'Internal note must contain at least 2 characters.' });
      try {
        const note = await addCustomerOperationsCustomerNote({
          businessId: req.params.businessId,
          customerId: req.params.customerId,
          body,
          authorEmail: res.locals.customerOperationsEmail,
        });
        return note ? res.status(201).json(note) : res.status(404).json({ error: 'Customer not found.' });
      } catch (error) {
        console.error('Failed to add Customer Operations customer note:', error);
        return res.status(500).json({ error: 'Could not add the internal note.' });
      }
    }
  );

  app.get(
    '/api/customer-operations/businesses/:businessId/tickets',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      const limitValue = req.query.limit === undefined ? 50 : Number(req.query.limit);
      const status = req.query.status as CustomerOperationsTicketStatus | undefined;
      const priority = req.query.priority as CustomerOperationsTicketPriority | undefined;
      const cursor = customerOperationsCursor(req.query.cursor);
      const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100
        || (status && !ticketStatuses.includes(status))
        || (priority && !ticketPriorities.includes(priority))
        || (customerId && !/^[0-9a-f-]{36}$/i.test(customerId))
        || cursor === false) {
        return res.status(400).json({ error: 'Invalid ticket list filters or cursor.' });
      }
      try {
        const result = await listCustomerOperationsTickets({
          businessId: req.params.businessId,
          limit: limitValue,
          ...(cursor ? { cursor } : {}),
          ...(typeof req.query.search === 'string' ? { search: sanitizePlainText(req.query.search, 120) } : {}),
          ...(customerId ? { customerId } : {}),
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
        });
        return res.json(result);
      } catch (error) {
        console.error('Failed to list Customer Operations tickets:', error);
        return res.status(500).json({ error: 'Could not load tickets.' });
      }
    }
  );

  app.post(
    '/api/customer-operations/businesses/:businessId/tickets',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      const customerId = sanitizePlainText(req.body?.customerId, 80);
      const subject = sanitizePlainText(req.body?.subject, 180);
      const description = sanitizePlainText(req.body?.description, 5000);
      const category = sanitizePlainText(req.body?.category, 80);
      const tags = customerOperationsTags(req.body?.tags);
      const priority = req.body?.priority as CustomerOperationsTicketPriority;
      const source = req.body?.source as CustomerOperationsTicketSource | undefined;
      const assignee = req.body?.assignedAgent ? sanitizeEmail(req.body.assignedAgent) : { isValid: true, email: '' };
      if (!/^[0-9a-f-]{36}$/i.test(customerId) || subject.length < 3 || description.length < 2
        || !category || tags === null || !ticketPriorities.includes(priority)
        || (source !== undefined && !ticketSources.includes(source)) || !assignee.isValid) {
        return res.status(400).json({ error: 'Complete the ticket fields with valid values.' });
      }
      try {
        if (!await validBusinessAssignee(req.params.businessId, assignee.email)) {
          return res.status(400).json({ error: 'The assigned agent must be an active member of this business.' });
        }
        const ticket = await createCustomerOperationsTicket({
          businessId: req.params.businessId,
          customerId,
          subject,
          description,
          category,
          tags,
          priority,
          assignedAgent: assignee.email,
          assignedTeam: '',
          source: source || 'manual',
          actorEmail: res.locals.customerOperationsEmail,
        });
        return res.status(201).json(ticket);
      } catch (error) {
        if (error instanceof Error && error.message === 'Customer does not exist in this business.') {
          return res.status(404).json({ error: 'Customer not found in this business.' });
        }
        if (error instanceof Error && error.message === 'Business does not exist or is inactive.') {
          return res.status(404).json({ error: 'Business workspace not found.' });
        }
        if (error instanceof Error && error.message === 'Assigned agent is not an active member of this business.') {
          return res.status(409).json({ error: 'The assigned agent is no longer an active member. Refresh and retry.' });
        }
        console.error('Failed to create Customer Operations ticket:', error);
        return res.status(500).json({ error: 'Could not create the ticket.' });
      }
    }
  );

  app.get(
    '/api/customer-operations/businesses/:businessId/tickets/:ticketId',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.ticketId)) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      try {
        const ticket = await loadCustomerOperationsTicket(req.params.businessId, req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
        const [internalNotes, events] = await Promise.all([
          listCustomerOperationsTicketNotes(req.params.businessId, ticket.id),
          listCustomerOperationsTicketEvents(req.params.businessId, ticket.id),
        ]);
        return res.json({ ticket, internalNotes, events });
      } catch (error) {
        console.error('Failed to load Customer Operations ticket:', error);
        return res.status(500).json({ error: 'Could not load the ticket.' });
      }
    }
  );

  app.patch(
    '/api/customer-operations/businesses/:businessId/tickets/:ticketId',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.ticketId)) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      const changes: Record<string, unknown> = {};
      if (req.body?.subject !== undefined) {
        changes.subject = sanitizePlainText(req.body.subject, 180);
        if (String(changes.subject).length < 3) return res.status(400).json({ error: 'Subject must contain at least 3 characters.' });
      }
      if (req.body?.category !== undefined) {
        changes.category = sanitizePlainText(req.body.category, 80);
        if (!changes.category) return res.status(400).json({ error: 'Category is required.' });
      }
      if (req.body?.tags !== undefined) {
        const tags = customerOperationsTags(req.body.tags);
        if (tags === null) return res.status(400).json({ error: 'Tags must be unique and contain no more than 20 values.' });
        changes.tags = tags;
      }
      if (req.body?.priority !== undefined) {
        if (!ticketPriorities.includes(req.body.priority)) return res.status(400).json({ error: 'Invalid ticket priority.' });
        changes.priority = req.body.priority;
      }
      if (req.body?.status !== undefined) {
        if (!ticketStatuses.includes(req.body.status)) return res.status(400).json({ error: 'Invalid ticket status.' });
        const current = await loadCustomerOperationsTicket(req.params.businessId, req.params.ticketId);
        if (!current) return res.status(404).json({ error: 'Ticket not found.' });
        if (req.body.status !== current.status && !allowedTicketTransitions[current.status].includes(req.body.status)) {
          return res.status(409).json({ error: `Cannot change a ${current.status.replaceAll('_', ' ')} ticket to ${req.body.status.replaceAll('_', ' ')}.` });
        }
        changes.status = req.body.status;
      }
      if (req.body?.assignedAgent !== undefined) {
        const assignee = req.body.assignedAgent ? sanitizeEmail(req.body.assignedAgent) : { isValid: true, email: '' };
        if (!assignee.isValid) return res.status(400).json({ error: 'Enter a valid assigned agent email.' });
        try {
          if (!await validBusinessAssignee(req.params.businessId, assignee.email)) {
            return res.status(400).json({ error: 'The assigned agent must be an active member of this business.' });
          }
        } catch (error) {
          console.error('Failed to validate Customer Operations ticket assignee:', error);
          return res.status(503).json({ error: 'Could not verify the assigned agent. Please retry.' });
        }
        changes.assignedAgent = assignee.email;
      }
      if (!Object.keys(changes).length) return res.status(400).json({ error: 'No valid ticket changes were provided.' });
      try {
        const ticket = await updateCustomerOperationsTicket({
          businessId: req.params.businessId,
          ticketId: req.params.ticketId,
          changes: changes as Parameters<typeof updateCustomerOperationsTicket>[0]['changes'],
          actorEmail: res.locals.customerOperationsEmail,
        });
        return ticket ? res.json(ticket) : res.status(404).json({ error: 'Ticket not found.' });
      } catch (error) {
        if (error instanceof Error && error.message === 'Ticket status transition is not allowed.') {
          return res.status(409).json({ error: 'Ticket status changed concurrently. Refresh and retry.' });
        }
        if (error instanceof Error && error.message === 'Assigned agent is not an active member of this business.') {
          return res.status(409).json({ error: 'The assigned agent is no longer an active member. Refresh and retry.' });
        }
        console.error('Failed to update Customer Operations ticket:', error);
        return res.status(500).json({ error: 'Could not update the ticket.' });
      }
    }
  );

  app.post(
    '/api/customer-operations/businesses/:businessId/tickets/:ticketId/internal-notes',
    requireCustomerOperationsBusinessAccess,
    async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.ticketId)) {
        return res.status(404).json({ error: 'Ticket not found.' });
      }
      const body = sanitizePlainText(req.body?.body, 3000);
      if (body.length < 2) return res.status(400).json({ error: 'Internal note must contain at least 2 characters.' });
      try {
        const note = await addCustomerOperationsTicketNote({
          businessId: req.params.businessId,
          ticketId: req.params.ticketId,
          body,
          authorEmail: res.locals.customerOperationsEmail,
        });
        return note ? res.status(201).json(note) : res.status(404).json({ error: 'Ticket not found.' });
      } catch (error) {
        console.error('Failed to add Customer Operations ticket note:', error);
        return res.status(500).json({ error: 'Could not add the internal note.' });
      }
    }
  );

  app.get('/api/studio/betadesk/admins', requireStudioOwnerAccess, async (_req, res) => {
    try {
      return res.json({
        admins: await loadBetaDeskAdmins(),
        superAdminEmail: ownerEmail || '',
        driveConnected: ownerEmail ? await loadBetaDeskDriveConnectionStatus(ownerEmail) : false,
      });
    } catch (error) {
      console.error('Failed to load Studio BetaDesk roles:', error);
      return res.status(500).json({ error: 'Could not load BetaDesk roles.' });
    }
  });

  app.post('/api/studio/betadesk/admins', requireStudioOwnerAccess, async (req, res) => {
    const { isValid, email } = sanitizeEmail(req.body?.email);
    if (!isValid) return res.status(400).json({ error: 'Enter a valid Google account email address.' });
    try {
      if (email === ownerEmail) {
        return res.status(400).json({ error: 'The Studio Super Admin already has BetaDesk access.' });
      }
      const invitedBy = res.locals.studioEmail || 'Studio owner';
      let messageId: string | undefined;
      try {
        ({ messageId } = await sendAdminInvitationEmail({
          recipient: email,
          role: 'BetaDesk Admin',
          invitedBy,
          accessUrl: studioAccessUrl(req, '/studio/beta-feedback'),
        }));
      } catch (error) {
        console.error('Failed to send BetaDesk admin invitation:', error);
        return res.status(502).json({
          error: 'The invitation email could not be sent, so BetaDesk admin access was not granted. Check the server SMTP settings and retry.',
          email,
        });
      }
      try {
        await saveBetaDeskAdmin(email, invitedBy);
      } catch (error) {
        console.error('BetaDesk invitation email was sent, but the admin role could not be saved:', error);
        return res.status(500).json({
          error: 'The invitation email was sent, but BetaDesk access could not be activated. Retry the invitation.',
          emailSent: true,
          email,
        });
      }
      return res.status(201).json({ email, active: true, emailSent: true, messageId });
    } catch (error) {
      console.error('Failed to grant Studio BetaDesk role:', error);
      return res.status(500).json({ error: 'Could not grant BetaDesk admin access.' });
    }
  });

  app.delete('/api/studio/betadesk/admins/:email', requireStudioOwnerAccess, async (req, res) => {
    const { isValid, email } = sanitizeEmail(req.params.email);
    if (!isValid) return res.status(400).json({ error: 'Invalid administrator email address.' });
    try {
      if (email === ownerEmail) {
        return res.status(400).json({ error: 'The Studio Super Admin cannot be removed here.' });
      }
      await removeBetaDeskAdmin(email);
      return res.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke Studio BetaDesk role:', error);
      return res.status(500).json({ error: 'Could not remove BetaDesk admin access.' });
    }
  });

  app.get('/api/studio/invites', requireStudioOwnerAccess, async (_req, res) => {
    try {
      return res.json(await loadStudioInvites());
    } catch (error) {
      console.error('Failed to load Studio invites:', error);
      return res.status(500).json({ error: 'Could not load invitations.' });
    }
  });

  app.get('/api/studio/invite-links', requireStudioOwnerAccess, async (_req, res) => {
    try {
      return res.json(await loadStudioAdminInviteLinks());
    } catch (error) {
      console.error('Failed to load Studio admin invite links:', error);
      return res.status(500).json({ error: 'Could not load invite links.' });
    }
  });

  app.post('/api/studio/invite-links', requireStudioOwnerAccess, async (req, res) => {
    const { isValid, email } = sanitizeEmail(req.body?.email);
    if (!isValid) return res.status(400).json({ error: 'Enter a valid Google account email address.' });
    const kind = req.body?.kind;
    const role = req.body?.role;
    let inviteKind: StudioAdminInviteLink['kind'];
    let inviteRole: StudioAdminInviteLink['role'];
    if (kind === 'studio' && ['admin', 'project_manager', 'viewer'].includes(role)) {
      inviteKind = 'studio';
      inviteRole = role;
    } else if (kind === 'betadesk' && role === 'betadesk_admin') {
      inviteKind = 'betadesk';
      inviteRole = 'betadesk_admin';
    } else {
      return res.status(400).json({ error: 'Choose a valid invitation type and role.' });
    }
    if (email === ownerEmail) {
      return res.status(400).json({ error: 'The Studio Super Admin already has administrator access.' });
    }

    try {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashShareToken(token);
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invite: StudioAdminInviteLink = {
        email,
        kind: inviteKind,
        role: inviteRole,
        invitedBy: res.locals.studioEmail || 'Studio owner',
        createdAt,
        expiresAt,
      };
      await saveStudioAdminInviteLink(tokenHash, invite);
      const inviteUrl = new URL('/studio/invite', studioAccessUrl(req, '/studio'));
      inviteUrl.hash = `invite=${token}`;
      return res.status(201).json({ email, inviteUrl: inviteUrl.toString(), expiresAt });
    } catch (error) {
      console.error('Failed to create Studio admin invite link:', error);
      return res.status(500).json({ error: 'Could not create an invite link.' });
    }
  });

  app.delete('/api/studio/invite-links/:id', requireStudioOwnerAccess, async (req, res) => {
    const id = req.params.id;
    if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ error: 'Invalid invite link.' });
    try {
      await revokeStudioAdminInviteLink(id);
      return res.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke Studio admin invite link:', error);
      return res.status(500).json({ error: 'Could not revoke this invite link.' });
    }
  });

  app.post('/api/studio/invite-links/claim', async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return res.status(400).json({ error: 'This invite link is invalid or has already been used.' });
    }
    if (!ownerEmail) {
      return res.status(503).json({ error: 'Studio Super Admin is not configured on the server.' });
    }
    const authorization = req.get('authorization') || '';
    const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!idToken) return res.status(401).json({ error: 'Sign in with the invited Google account to claim this link.' });

    let decodedToken;
    try {
      decodedToken = await getStudioAuth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Could not verify the signed-in Google account.' });
    }

    const email = (decodedToken.email || '').trim().toLowerCase();
    if (!email || !decodedToken.email_verified) {
      return res.status(403).json({ error: 'A verified Google account is required to claim this invite.' });
    }

    try {
      const result = await claimStudioAdminInviteLink(hashShareToken(token), email);
      if (result === 'email_mismatch') {
        return res.status(403).json({ error: 'This link is tied to a different Google account. Sign in with the invited email address.' });
      }
      if (result === 'expired') return res.status(410).json({ error: 'This invite link has expired. Ask the Studio Super Admin for a new one.' });
      if (result === 'invalid') return res.status(404).json({ error: 'This invite link is invalid or has already been used.' });
      return res.json({ success: true, kind: result === 'claimed_studio' ? 'studio' : 'betadesk' });
    } catch (error) {
      console.error('Failed to claim Studio admin invite link:', error);
      return res.status(500).json({ error: 'Could not claim this invite. Try again.' });
    }
  });

  app.post('/api/studio/invites', requireStudioOwnerAccess, async (req, res) => {
    try {
      const { isValid, email } = sanitizeEmail(req.body?.email);
      if (!isValid) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (ownerEmail && email.toLowerCase() === ownerEmail) return res.status(400).json({ error: 'The Super Admin already has Studio access.' });
      const role = req.body?.role;
      if (!['admin', 'project_manager', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Choose Admin, Project Manager, or Viewer.' });
      }
      const authorization = req.get('authorization') || '';
      const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({ error: 'Studio sign-in required.' });
      const decodedToken = await getStudioAuth().verifyIdToken(token);
      const invitedBy = (decodedToken.email || '').toLowerCase();
      const roleName = role === 'admin'
        ? 'Studio Admin'
        : role === 'project_manager'
          ? 'Studio Project Manager'
          : 'Studio Viewer';
      let messageId: string | undefined;
      try {
        ({ messageId } = await sendAdminInvitationEmail({
          recipient: email.toLowerCase(),
          role: roleName,
          invitedBy,
          accessUrl: studioAccessUrl(req, '/studio'),
        }));
      } catch (error) {
        console.error('Failed to send Studio invitation email:', error);
        return res.status(502).json({
          error: 'The invitation email could not be sent, so Studio access was not granted. Check the server SMTP settings and retry.',
          email: email.toLowerCase(),
        });
      }
      try {
        await saveStudioInvite({
          email: email.toLowerCase(),
          role,
          invitedBy,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Studio invitation email was sent, but the invite could not be saved:', error);
        return res.status(500).json({
          error: 'The invitation email was sent, but Studio access could not be activated. Retry the invitation.',
          emailSent: true,
          email: email.toLowerCase(),
        });
      }
      return res.status(201).json({ success: true, email: email.toLowerCase(), emailSent: true, messageId });
    } catch (error) {
      console.error('Failed to invite Studio user:', error);
      return res.status(500).json({ error: 'Could not invite this user.' });
    }
  });

  app.delete('/api/studio/invites/:email', requireStudioOwnerAccess, async (req, res) => {
    try {
      const { isValid, email } = sanitizeEmail(req.params.email);
      if (!isValid) return res.status(400).json({ error: 'Invalid email address.' });
      await deleteStudioInvite(email);
      return res.json({ success: true, email });
    } catch (error) {
      console.error('Failed to revoke Studio invite:', error);
      return res.status(500).json({ error: 'Could not revoke this invitation.' });
    }
  });

  const hashShareToken = (token: string) => createHash('sha256').update(token).digest('hex');
  const ownerProjectResponse = (project: StudioProject, role?: string) => {
    const { shareTokenHash: _shareTokenHash, ...visibleProject } = project;
    if (role === 'viewer' || role === 'project_manager') {
      const { invoiceNumber: _invoiceNumber, invoiceDueDate: _invoiceDueDate, currency: _currency, projectCharge: _projectCharge, discountPercent: _discountPercent, invoiceNotes: _invoiceNotes, ...nonFinancialProject } = visibleProject;
      return {
        ...nonFinancialProject,
        tasks: project.tasks.map(({ amount: _amount, ...task }) => task),
      };
    }
    return visibleProject;
  };

  const createProjectFromSubmission = (submission: StoredSubmission): StudioProject => {
    const features = [...new Set([
      ...(submission.coreObjectives || []),
      ...(submission.selectedFeatures || []),
    ])].filter(Boolean).slice(0, 12);
    const isEcommerce = /e-?commerce|shop|store|product/i.test(
      `${submission.primaryGoal || ''} ${features.join(' ')} ${submission.brief}`
    );
    const deliverables = isEcommerce
      ? ['Discovery and content structure', 'Visual direction and interface design', 'Storefront and product setup', 'Checkout and payment integration', 'Mobile, accessibility, and performance QA', 'Client review and launch']
      : ['Discovery and content structure', 'Visual direction and page designs', 'Website build and responsive layouts', 'Content and integrations', 'Mobile, accessibility, and performance QA', 'Client review and launch'];
    const featureTasks = features.map((feature) => `Implement: ${feature}`);
    const taskTitles = [...deliverables.slice(0, 3), ...featureTasks, ...deliverables.slice(3)];
    return {
      submissionId: submission.id,
      title: `${submission.companyName || 'Client'} project`,
      clientName: submission.clientName || '',
      companyName: submission.companyName || '',
      clientEmail: submission.clientEmail || '',
      brandColors: submission.selectedColors || [],
      shareTokenHash: '',
      columns: ['Backlog', 'In progress', 'Review', 'Done'],
      tasks: taskTitles.map((title, index) => ({
        id: randomUUID(),
        title,
        description: index === 0 ? summarizeTaskDescription(submission.successOutcome || submission.primaryGoal || 'Deliver the approved brief.') : '',
        status: 'Backlog',
        dueDate: '',
        priority: inferTaskPriority(title),
        estimatedEffortDays: estimateEffortDays(title),
        amount: 0,
      })),
      comments: [],
      invoiceNumber: `MF-${new Date().getFullYear()}-${submission.id.slice(-6).toUpperCase()}`,
      invoiceDueDate: '',
      currency: 'USD',
      projectCharge: 0,
      discountPercent: 0,
      projectStartDate: '',
      projectEndDate: '',
      invoiceNotes: '',
      updatedAt: new Date().toISOString(),
    };
  };

  function estimateEffortDays(title: string): number {
    const work = title.toLowerCase();
    if (/checkout|payment|integration|automation|subscription|database/.test(work)) return 5;
    if (/website build|responsive layout|storefront|product setup/.test(work)) return 8;
    if (/implement:/.test(work)) return /e-?commerce|subscription|portal|automation|integration|database/.test(work) ? 7 : 4;
    if (/visual direction|page design|design/.test(work)) return 5;
    if (/content structure|copy|content/.test(work)) return 3;
    if (/accessibility|performance|qa|quality/.test(work)) return 3;
    if (/discovery|research|strategy/.test(work)) return 3;
    if (/launch|handoff/.test(work)) return 2;
    if (/client review/.test(work)) return 2;
    return 3;
  }

  function inferTaskPriority(title: string): ProjectTask['priority'] {
    const work = title.toLowerCase();
    if (/security|privacy|compliance|payment|checkout|data migration|launch blocker/.test(work)) return 'Severe';
    if (/integration|automation|subscription|e-commerce|storefront|database|accessibility/.test(work)) return 'High';
    if (/launch|handoff|client review|quality|qa|performance/.test(work)) return 'Low';
    if (/discovery|research|content structure|strategy/.test(work)) return 'Medium';
    return 'Medium';
  }

  function summarizeTaskDescription(value: unknown): string {
    if (typeof value !== 'string') return '';
    const sentences = value.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 2);
    return sentences.join(' ').split(' ').filter(Boolean).slice(0, 20).join(' ');
  }

  function allocateProjectFee(tasks: ProjectTask[], total: number): ProjectTask[] {
    const totalEffort = tasks.reduce((sum, task) => sum + Math.max(0.5, task.estimatedEffortDays || 1), 0);
    let remainingCents = Math.round(total * 100);
    return tasks.map((task, index) => {
      const amount = index === tasks.length - 1
        ? remainingCents / 100
        : Math.floor((total * Math.max(0.5, task.estimatedEffortDays || 1) / totalEffort) * 100) / 100;
      remainingCents -= Math.round(amount * 100);
      return { ...task, amount };
    });
  }

  function scheduleTaskDueDates(tasks: ProjectTask[], startDate: string, endDate: string): ProjectTask[] {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return tasks.map((task) => ({ ...task, dueDate: '' }));
    }
    const workdays: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) workdays.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (!workdays.length) workdays.push(startDate);
    const totalEffort = tasks.reduce((sum, task) => sum + Math.max(0.5, task.estimatedEffortDays || 1), 0);
    let completedEffort = 0;
    return tasks.map((task) => {
      completedEffort += Math.max(0.5, task.estimatedEffortDays || 1);
      const offset = Math.min(workdays.length - 1, Math.max(0, Math.ceil((completedEffort / totalEffort) * workdays.length) - 1));
      return { ...task, dueDate: workdays[offset] };
    });
  }

  app.get('/api/projects/:id', requireStudioAccess, async (req, res) => {
    try {
      const submission = (await loadSubmissions()).find((item) => item.id === req.params.id);
      if (!submission) return res.status(404).json({ error: 'Brief not found.' });
      let project = await loadStudioProject(submission.id);
      if (!project) {
        project = createProjectFromSubmission(submission);
        await saveStudioProject(project);
      } else {
        project = {
          ...project,
          discountPercent: Number.isFinite(project.discountPercent) ? project.discountPercent : 0,
          projectStartDate: project.projectStartDate || '',
          projectEndDate: project.projectEndDate || '',
          tasks: project.tasks.map((task) => ({
            ...task,
            description: summarizeTaskDescription(task.description),
            priority: ['Severe', 'High', 'Medium', 'Low'].includes(task.priority) ? task.priority : inferTaskPriority(task.title),
            estimatedEffortDays: Number.isFinite(task.estimatedEffortDays) ? task.estimatedEffortDays : estimateEffortDays(task.title),
          })),
        };
          project.tasks = scheduleTaskDueDates(
            allocateProjectFee(project.tasks, project.projectCharge || 0),
            project.projectStartDate,
            project.projectEndDate,
          );
          await saveStudioProject(project);
      }
      return res.json(ownerProjectResponse(project, res.locals.studioRole));
    } catch (error) {
      console.error('Failed to load Studio project:', error);
      return res.status(500).json({ error: 'Failed to load project.' });
    }
  });

  app.put('/api/projects/:id', requireStudioProjectEditor, async (req, res) => {
    try {
      const current = await loadStudioProject(req.params.id);
      if (!current) return res.status(404).json({ error: 'Project not found.' });
      const { title, columns, tasks, invoiceNumber, invoiceDueDate, currency, projectCharge, discountPercent, projectStartDate, projectEndDate, invoiceNotes } = req.body || {};
      if (typeof title !== 'string' || !Array.isArray(columns) || !Array.isArray(tasks) || tasks.length > 200) {
        return res.status(400).json({ error: 'Invalid project data.' });
      }
      const cleanColumns = columns.map((column: unknown) => String(column).trim().slice(0, 40)).filter(Boolean).slice(0, 10);
      if (!cleanColumns.length) return res.status(400).json({ error: 'Add at least one workflow column.' });
      const cleanTasks: ProjectTask[] = tasks.map((task: any) => ({
        id: typeof task.id === 'string' ? task.id.slice(0, 80) : randomUUID(),
        title: String(task.title || '').trim().slice(0, 160),
        description: summarizeTaskDescription(task.description),
        status: cleanColumns.includes(task.status) ? task.status : cleanColumns[0],
        dueDate: '',
        priority: ['Severe', 'High', 'Medium', 'Low'].includes(task.priority) ? task.priority : inferTaskPriority(String(task.title || '')),
        estimatedEffortDays: estimateEffortDays(String(task.title || '')),
        amount: Number.isFinite(Number(task.amount)) ? Math.max(0, Number(task.amount)) : 0,
      })).filter((task: ProjectTask) => task.title);
      const cleanStartDate = typeof projectStartDate === 'string' ? projectStartDate.slice(0, 10) : '';
      const cleanEndDate = typeof projectEndDate === 'string' ? projectEndDate.slice(0, 10) : '';
      if (cleanStartDate && cleanEndDate && cleanStartDate > cleanEndDate) {
        return res.status(400).json({ error: 'Project end date must be on or after the start date.' });
      }
        const isValidDate = (date: string) => !date || /^\d{4}-\d{2}-\d{2}$/.test(date)
          && !Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))
          && new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
        if (!isValidDate(cleanStartDate) || !isValidDate(cleanEndDate)) {
          return res.status(400).json({ error: 'Enter valid project start and end dates.' });
        }
      const canManageInvoice = res.locals.studioRole === 'super_admin' || res.locals.studioRole === 'admin';
      const charge = Number(projectCharge);
      const safeCharge = canManageInvoice
        ? Number.isFinite(charge) ? Math.max(0, charge) : 0
        : current.projectCharge;
      const parsedDiscount = Number(discountPercent);
      const project: StudioProject = {
        ...current,
        title: title.trim().slice(0, 120) || current.title,
        columns: cleanColumns,
        tasks: scheduleTaskDueDates(allocateProjectFee(cleanTasks, safeCharge), cleanStartDate, cleanEndDate),
        invoiceNumber: canManageInvoice ? String(invoiceNumber || '').trim().slice(0, 60) : current.invoiceNumber,
        invoiceDueDate: canManageInvoice && typeof invoiceDueDate === 'string' ? invoiceDueDate.slice(0, 10) : current.invoiceDueDate,
        currency: canManageInvoice && ['USD', 'CAD', 'GBP', 'EUR', 'GHS'].includes(currency) ? currency : current.currency,
        projectCharge: safeCharge,
        discountPercent: canManageInvoice && Number.isFinite(parsedDiscount) ? Math.min(100, Math.max(0, parsedDiscount)) : current.discountPercent,
        projectStartDate: cleanStartDate,
        projectEndDate: cleanEndDate,
        invoiceNotes: canManageInvoice ? String(invoiceNotes || '').trim().slice(0, 2000) : current.invoiceNotes,
        updatedAt: new Date().toISOString(),
      };
      await saveStudioProject(project);
      return res.json(ownerProjectResponse(project, res.locals.studioRole));
    } catch (error) {
      console.error('Failed to save Studio project:', error);
      return res.status(500).json({ error: 'Failed to save project.' });
    }
  });

  app.post('/api/projects/:id/share', requireStudioProjectEditor, async (req, res) => {
    try {
      const project = await loadStudioProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const token = randomBytes(32).toString('base64url');
      project.shareTokenHash = hashShareToken(token);
      project.updatedAt = new Date().toISOString();
      await saveStudioProject(project);
      return res.json({ token });
    } catch (error) {
      console.error('Failed to create project share link:', error);
      return res.status(500).json({ error: 'Failed to create share link.' });
    }
  });

  app.get('/api/client-project', async (req, res) => {
    try {
      const token = req.get('X-Project-Share-Token') || (typeof req.query.token === 'string' ? req.query.token : '');
      if (!token || token.length > 100) return res.status(404).json({ error: 'Project link not found.' });
      const project = await findProjectByShareTokenHash(hashShareToken(token));
      if (!project) return res.status(404).json({ error: 'Project link not found.' });
      return res.json({
        title: project.title,
        companyName: project.companyName,
        columns: project.columns,
        tasks: project.tasks.map(({ id, title, description, status, dueDate, priority, estimatedEffortDays }) => ({
          id,
          title,
          description: summarizeTaskDescription(description),
          status,
          dueDate,
          priority: ['Severe', 'High', 'Medium', 'Low'].includes(priority) ? priority : inferTaskPriority(title),
          estimatedEffortDays: Math.max(0.5, estimatedEffortDays || 1),
          comments: project.comments.filter((comment) => comment.taskId === id),
        })),
        comments: project.comments.filter((comment) => !comment.taskId),
      });
    } catch (error) {
      console.error('Failed to load shared client project:', error);
      return res.status(500).json({ error: 'Could not load this project.' });
    }
  });

  app.get('/api/client-project/invoice', async (req, res) => {
    try {
      const token = req.get('X-Project-Share-Token') || '';
      if (!token || token.length > 100) return res.status(404).json({ error: 'Project link not found.' });
      const project = await findProjectByShareTokenHash(hashShareToken(token));
      if (!project) return res.status(404).json({ error: 'Project link not found.' });
      if (!Number.isFinite(project.projectCharge) || project.projectCharge <= 0) {
        return res.status(409).json({ error: 'The Studio has not finished preparing this invoice yet.' });
      }
      return res.json({
        companyName: project.companyName,
        clientName: project.clientName,
        clientEmail: project.clientEmail,
        projectTitle: project.title,
        brandColors: project.brandColors,
        invoiceNumber: project.invoiceNumber,
        invoiceDueDate: project.invoiceDueDate,
        currency: project.currency,
        projectCharge: project.projectCharge,
        discountPercent: project.discountPercent,
        invoiceNotes: project.invoiceNotes,
        tasks: project.tasks.map(({ title, description, dueDate, amount }) => ({ title, description, dueDate, amount })),
      });
    } catch (error) {
      console.error('Failed to load shared invoice:', error);
      return res.status(500).json({ error: 'Could not load this invoice.' });
    }
  });

  app.post('/api/client-project/comments', async (req, res) => {
    try {
      const { token, author, message, taskId } = req.body || {};
      if (typeof token !== 'string' || token.length > 100) return res.status(404).json({ error: 'Project link not found.' });
      const project = await findProjectByShareTokenHash(hashShareToken(token));
      if (!project) return res.status(404).json({ error: 'Project link not found.' });
      if (taskId && !project.tasks.some((task) => task.id === taskId)) return res.status(404).json({ error: 'Task not found.' });
      const cleanAuthor = typeof author === 'string' ? author.trim().slice(0, 80) : '';
      const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 1000) : '';
      if (!cleanAuthor || !cleanMessage) return res.status(400).json({ error: 'Enter your name and a comment.' });
      const comment: ProjectComment = {
        id: randomUUID(),
        ...(typeof taskId === 'string' ? { taskId } : {}),
        author: cleanAuthor,
        message: cleanMessage,
        createdAt: new Date().toISOString(),
      };
      project.comments = [...project.comments, comment].slice(-200);
      project.updatedAt = new Date().toISOString();
      await saveStudioProject(project);
      return res.status(201).json({ comment });
    } catch (error) {
      console.error('Failed to save client project comment:', error);
      return res.status(500).json({ error: 'Could not save your comment.' });
    }
  });

  app.post('/api/projects/:id/comments', requireStudioProjectEditor, async (req, res) => {
    try {
      const project = await loadStudioProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const { taskId, message } = req.body || {};
      if (typeof taskId !== 'string' || !project.tasks.some((task) => task.id === taskId)) {
        return res.status(404).json({ error: 'Task not found.' });
      }
      const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 1000) : '';
      if (!cleanMessage) return res.status(400).json({ error: 'Enter a comment.' });
      const comment: ProjectComment = {
        id: randomUUID(),
        taskId,
        author: 'Studio',
        message: cleanMessage,
        createdAt: new Date().toISOString(),
      };
      project.comments = [...project.comments, comment].slice(-500);
      project.updatedAt = new Date().toISOString();
      await saveStudioProject(project);
      return res.status(201).json({ comment });
    } catch (error) {
      console.error('Failed to save Studio task comment:', error);
      return res.status(500).json({ error: 'Could not save task comment.' });
    }
  });

  // API endpoint for AI-synthesized Discovery Project Brief
  app.post('/api/generate-brief', async (req, res) => {
    try {
      const { answers } = req.body;
      if (!answers) {
        return res.status(400).json({ error: 'Missing questionnaire answers' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ brief: null });
      }

      const ai = new GoogleGenAI({ apiKey });

      const brandName = answers.companyName || 'Your Brand';

      // Strictly build timing string from user's actual selections
      const timingParts: string[] = [];
      if (answers.timelineSelection && typeof answers.timelineSelection === 'string' && answers.timelineSelection.trim()) {
        timingParts.push(answers.timelineSelection.trim());
      }
      if (answers.customTimeline && typeof answers.customTimeline === 'string' && answers.customTimeline.trim()) {
        timingParts.push(answers.customTimeline.trim());
      }
      const timingDisplay = timingParts.length > 0 ? timingParts.join(' — ') : (answers.targetLaunchWindow || 'Flexible pace');

      // Strictly build budget string from user's actual selections
      const budgetParts: string[] = [];
      if (answers.budgetSelection && typeof answers.budgetSelection === 'string' && answers.budgetSelection.trim()) {
        budgetParts.push(answers.budgetSelection.trim());
      }
      if (answers.customBudget && typeof answers.customBudget === 'string' && answers.customBudget.trim()) {
        budgetParts.push(answers.customBudget.trim());
      }
      const budgetDisplay = budgetParts.length > 0 ? budgetParts.join(' — ') : (answers.budgetTier || 'Flexible range');

      const prompt = `You are writing a project summary for Merakifos, an elite, quietly confident design studio.
A prospective client has completed their 8-step intake questionnaire: "A Little Context Before We Talk".

Here are their answers:
- Client / Brand Name: ${brandName}
- What They Do & Favorite Kind of Client (Q1): ${answers.businessAndClient || answers.businessSummary || 'Thoughtful, intentional work.'}
- First 5 Seconds Brand Vibe (Q2): ${Array.isArray(answers.brandVibe) ? answers.brandVibe.join('; ') : answers.brandVibe || answers.aestheticVibe || 'Warm, grounded, deeply personal'}
- Visual Colors & Taste (Q3): ${answers.visualColors || 'Muted, authentic, thoughtful palette'}
- Existing Assets in Toolkit (Q4): ${Array.isArray(answers.existingAssets) ? answers.existingAssets.join('; ') : 'Building the look from scratch'}
- Core Platform Objectives / Headaches Solved (Q5): ${Array.isArray(answers.coreObjectives) ? answers.coreObjectives.join('; ') : Array.isArray(answers.selectedFeatures) ? answers.selectedFeatures.join(', ') : 'Elevate presence'}
- Inspiration Sites Admired (Q6): ${answers.inspirationSites || answers.admirationUrls || 'Refined editorial design'}
- 6-Month Win / Success Outcome (Q7): ${answers.successOutcome || answers.successMetric || 'Booking ideal clients effortlessly'}
- Timing Comfort Zone (Q8a): ${timingDisplay}
- Investment Comfort Zone (Q8b): ${budgetDisplay}

Synthesize this into a warm, grounded, executive-grade one-page project summary.
FOLLOW THE MERAKIFOS BRAND PERSONALITY EXACTLY:
- Warm, plain spoken: "Your brand deserves to feel like you." Zero jargon anywhere.
- Quietly confident, not salesy: No exclamation points, no hype, no corporate puffery. "Let's Talk," not "Book a Call."
- Low pressure, reassuring: "A small, low risk way to start", "your accounts stay yours".
- Coherent, not fragmented: "Different hands, different feel... an easy fix." The whole promise is: Look like you.

CRITICAL DOCUMENT RULES:
- The Client Name is strictly the Brand Name (${brandName}).
- DO NOT output any metadata block at the top (DO NOT output "Client:", "Date:", "Email:", or "Project Brief:"). The document letterhead is rendered separately.
- DO NOT use any horizontal line separators (no "---", no "***", no "___").
- DO NOT use triple asterisks ("***") or markdown divider lines.
- DO NOT include conversational preamble (no "Here is your summary:", no "Certainly!").
- Start directly with: "1. WHAT YOU'RE BUILDING & WHO IT'S FOR"

CRITICAL ACCURACY REQUIREMENT FOR SECTION 5:
- In "5. INVESTMENT, TIMING & NEXT STEPS", you MUST state the client's chosen timing and budget EXACTLY as provided:
  • Timeline: ${timingDisplay}
  • Investment Comfort Zone: ${budgetDisplay}
- DO NOT invent, increase, or replace the client's budget or timeline with standard studio default numbers (for example, if the client selected "Less than $1000", output that exact comfort zone; if the client selected "As soon as humanly possible (next 4–6 weeks)", output that exact timeline. NEVER replace them with "$3,000 – $6,000" or "2 to 3 months" unless specifically chosen).

Format cleanly as a publication-ready document with exactly these 5 numbered sections:
1. WHAT YOU'RE BUILDING & WHO IT'S FOR
2. WHAT WE'LL PUT TOGETHER FOR YOU
3. HOW IT WILL LOOK & FEEL
4. THE SIX-MONTH WIN (SUCCESS OUTCOME)
5. INVESTMENT, TIMING & NEXT STEPS`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      let rawText = response.text || '';
      // Clean separators, metadata, and conversational noise
      rawText = rawText.replace(/^```[a-z]*\s*\n?/im, '').replace(/\n?```\s*$/m, '');
      rawText = rawText.replace(/^(?:Here (?:is|are)|Below is|Sure,?|Certainly!?)[^\n]*\n+/i, '');
      rawText = rawText.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');
      rawText = rawText.replace(/\*\*\*/g, '');

      return res.json({ brief: rawText });
    } catch (err: any) {
      console.error('Gemini synthesis failed:', err);
      return res.json({ brief: null, error: err.message });
    }
  });

  // Submit client response & log to spreadsheet database
  app.post('/api/submit-response', async (req, res) => {
    try {
      const sanitizedPayload = sanitizeSubmissionPayload(req.body);
      if (!sanitizedPayload.isValid) {
        return res.status(400).json({ error: sanitizedPayload.errors.join(', ') });
      }

      const { id, answers, brief, approved } = sanitizedPayload.sanitized;
      const submissions = await loadSubmissions();

      // Find existing submission if id is provided or matching unapproved draft
      let existingIndex = -1;
      if (id) {
        existingIndex = submissions.findIndex((s) => s.id === id);
      } else if (answers.clientEmail || answers.companyName) {
        existingIndex = submissions.findIndex(
          (s) =>
            !s.approved &&
            ((answers.clientEmail && s.clientEmail === answers.clientEmail) ||
              (answers.companyName && s.companyName === answers.companyName))
        );
      }

      const entryId = existingIndex >= 0 ? submissions[existingIndex].id : (id || 'sub_' + Date.now());
      const nowIso = new Date().toISOString();

      const newEntry: StoredSubmission = {
        id: entryId,
        timestamp: existingIndex >= 0 ? submissions[existingIndex].timestamp : nowIso,
        approved: !!approved,
        approvedAt: approved ? nowIso : (existingIndex >= 0 ? submissions[existingIndex].approvedAt : undefined),
        clientName: answers.clientName || '',
        clientEmail: answers.clientEmail || '',
        companyName: answers.companyName || '',
        businessAndClient: answers.businessAndClient || answers.businessSummary || '',
        brandVibe: answers.brandVibe || [],
        visualColors: answers.visualColors || '',
        selectedColors: answers.selectedColors || [],
        existingAssets: answers.existingAssets || [],
        coreObjectives: answers.coreObjectives || [],
        inspirationSites: answers.inspirationSites || '',
        successOutcome: answers.successOutcome || '',
        timelineSelection: answers.timelineSelection || '',
        customTimeline: answers.customTimeline || '',
        budgetSelection: answers.budgetSelection || '',
        customBudget: answers.customBudget || '',
        hasDomain: !!answers.hasDomain,
        domainName: answers.domainName || '',
        needDomainHelp: !!answers.needDomainHelp,
        websiteStatus: answers.websiteStatus || 'new',
        businessSummary: answers.businessSummary || answers.businessAndClient || '',
        primaryGoal: answers.primaryGoal || 'leads',
        targetAudience: answers.targetAudience || 'b2b_executives',
        corePainPoint: answers.corePainPoint || '',
        aestheticVibe: answers.aestheticVibe || 'minimal_clean',
        selectedFeatures: answers.selectedFeatures || answers.coreObjectives || [],
        budgetTier: answers.budgetSelection || answers.budgetTier || '',
        targetLaunchWindow: answers.timelineSelection || answers.targetLaunchWindow || '',
        brief: brief || '',
      };

      if (existingIndex >= 0) {
        submissions[existingIndex] = newEntry;
      } else {
        submissions.unshift(newEntry);
      }
      await saveSubmission(newEntry);

      if (approved) {
        console.log(`[MERAKIFOS SUBMISSION] Approved Brief received for "${newEntry.companyName}" from ${newEntry.clientName} (${newEntry.clientEmail})!`);
        // Automatically dispatch a copy to the private Studio recipient.
        try {
          await sendBriefCopyEmail({ submission: newEntry, recordOutbox: saveOutboxEntry });
        } catch (emailErr) {
          console.error('[EMAIL AUTO-SEND] Failed to dispatch copy:', emailErr);
        }
      }

      res.json({ success: true, entry: newEntry, id: entryId });
    } catch (err: any) {
      console.error('Failed to submit response:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GDPR Article 17 "Right to be Forgotten" & CCPA Deletion Endpoint
  app.post('/api/gdpr/delete-request', async (req, res) => {
    try {
      const { clientEmail } = req.body;
      const { isValid, email: cleanEmail } = sanitizeEmail(clientEmail);
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid email address provided.' });
      }

      const result = await purgeClientDataByEmail(cleanEmail);
      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: `No active discovery submissions found for ${cleanEmail}.`,
        });
      }

      return res.json({
        success: true,
        deletedCount: result.deletedCount,
        message: `Successfully deleted ${result.deletedCount} record(s) under GDPR Article 17.`,
      });
    } catch (err: any) {
      console.error('GDPR deletion error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get all submissions for spreadsheet export / review
  app.get('/api/submissions', requireStudioAccess, async (_req, res) => {
    try {
      res.json(await loadSubmissions());
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      res.status(500).json({ error: 'Failed to load submissions' });
    }
  });

  // Download submissions as a real Microsoft Excel (.xlsx) workbook
  app.get('/api/submissions/excel', requireStudioAccess, async (_req, res) => {
    try {
      const list = await loadSubmissions();
      const buffer = buildSubmissionsExcelWorkbook(list);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="merakifos_client_responses.xlsx"'
      );
      res.send(buffer);
    } catch (err: any) {
      console.error('Failed to export Excel workbook:', err);
      res.status(500).json({ error: 'Failed to generate Excel file' });
    }
  });

  // Download a single submission as Microsoft Excel (.xlsx)
  app.get('/api/submissions/:id/excel', requireStudioAccess, async (req, res) => {
    try {
      const list = await loadSubmissions();
      const sub = list.find((s) => s.id === req.params.id);
      if (!sub) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      const buffer = buildSingleClientExcel(sub);
      const safeName = (sub.companyName || 'client').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="merakifos_${safeName}_brief.xlsx"`
      );
      res.send(buffer);
    } catch (err: any) {
      console.error('Failed to export single Excel sheet:', err);
      res.status(500).json({ error: 'Failed to generate Excel file' });
    }
  });

  // Manually dispatch / resend copy of brief to founder or custom recipient
  app.post('/api/send-brief-copy', requireStudioAdmin, async (req, res) => {
    try {
      const { submissionId, recipientEmail, customNote } = req.body;
      const list = await loadSubmissions();
      const sub = list.find((s) => s.id === submissionId);
      if (!sub) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      const result = await sendBriefCopyEmail({
        submission: sub,
        recordOutbox: saveOutboxEntry,
        recipient: recipientEmail || DEFAULT_FOUNDER_EMAIL,
        customNote,
      });

      res.json({
        success: true,
        recipient: result.recipient,
        messageId: result.messageId,
        entry: result.entry,
      });
    } catch (err: any) {
      console.error('Failed to dispatch brief copy email:', err);
      res.status(500).json({ error: err.message || 'Failed to send email' });
    }
  });

  // Get email outbox log for studio portal
  app.get('/api/outbox', requireStudioAccess, async (_req, res) => {
    try {
      res.json(await loadOutbox());
    } catch (err: any) {
      console.error('Failed to load email outbox:', err);
      res.status(500).json({ error: 'Failed to load email outbox' });
    }
  });

  // Delete / archive a submission
  app.delete('/api/submissions/:id', requireStudioAdmin, async (req, res) => {
    try {
      await deleteSubmission(req.params.id);
      const remaining = await loadSubmissions();
      res.json({ success: true, count: remaining.length });
    } catch (err: any) {
      console.error('Failed to delete submission:', err);
      res.status(500).json({ error: 'Failed to delete submission' });
    }
  });

  // Download submissions as CSV (Spreadsheet)
  app.get('/api/submissions/csv', requireStudioAccess, async (_req, res) => {
    try {
      const list = await loadSubmissions();
      const headers = [
        'Timestamp',
        'Client Name',
        'Email',
        'Company Name',
        'Domain Status',
        'Domain Name',
        'Need Domain Help',
        'Website Status',
        'Primary Goal',
        'Target Audience',
        'Aesthetic Vibe',
        'Features Count',
        'Budget Tier',
        'Launch Window',
        'Color Palette',
        'Client Approved',
      ];

      const rows = list.map((item) => [
        `"${item.timestamp}"`,
        `"${item.clientName.replace(/"/g, '""')}"`,
        `"${item.clientEmail.replace(/"/g, '""')}"`,
        `"${item.companyName.replace(/"/g, '""')}"`,
        item.hasDomain ? '"Has Domain"' : '"No Domain"',
        `"${(item.domainName || '').replace(/"/g, '""')}"`,
        item.needDomainHelp ? '"Yes"' : '"No"',
        `"${item.websiteStatus}"`,
        `"${item.primaryGoal}"`,
        `"${item.targetAudience}"`,
        `"${item.aestheticVibe}"`,
        item.selectedFeatures ? item.selectedFeatures.length : 0,
        `"${item.budgetTier}"`,
        `"${item.targetLaunchWindow}"`,
        `"${(item.selectedColors || []).join('; ')}"`,
        item.approved ? '"Approved"' : '"Pending"',
      ]);

      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="merakifos_discovery_submissions.csv"');
      res.send(csvContent);
    } catch (err) {
      console.error('Failed to export submissions as CSV:', err);
      res.status(500).json({ error: 'Failed to generate CSV file' });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

export default app;
