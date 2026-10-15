import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  StoredSubmission,
  buildSubmissionsExcelWorkbook,
  buildSingleClientExcel,
  sendBriefCopyEmail,
  DEFAULT_FOUNDER_EMAIL,
} from './serverEmailAndExcel.js';
import {
  deleteSubmission,
  deleteStudioInvite,
  getStudioAuth,
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
  type ProjectComment,
  type ProjectTask,
  type StudioProject,
} from './serverStore.js';
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
      return { isOwner, role: isOwner ? 'super_admin' as const : invite?.role || null };
    } catch {
      res.status(401).json({ error: 'Invalid or expired studio sign-in.' });
      return null;
    }
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
      next();
      return;
    }
    res.status(403).json({ error: 'Your Studio role does not allow this action.' });
  };

  const requireStudioOwnerAccess: express.RequestHandler = async (req, res, next) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    if (identity.isOwner) {
      next();
      return;
    }
    res.status(403).json({ error: 'Only the Studio owner can manage invitations.' });
  };

  app.get('/api/studio/access', async (req, res) => {
    const identity = await verifyStudioIdentity(req, res);
    if (!identity) return;
    return res.json({ allowed: identity.isOwner || Boolean(identity.role), isOwner: identity.isOwner, role: identity.role });
  });

  app.get('/api/studio/invites', requireStudioOwnerAccess, async (_req, res) => {
    try {
      return res.json(await loadStudioInvites());
    } catch (error) {
      console.error('Failed to load Studio invites:', error);
      return res.status(500).json({ error: 'Could not load invitations.' });
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
      await saveStudioInvite({
        email: email.toLowerCase(),
        role,
        invitedBy: (decodedToken.email || '').toLowerCase(),
        createdAt: new Date().toISOString(),
      });
      return res.status(201).json({ success: true, email: email.toLowerCase() });
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
