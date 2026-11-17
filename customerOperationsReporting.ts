import express from 'express';
import type { CustomerOperationsBusinessMembership, CustomerOperationsTicket } from './src/types/customerOperations.js';

export const REPORT_LIMIT = 5000;
export type ReportTicket = Pick<CustomerOperationsTicket, 'businessId' | 'createdAt' | 'status' | 'priority' | 'assignedAgent' | 'source' | 'category' | 'firstResponseAt' | 'resolvedAt' | 'slaTargetAt' | 'reopenCount'>;
export function businessAccessStatus(identity: { platformRole: string | null; businesses: CustomerOperationsBusinessMembership[] }, businessId: string): 200 | 403 | 404 {
  if (identity.platformRole) return 403;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) return 404;
  return identity.businesses.some(m => m.businessId === businessId && m.active) ? 200 : 404;
}
export function reportRange(start: unknown, end: unknown, now = new Date()) {
  const date = (v: unknown) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Use YYYY-MM-DD dates.');
    const parsed = new Date(v + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v) throw new Error('Invalid calendar date.');
    return parsed;
  };
  const today = now.toISOString().slice(0, 10);
  const from = date(start ?? new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10));
  const last = date(end ?? today);
  const to = new Date(last.getTime() + 86400000);
  if (from > last || to.getTime() - from.getTime() > 90 * 86400000 || last > date(today)) throw new Error('Choose a past or current date range of at most 90 days.');
  return { start: from.toISOString(), endExclusive: to.toISOString() };
}
export type ReportFeedback = { score?:number; resolved?:boolean; submittedAt?:string|null };
export function buildTicketReport(businessId: string, range: ReturnType<typeof reportRange>, rows: ReportTicket[], feedback:ReportFeedback[]|null=null) {
  if (rows.length > REPORT_LIMIT) throw new Error('Report exceeds 5,000 tickets. Choose a shorter date range.');
  if (rows.some(t => t.businessId !== businessId || t.createdAt < range.start || t.createdAt >= range.endExclusive)) throw new Error('Report scope validation failed.');
  const count = (key: 'status' | 'source' | 'category' | 'assignedAgent') => {
    const counts = new Map<string, number>();
    for (const row of rows) { const value = row[key] || (key === 'assignedAgent' ? 'Unassigned' : 'Uncategorized'); counts.set(value, (counts.get(value) || 0) + 1); }
    return [...counts].map(([label, count]) => ({ label, count })).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label));
  };
  const elapsed = (field: 'firstResponseAt' | 'resolvedAt') => {
    const values = rows.flatMap(t => { const d = t[field] ? Date.parse(t[field]) - Date.parse(t.createdAt) : NaN; return Number.isFinite(d) && d >= 0 ? [d / 60000] : []; });
    return { minutes: values.length ? values.reduce((a,b) => a+b,0)/values.length : null, samples: values.length };
  };
  const active = rows.filter(t => !['resolved','closed'].includes(t.status));
  const slaRows=rows.filter(t=>t.slaTargetAt&&Number.isFinite(Date.parse(t.slaTargetAt)));
  const met=slaRows.filter(t=>t.resolvedAt&&Date.parse(t.resolvedAt)<=Date.parse(t.slaTargetAt!)).length;
  const breached=slaRows.filter(t=>Date.parse(t.resolvedAt || new Date().toISOString())>Date.parse(t.slaTargetAt!)).length;
  const reopenRows=rows.filter(t=>typeof t.reopenCount==='number');
  const reopened=reopenRows.filter(t=>t.reopenCount!>0).length;
  const scores=feedback?.filter(f=>f.submittedAt&&Number.isInteger(f.score)&&f.score!>=1&&f.score!<=5)||[];
  return { businessId, range, generatedAt: new Date().toISOString(), total: rows.length,
    open: active.length, resolved: rows.filter(t => ['resolved','closed'].includes(t.status)).length,
    unassigned: active.filter(t => !t.assignedAgent).length, urgent: active.filter(t => t.priority === 'urgent').length,
    waiting: rows.filter(t => t.status === 'waiting_on_customer').length,
    firstResponse: elapsed('firstResponseAt'), resolution: elapsed('resolvedAt'),
    byStatus: count('status'), byChannel: count('source'), byCategory: count('category'), byAgent: count('assignedAgent'),
    sla: { met, breached, pending:slaRows.length-met-breached, samples:slaRows.length },
    reopenRate: {percent:reopenRows.length?reopened/reopenRows.length*100:null,samples:reopenRows.length},
    satisfaction: {score:scores.length?scores.reduce((sum,f)=>sum+f.score!,0)/scores.length:null,samples:scores.length,submitted:scores.length,offered:feedback?.length??null},
    unavailable: ['Legacy tickets without SLA or reopen instrumentation are excluded from those measurements.', 'SLA results describe the latest ticket cycle. Satisfaction uses surveys offered in the selected dates, which may concern older tickets.', 'First-response time only includes recorded timestamps; older workflows may have none.'],
  };
}
export type TicketReport = ReturnType<typeof buildTicketReport>;

// No provider is activated by a Gemini key used elsewhere in the application.
// Approval of tenant data handling and a server-side adapter are required first.
export interface CustomerOperationsAIProvider {
  suggest(input: { businessId: string; purpose: 'summary' | 'reply'; permittedText: string; signal: AbortSignal }): Promise<{ suggestion: string }>;
}
export const customerOperationsAIStatus = Object.freeze({ connected: false, provider: null, humanApprovalRequired: true,
  reason: 'No Customer Operations AI provider or tenant data-handling approval is configured. No customer data is sent to AI.' });

export function reportingRouter(deps: {
  authorize: express.RequestHandler;
  loadTickets: (businessId: string, range: ReturnType<typeof reportRange>) => Promise<ReportTicket[]>;
  loadFeedback?: (businessId:string,range:ReturnType<typeof reportRange>)=>Promise<ReportFeedback[]>;
}) {
  const router = express.Router({ mergeParams: true });
  router.use(['/reports', '/ai'], deps.authorize);
  router.use(['/reports', '/ai'], (_req,res,next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
  router.use(['/reports', '/ai'], (_req,res,next) => {
    if (!['business_owner','business_manager'].includes(res.locals.customerOperationsBusinessRole)) {
      res.status(403).json({ error: 'Business owner or manager access is required for reports and AI configuration.' }); return;
    }
    next();
  });
  router.get('/ai', (_req,res) => res.json(customerOperationsAIStatus));
  router.get<{ businessId: string }>('/reports', async (req,res) => {
    let range: ReturnType<typeof reportRange>;
    if (Object.keys(req.query).some(key => !['start','end'].includes(key))) { res.status(400).json({error:'Only start and end date filters are supported.'}); return; }
    try { range = reportRange(req.query.start,req.query.end); }
    catch (error) { res.status(400).json({error:(error as Error).message}); return; }
    try {
      const [rows,feedback] = await Promise.all([deps.loadTickets(req.params.businessId,range),deps.loadFeedback?deps.loadFeedback(req.params.businessId,range):Promise.resolve(null)]);
      if (rows.length > REPORT_LIMIT) { res.status(422).json({error:'Report exceeds 5,000 tickets. Choose a shorter date range.'}); return; }
      if(feedback&&feedback.length>REPORT_LIMIT){res.status(422).json({error:'Report exceeds 5,000 surveys. Choose a shorter date range.'});return;}
      res.json(buildTicketReport(req.params.businessId,range,rows,feedback));
    } catch (error) {
      console.error('Customer Operations report failed:',error);
      res.status(503).json({error:'Report unavailable. Check database access and reporting indexes, then retry.'});
    }
  });
  return router;
}
