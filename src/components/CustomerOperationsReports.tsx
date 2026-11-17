import React from 'react';
import { auth } from '../services/auth';
import type { TicketReport } from '../../customerOperationsReporting';

export default function CustomerOperationsReports({ businessId }: { businessId: string }) {
  const today = new Date().toISOString().slice(0,10);
  const [start,setStart] = React.useState(new Date(Date.now()-29*86400000).toISOString().slice(0,10));
  const [end,setEnd] = React.useState(today);
  const [report,setReport] = React.useState<TicketReport | null>(null);
  const [ai,setAI] = React.useState<{reason:string} | null>(null);
  const [error,setError] = React.useState('');
  const [loading,setLoading] = React.useState(false);
  const requestId = React.useRef(0);
  async function load(event?: React.FormEvent) {
    event?.preventDefault();
    const id = ++requestId.current;
    setLoading(true); setError(''); setReport(null); setAI(null);
    try {
      if (!auth.currentUser) throw new Error('Sign in to view reports.');
      const headers = { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
      const base = `/api/customer-operations/businesses/${encodeURIComponent(businessId)}`;
      const fetchJSON = async (path:string) => {
        const response = await fetch(path,{headers,cache:'no-store'});
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load reports.');
        return body;
      };
      const [data,status] = await Promise.all([fetchJSON(`${base}/reports?${new URLSearchParams({start,end})}`),fetchJSON(`${base}/ai`)]);
      if (id === requestId.current) {setReport(data); setAI(status);}
    } catch(e) { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Could not load reports.'); }
    finally {if(id === requestId.current) setLoading(false);}
  }
  React.useEffect(() => { void load(); return () => {requestId.current++;}; }, [businessId]);
  const duration = (value:TicketReport['resolution']) => value.minutes === null ? 'Not recorded' : `${Math.round(value.minutes)} min (${value.samples} tickets)`;
  return <section aria-label="Business reports" className="space-y-6">
    <p className="text-sm text-slate-600">Ticket creation cohort, UTC dates. Counts show the current status of tickets created in the selected period, rather than a historical snapshot. Maximum 90 days and 5,000 tickets.</p>
    <form onSubmit={load} className="flex flex-wrap items-end gap-4">
      <label className="text-sm">From<input className="mt-1 block rounded border p-2" type="date" value={start} max={end} required onChange={e=>setStart(e.target.value)} /></label>
      <label className="text-sm">Through<input className="mt-1 block rounded border p-2" type="date" value={end} min={start} max={today} required onChange={e=>setEnd(e.target.value)} /></label>
      <button disabled={loading} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{loading ? 'Loading…' : 'Apply dates'}</button>
    </form>
    <div aria-live="polite" role="status">{loading && 'Loading reports…'}</div>
    {error && <p role="alert" className="rounded border border-red-200 p-4 text-red-800">{error}</p>}
    {report && <>
      {report.total === 0 && <p className="rounded border p-4">No tickets were created in this period. Try a different date range.</p>}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Object.entries({Tickets:report.total,'Open / active':report.open,'Resolved / closed':report.resolved,Unassigned:report.unassigned,Urgent:report.urgent,'Waiting on customer':report.waiting}).map(([label,value])=><div className="border-b py-3" key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}
      </dl>
      <dl className="space-y-2 text-sm"><div><dt className="font-medium">Average recorded first response</dt><dd>{duration(report.firstResponse)}</dd></div><div><dt className="font-medium">Average recorded resolution</dt><dd>{duration(report.resolution)}</dd></div></dl>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="font-medium">SLA · latest cycle</dt><dd>{report.sla.met} met · {report.sla.breached} breached · {report.sla.pending} pending ({report.sla.samples} measured tickets)</dd></div>
        <div><dt className="font-medium">Tickets reopened</dt><dd>{report.reopenRate.percent===null?'Not recorded':`${report.reopenRate.percent.toFixed(1)}% (${report.reopenRate.samples} measured tickets)`}</dd></div>
        <div><dt className="font-medium">Customer satisfaction</dt><dd>{report.satisfaction.score===null?'No responses':`${report.satisfaction.score.toFixed(1)} / 5 (${report.satisfaction.samples} responses)`}</dd><dd>{report.satisfaction.offered??'Unknown'} surveys offered in the period</dd></div>
      </dl>
      <div className="grid gap-6 sm:grid-cols-2">{(['byStatus','byChannel','byCategory','byAgent'] as const).map((key)=><table key={key} className="w-full text-left text-sm"><caption className="mb-2 text-left font-semibold">{{byStatus:'Status',byChannel:'Source channel',byCategory:'Category',byAgent:'Agent assignments (all cohort tickets)'}[key]}</caption><thead><tr><th scope="col" className="border-b p-2">Group</th><th scope="col" className="border-b p-2 text-right">Tickets</th></tr></thead><tbody>{report[key].map(row=><tr key={row.label}><th scope="row" className="break-all border-b p-2 font-normal">{row.label.replaceAll('_',' ')}</th><td className="border-b p-2 text-right">{row.count}</td></tr>)}{report[key].length === 0 && <tr><td colSpan={2} className="p-2 text-slate-600">No data</td></tr>}</tbody></table>)}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{report.unavailable.map(text=><li key={text}>{text}</li>)}</ul>
      <p className="text-xs text-slate-500">Generated {new Date(report.generatedAt).toLocaleString()}</p>
    </>}
    {ai && <aside className="rounded border p-4"><h2 className="font-semibold">AI copilot · Not connected</h2><p className="mt-2 text-sm text-slate-600">{ai.reason} Any future customer-facing suggestion must be approved by an agent before sending.</p></aside>}
  </section>;
}
