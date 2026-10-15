import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  StoredSubmission,
  buildSubmissionsExcelWorkbook,
  buildSingleClientExcel,
  sendBriefCopyEmail,
  DEFAULT_FOUNDER_EMAIL,
} from './serverEmailAndExcel.js';
import {
  deleteSubmission,
  getStudioAuth,
  loadOutbox,
  loadSubmissions,
  purgeClientDataByEmail,
  saveOutboxEntry,
  saveSubmission,
} from './serverStore.js';
import {
  sanitizeSubmissionPayload,
  sanitizeEmail,
  sanitizePlainText,
} from './src/utils/sanitizer.js';

dotenv.config();

const app = express();
const ownerEmail = (process.env.STUDIO_OWNER_EMAIL || 'kelvensarbah@gmail.com').toLowerCase();

  // OWASP Top 10 Security Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  const requireStudioOwner: express.RequestHandler = async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Studio sign-in required.' });
      return;
    }

    try {
      const decodedToken = await getStudioAuth().verifyIdToken(token);
      if (decodedToken.email?.toLowerCase() !== ownerEmail || !decodedToken.email_verified) {
        res.status(403).json({ error: 'Studio access is restricted to the owner account.' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired studio sign-in.' });
    }
  };

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
        // Automatically dispatch a copy of the approved brief to Keven (kelvensarbah@gmail.com)
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
  app.get('/api/submissions', requireStudioOwner, async (_req, res) => {
    try {
      res.json(await loadSubmissions());
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      res.status(500).json({ error: 'Failed to load submissions' });
    }
  });

  // Download submissions as a real Microsoft Excel (.xlsx) workbook
  app.get('/api/submissions/excel', requireStudioOwner, async (_req, res) => {
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
  app.get('/api/submissions/:id/excel', requireStudioOwner, async (req, res) => {
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
  app.post('/api/send-brief-copy', requireStudioOwner, async (req, res) => {
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
  app.get('/api/outbox', requireStudioOwner, async (_req, res) => {
    try {
      res.json(await loadOutbox());
    } catch (err: any) {
      console.error('Failed to load email outbox:', err);
      res.status(500).json({ error: 'Failed to load email outbox' });
    }
  });

  // Delete / archive a submission
  app.delete('/api/submissions/:id', requireStudioOwner, async (req, res) => {
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
  app.get('/api/submissions/csv', requireStudioOwner, async (_req, res) => {
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
