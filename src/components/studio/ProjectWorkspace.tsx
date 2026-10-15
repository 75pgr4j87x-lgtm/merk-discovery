import React from 'react';
import { CalendarDays, Check, Clipboard, GripVertical, MessageCircle, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { studioFetch } from '../../services/auth';
import { ProjectJourneyProgress } from '../ProjectJourneyProgress';
import { soundTrack } from '../../utils/soundtrack';

interface ProjectTask {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  priority: 'Severe' | 'High' | 'Medium' | 'Low';
  estimatedEffortDays: number;
  amount: number;
}

interface ProjectComment {
  id: string;
  taskId?: string;
  author: string;
  message: string;
  createdAt: string;
}

interface StudioProject {
  submissionId: string;
  title: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  brandColors: string[];
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

interface ProjectWorkspaceProps {
  submissionId: string;
  onClose: () => void;
}

const currencies = ['USD', 'CAD', 'GBP', 'EUR', 'GHS'];
const priorities: ProjectTask['priority'][] = ['Severe', 'High', 'Medium', 'Low'];
const priorityStyle: Record<ProjectTask['priority'], string> = {
  Severe: 'border-red-200 bg-red-50 text-red-800',
  High: 'border-orange-200 bg-orange-50 text-orange-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  Low: 'border-[#D9E3D2] bg-[#F1F5EE] text-[#526A48]',
};
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(amount || 0);

const distributeProjectFee = (tasks: ProjectTask[], total: number) => {
  const totalEffort = tasks.reduce((sum, task) => sum + Math.max(0.5, task.estimatedEffortDays || 1), 0);
  let remainingCents = Math.round(total * 100);
  return tasks.map((task) => {
    const amount = task === tasks[tasks.length - 1]
      ? remainingCents / 100
      : Math.floor((total * Math.max(0.5, task.estimatedEffortDays || 1) / totalEffort) * 100) / 100;
    remainingCents -= Math.round(amount * 100);
    return { ...task, amount };
  });
};

const estimateEffortDays = (title: string) => {
  const work = title.toLowerCase();
  if (/checkout|payment|integration|automation|subscription|database/.test(work)) return 5;
  if (/website build|responsive layout|storefront|product setup/.test(work)) return 8;
  if (/implement:/.test(work)) return /e-?commerce|subscription|portal|automation|integration|database/.test(work) ? 7 : 4;
  if (/visual direction|page design|design/.test(work)) return 5;
  if (/content structure|copy|content/.test(work)) return 3;
  if (/accessibility|performance|qa|quality|discovery|research|strategy/.test(work)) return 3;
  if (/launch|handoff|client review/.test(work)) return 2;
  return 3;
};

const inferPriority = (title: string): ProjectTask['priority'] => {
  const work = title.toLowerCase();
  if (/security|privacy|compliance|payment|checkout|data migration|launch blocker/.test(work)) return 'Severe';
  if (/integration|automation|subscription|e-commerce|storefront|database|accessibility/.test(work)) return 'High';
  if (/launch|handoff|client review|quality|qa|performance/.test(work)) return 'Low';
  return 'Medium';
};

const scheduleTaskDates = (tasks: ProjectTask[], startDate: string, endDate: string) => {
  if (!startDate || !endDate || startDate > endDate) return tasks.map((task) => ({ ...task, dueDate: '' }));
  const workdays: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) workdays.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!workdays.length) workdays.push(startDate);
  const totalEffort = tasks.reduce((sum, task) => sum + Math.max(0.5, task.estimatedEffortDays || 1), 0);
  let completedEffort = 0;
  return tasks.map((task) => {
    completedEffort += Math.max(0.5, task.estimatedEffortDays || 1);
    const offset = Math.min(workdays.length - 1, Math.max(0, Math.ceil(completedEffort / totalEffort * workdays.length) - 1));
    return { ...task, dueDate: workdays[offset] };
  });
};

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({ submissionId, onClose }) => {
  const [project, setProject] = React.useState<StudioProject | null>(null);
  const [activeTab, setActiveTab] = React.useState<'board' | 'invoice'>('board');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [shareLink, setShareLink] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [draggedTask, setDraggedTask] = React.useState<string | null>(null);
  const [activeCommentTaskId, setActiveCommentTaskId] = React.useState<string | null>(null);
  const [commentDraft, setCommentDraft] = React.useState('');
  const [commentSending, setCommentSending] = React.useState(false);
  const [selectedJourneyStage, setSelectedJourneyStage] = React.useState<number | null>(null);

  React.useEffect(() => {
    let active = true;
    studioFetch(`/api/projects/${encodeURIComponent(submissionId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Could not load this project (HTTP ${response.status}).`);
        }
        if (!data) throw new Error('The project service returned an unreadable response.');
        if (active) setProject(data);
      })
      .catch((error) => setNotice(error.message || 'Could not load this project.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [submissionId]);

  const changeProject = (update: (current: StudioProject) => StudioProject) => {
    setProject((current) => current ? update(current) : current);
    setDirty(true);
  };

  const updateSchedule = (update: (current: StudioProject) => StudioProject) => changeProject((current) => {
    const updated = update(current);
    return { ...updated, tasks: scheduleTaskDates(updated.tasks, updated.projectStartDate, updated.projectEndDate) };
  });

  const saveProject = async () => {
    if (!project) return false;
    setSaving(true);
    setNotice('');
    try {
      const response = await studioFetch(`/api/projects/${encodeURIComponent(submissionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save project.');
      setProject(data);
      setDirty(false);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save project.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createShareLink = async () => {
    if (dirty && !(await saveProject())) return;
    try {
      const response = await studioFetch(`/api/projects/${encodeURIComponent(submissionId)}/share`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create a client link.');
      const link = `${window.location.origin}/#project=${encodeURIComponent(data.token)}`;
      setShareLink(link);
      await navigator.clipboard.writeText(link);
      const isLocalLink = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      setNotice(isLocalLink
        ? 'Local test link copied. It only works on this computer while the development server is running; create the client link from the deployed site to share it.'
        : 'Client link copied. Creating another link will revoke this one.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create a client link.');
    }
  };

  const addTask = (status: string) => changeProject((current) => {
    const tasks = distributeProjectFee(
      [...current.tasks, { id: crypto.randomUUID(), title: 'New task', description: '', status, dueDate: '', priority: 'Medium', estimatedEffortDays: 3, amount: 0 }],
      current.projectCharge,
    );
    return { ...current, tasks: scheduleTaskDates(tasks, current.projectStartDate, current.projectEndDate) };
  });

  const patchTask = (taskId: string, patch: Partial<ProjectTask>) => changeProject((current) => {
    const tasks = distributeProjectFee(
      current.tasks.map((task) => task.id === taskId
        ? {
            ...task,
            ...patch,
            estimatedEffortDays: patch.title === undefined ? task.estimatedEffortDays : estimateEffortDays(patch.title),
            priority: patch.priority || (patch.title === undefined ? task.priority : inferPriority(patch.title)),
          }
        : task),
      current.projectCharge,
    );
    return { ...current, tasks: scheduleTaskDates(tasks, current.projectStartDate, current.projectEndDate) };
  });

  const sendTaskComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCommentTaskId || !commentDraft.trim()) return;
    setCommentSending(true);
    setNotice('');
    try {
      const response = await studioFetch(`/api/projects/${encodeURIComponent(submissionId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: activeCommentTaskId, message: commentDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add task comment.');
      setProject((current) => current ? { ...current, comments: [...current.comments, data.comment] } : current);
      setCommentDraft('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add task comment.');
    } finally {
      setCommentSending(false);
    }
  };

  const updateCharge = (value: number) => changeProject((current) => {
    const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
    const tasks = distributeProjectFee(current.tasks, safeValue);
    return { ...current, projectCharge: safeValue, tasks };
  });

  const addColumn = () => changeProject((current) => ({ ...current, columns: [...current.columns, `Stage ${current.columns.length + 1}`] }));
  const renameColumn = (index: number, name: string) => changeProject((current) => {
    const columns = [...current.columns];
    const previous = columns[index];
    columns[index] = name;
    return { ...current, columns, tasks: current.tasks.map((task) => task.status === previous ? { ...task, status: name } : task) };
  });
  const removeColumn = (index: number) => changeProject((current) => {
    if (current.columns.length <= 1) return current;
    const removed = current.columns[index];
    const columns = current.columns.filter((_, columnIndex) => columnIndex !== index);
    return { ...current, columns, tasks: current.tasks.map((task) => task.status === removed ? { ...task, status: columns[0] } : task) };
  });

  if (loading) return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 text-sm">Loading project workspace...</div>;
  if (!project) return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="bg-white p-6 rounded-lg">{notice || 'Project unavailable.'}<button onClick={onClose} className="ml-4 underline">Close</button></div></div>;

  const subtotal = project.projectCharge;
  const discount = subtotal * Math.min(100, Math.max(0, project.discountPercent || 0)) / 100;
  const discountedSubtotal = subtotal - discount;
  const miscellaneous = discountedSubtotal * 0.1;
  const primaryColor = project.brandColors[0] || '#3F4A32';

  return (
    <div className="merakifos-ui merakifos-studio-workspace fixed inset-0 z-50 overflow-y-auto bg-[#FAF6F1] text-[#3F4A32]">
      <style>{`@media print { body * { visibility: hidden !important; } .invoice-print, .invoice-print * { visibility: visible !important; } .invoice-print { position: absolute !important; inset: 0 !important; width: 100% !important; padding: 28px !important; } .workspace-no-print { display: none !important; } }`}</style>
      <header className="workspace-no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#D9DED7] bg-white px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#6F786F]">Studio project</div>
          <h1 className="truncate text-lg font-semibold">{project.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={createShareLink} className="inline-flex items-center gap-2 border border-[#E5EADF] bg-white px-3 py-2 text-xs text-[#3F4A32] hover:bg-[#FAF6F1]"><Clipboard size={15} /> Share with client</button>
          <button onClick={saveProject} disabled={!dirty || saving} className="inline-flex items-center gap-2 bg-[#3F4A32] px-3 py-2 text-xs text-[#FAF6F1] disabled:opacity-40"><Save size={15} /> {saving ? 'Saving' : dirty ? 'Save changes' : 'Saved'}</button>
          <button onClick={onClose} aria-label="Close project" className="border border-transparent p-2 hover:border-[#CDD4CC]"><X size={17} /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-8">
        {notice && <div className="workspace-no-print mb-4 flex justify-between border border-[#D9DED7] bg-white px-3 py-2 text-xs"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
        {shareLink && <div className="workspace-no-print mb-4 break-all border-l-2 border-[#788F68] bg-white px-3 py-2 text-xs">{shareLink}</div>}
        <div className="workspace-no-print mb-5 flex border-b border-[#D9DED7]">
          <button onClick={() => setActiveTab('board')} className={`border-b-2 px-4 py-2 text-sm ${activeTab === 'board' ? 'border-[#25312B] font-semibold' : 'border-transparent text-[#6F786F]'}`}>Workflow board</button>
          <button onClick={() => setActiveTab('invoice')} className={`border-b-2 px-4 py-2 text-sm ${activeTab === 'invoice' ? 'border-[#25312B] font-semibold' : 'border-transparent text-[#6F786F]'}`}>Invoice</button>
        </div>

        {activeTab === 'board' && <section className="workspace-board">
          <div className="workspace-no-print mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold">Project workflow</h2><p className="text-xs text-[#6F786F]">Drag tasks between stages. Edit titles and scope; set project dates above to generate task targets.</p></div>
            <button onClick={addColumn} className="inline-flex items-center gap-2 border border-[#E5EADF] bg-white px-3 py-2 text-xs text-[#3F4A32]"><Plus size={15} /> Add stage</button>
          </div>
          <div className="workspace-no-print mb-4 grid max-w-3xl gap-3 sm:grid-cols-2">
            <label className="text-xs text-[#69736A]">Project start date<input type="date" value={project.projectStartDate} max={project.projectEndDate || undefined} onChange={(event) => updateSchedule((current) => ({ ...current, projectStartDate: event.target.value }))} className="mt-1 block w-full border border-[#E5EADF] bg-white px-3 py-2 text-sm text-[#3F4A32]" /></label>
            <label className="text-xs text-[#69736A]">Project end date<input type="date" value={project.projectEndDate} min={project.projectStartDate || undefined} onChange={(event) => updateSchedule((current) => ({ ...current, projectEndDate: event.target.value }))} className="mt-1 block w-full border border-[#E5EADF] bg-white px-3 py-2 text-sm text-[#3F4A32]" /></label>
          </div>
          <label className="workspace-no-print mb-4 block max-w-xl text-xs text-[#6F786F]">Project name
            <input value={project.title} onChange={(event) => changeProject((current) => ({ ...current, title: event.target.value }))} className="mt-1 block w-full border border-[#CDD4CC] bg-white px-3 py-2 text-sm text-[#25312B]" />
          </label>
          <div className="workspace-no-print mb-5">
            <ProjectJourneyProgress
              columns={project.columns}
              tasks={project.tasks}
              onSelectStage={(index) => {
                setSelectedJourneyStage(index);
                document.getElementById(`studio-stage-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
            />
          </div>
          <div className="flex items-start gap-3 overflow-x-auto pb-4">
            {project.columns.map((column, columnIndex) => <section key={`${columnIndex}-${column}`} onDragOver={(event) => event.preventDefault()} onDrop={() => {
              if (draggedTask) {
                const previousStatus = project.tasks.find((task) => task.id === draggedTask)?.status;
                if (previousStatus !== column) soundTrack.playSoftSwoosh();
                patchTask(draggedTask, { status: column });
              }
              setDraggedTask(null);
            }} id={`studio-stage-${columnIndex}`} className={`merakifos-column min-w-[280px] max-w-[340px] flex-1 border border-[#E5EADF] bg-[#F1F2EC] transition-shadow ${selectedJourneyStage === columnIndex ? 'ring-2 ring-[#D9A441]' : ''}`}>
              <div className="flex items-center gap-1 border-b border-[#D9DED7] bg-white p-2">
                <input aria-label="Stage name" value={column} onChange={(event) => renameColumn(columnIndex, event.target.value)} className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs font-semibold" />
                <span className="text-[10px] text-[#6F786F]">{project.tasks.filter((task) => task.status === column).length}</span>
                <button onClick={() => removeColumn(columnIndex)} title="Remove stage" className="p-1 text-[#6F786F] hover:text-red-700"><Trash2 size={13} /></button>
              </div>
              <div className="min-h-36 space-y-2 p-2">
                {project.tasks.filter((task) => task.status === column).map((task) => <article key={task.id} draggable onDragStart={() => setDraggedTask(task.id)} onDragEnd={() => setDraggedTask(null)} className="min-w-0 border border-[#D9DED7] bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-1">
                    <GripVertical size={14} className="shrink-0 cursor-grab text-[#899188]" />
                    <textarea rows={2} maxLength={160} value={task.title} onChange={(event) => patchTask(task.id, { title: event.target.value })} className="min-h-10 min-w-0 flex-1 resize-y whitespace-pre-wrap break-words text-xs font-semibold leading-snug outline-none" aria-label="Task title" />
                    <button onClick={() => updateSchedule((current) => ({
                      ...current,
                      tasks: distributeProjectFee(current.tasks.filter((item) => item.id !== task.id), current.projectCharge),
                      comments: current.comments.filter((comment) => comment.taskId !== task.id),
                    }))} title="Delete task" className="p-1 text-[#7C8B5F] hover:text-red-700"><Trash2 size={13} /></button>
                  </div>
                  {task.description && <p className="mb-2 whitespace-normal break-words text-xs leading-relaxed text-[#59645B]">{task.description}</p>}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className={`inline-flex items-center rounded-xl border px-2 py-1 text-xs font-medium ${priorityStyle[task.priority || 'Medium']}`}>
                      <span className="mr-1">Priority</span>
                      <select value={task.priority || 'Medium'} onChange={(event) => patchTask(task.id, { priority: event.target.value as ProjectTask['priority'] })} aria-label={`Priority for ${task.title}`} className="max-w-24 bg-transparent font-semibold outline-none">
                        {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </label>
                    <button onClick={() => { setActiveCommentTaskId(task.id); setCommentDraft(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5EADF] bg-white px-2.5 py-1.5 text-xs text-[#3F4A32] hover:bg-[#FAF6F1]" aria-label={`Open comments for ${task.title}`}>
                      <MessageCircle size={14} className="text-[#7C8B5F]" />
                      {project.comments.filter((comment) => comment.taskId === task.id).length || 'Comment'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 border-t border-[#E5EADF] pt-2 text-xs text-[#3F4A32]"><CalendarDays size={14} className="text-[#7C8B5F]" />Target date: {task.dueDate ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString() : 'Set project dates above'}</div>
                </article>)}
                <button onClick={() => addTask(column)} className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[#BFC8BE] py-2 text-xs text-[#3F4A32] hover:bg-white"><Plus size={14} /> Add task</button>
              </div>
            </section>)}
          </div>
          <div className="workspace-no-print mt-3 text-xs text-[#6F786F]">{project.tasks.length} tasks · Dates are generated from estimated effort and the selected project window.</div>
        </section>}

        {activeTab === 'invoice' && <section className="mx-auto max-w-[900px]">
          <div className="workspace-no-print mb-4 grid gap-3 rounded-2xl border border-[#E5EADF] bg-white p-4 sm:grid-cols-2">
            <label className="text-xs text-[#69736A]">Total project fee
              <input type="number" min="0" step="0.01" value={project.projectCharge} onChange={(event) => updateCharge(Number(event.target.value) || 0)} className="mt-1 block w-full border border-[#E5EADF] bg-[#FAF6F1] px-3 py-2 text-sm text-[#3F4A32]" />
            </label>
            <label className="text-xs text-[#69736A]">Currency
              <select value={project.currency} onChange={(event) => changeProject((current) => ({ ...current, currency: event.target.value }))} className="mt-1 block w-full border border-[#E5EADF] bg-[#FAF6F1] px-3 py-2 text-sm text-[#3F4A32]">{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>
            </label>
          </div>
          <p className="workspace-no-print mb-4 rounded-xl border-l-2 border-[#D9A441] bg-white px-4 py-3 text-xs leading-relaxed text-[#3F4A32]">Line items are allocated by estimated professional working days: discovery/content structure 3, design 5, website build 8, integrations 5, quality review 3, launch/client review 2. These are editable-project planning assumptions, not published standard durations. Clutch’s <a href="https://clutch.co/web-designers/pricing" target="_blank" rel="noreferrer" className="underline underline-offset-2">2026 pricing guide</a> reports agency rates around $100–$149/hour and emphasizes that scope and complexity affect costs; it does not prescribe phase durations. Check the task scope before issuing the invoice or confirming dates.</p>
          <section className="invoice-print rounded-2xl bg-white p-5 shadow-sm sm:p-10">
          <div className="mb-8 flex items-start justify-between gap-6 border-b-2 pb-6" style={{ borderColor: primaryColor }}>
            <div>
              <div className="mb-4 flex gap-1.5">{project.brandColors.map((color) => <span key={color} className="h-2 w-8" style={{ backgroundColor: color }} />)}</div>
              <div className="text-xs uppercase tracking-[0.15em] text-[#687268]">Merakifos Studio</div>
              <h2 className="mt-2 text-3xl font-semibold" style={{ color: primaryColor }}>INVOICE</h2>
            </div>
            <div className="workspace-no-print flex flex-col items-end gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-[#3F4A32] px-3 py-2 text-xs text-[#FAF6F1]"><Printer size={15} className="text-[#D9A441]" /> Print invoice</button>
              <div className="flex items-center gap-1 text-xs text-[#69736A]">{dirty ? 'Unsaved changes' : <><Check size={13} /> Saved</>}</div>
            </div>
          </div>
          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            <div><div className="mb-2 text-[10px] uppercase tracking-widest text-[#7C867D]">Bill to</div><div className="text-sm font-semibold">{project.companyName || project.clientName}</div><div className="text-xs text-[#59645B]">{project.clientName}</div><div className="text-xs text-[#59645B]">{project.clientEmail}</div></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <label className="text-[#69736A]">Invoice number<input value={project.invoiceNumber} onChange={(event) => changeProject((current) => ({ ...current, invoiceNumber: event.target.value }))} className="mt-1 w-full border border-[#D9DED7] px-2 py-1.5 text-[#25312B]" /></label>
              <label className="text-[#69736A]">Due date<input type="date" value={project.invoiceDueDate} onChange={(event) => changeProject((current) => ({ ...current, invoiceDueDate: event.target.value }))} className="mt-1 w-full border border-[#D9DED7] px-2 py-1.5 text-[#25312B]" /></label>
              <div className="col-span-2 text-[#69736A]">Currency<div className="mt-1 font-medium text-[#3F4A32]">{project.currency}</div></div>
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-base font-semibold">{project.title}</h3><p className="text-xs text-[#6F786F]">Project fee includes a 25% markup; miscellaneous fee is billed separately.</p></div>
            <div className="text-right text-xs text-[#69736A]">Total project fee<div className="mt-1 text-base font-semibold text-[#3F4A32]">{money(project.projectCharge, project.currency)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead><tr className="border-y border-[#D9DED7] text-[10px] uppercase tracking-wider text-[#6F786F]"><th className="py-3 pr-3">Description</th><th className="py-3 pr-3">Due date</th><th className="py-3 text-right">Amount</th></tr></thead>
              <tbody>{project.tasks.map((task) => <tr key={task.id} className="border-b border-[#E5E9E3]"><td className="py-3 pr-3"><div className="font-medium">{task.title}</div>{task.description && <div className="mt-1 whitespace-pre-wrap text-[11px] text-[#69736A]">{task.description}</div>}</td><td className="py-3 pr-3 text-[#69736A]">{task.dueDate || '—'}</td><td className="py-3 text-right tabular-nums">{money(task.amount, project.currency)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="ml-auto mt-5 max-w-xs space-y-2 text-xs">
            <div className="workspace-no-print flex items-center justify-between gap-3"><label htmlFor="invoice-discount" className="text-[#69736A]">Discount (%)</label><input id="invoice-discount" type="number" min="0" max="100" step="0.5" value={project.discountPercent} onChange={(event) => changeProject((current) => ({ ...current, discountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} className="w-24 border border-[#E5EADF] px-2 py-1.5 text-right text-[#3F4A32]" /></div>
            {project.discountPercent > 0 && <div className="flex justify-between"><span className="text-[#69736A]">Project fee</span><span>{money(subtotal, project.currency)}</span></div>}
            {project.discountPercent > 0 && <div className="flex justify-between"><span className="text-[#69736A]">Discount ({project.discountPercent}%)</span><span>-{money(discount, project.currency)}</span></div>}
            <div className="flex justify-between"><span className="text-[#69736A]">Project subtotal</span><span>{money(discountedSubtotal, project.currency)}</span></div>
            <div className="flex justify-between"><span className="text-[#69736A]">Miscellaneous (10%)</span><span>{money(miscellaneous, project.currency)}</span></div>
            <div className="flex justify-between border-t-2 pt-3 text-sm font-semibold" style={{ borderColor: primaryColor }}><span>Total due</span><span>{money(discountedSubtotal + miscellaneous, project.currency)}</span></div>
          </div>
            <p className="mt-3 text-[11px] text-[#69736A]">Taxes are not calculated. Confirm applicable tax and invoice requirements for your jurisdiction before issuing.</p>
          <label className="mt-8 block text-xs text-[#69736A]">Notes
            <textarea value={project.invoiceNotes} onChange={(event) => changeProject((current) => ({ ...current, invoiceNotes: event.target.value }))} rows={3} placeholder="Payment instructions or additional terms" className="workspace-no-print mt-1 w-full border border-[#D9DED7] px-3 py-2 text-[#25312B]" />
            <div className="hidden whitespace-pre-wrap border-t border-[#D9DED7] pt-2 text-[#25312B] print:block">{project.invoiceNotes || 'Thank you for your business.'}</div>
          </label>
          <div className="mt-10 border-t border-[#E5E9E3] pt-4 text-center text-[10px] uppercase tracking-[0.14em] text-[#7C867D]">Merakifos Studio · Thoughtful work, made with care</div>
          </section>
        </section>}
        {activeCommentTaskId && (() => {
          const task = project.tasks.find((item) => item.id === activeCommentTaskId);
          if (!task) return null;
          const taskComments = project.comments.filter((comment) => comment.taskId === activeCommentTaskId);
          return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveCommentTaskId(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="task-comments-title" className="w-full max-w-lg rounded-2xl border border-[#E5EADF] bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#E5EADF] pb-3">
                <div className="min-w-0"><p className="text-xs text-[#7C8B5F]">Task discussion</p><h2 id="task-comments-title" className="break-words text-base font-semibold">{task.title}</h2></div>
                <button onClick={() => setActiveCommentTaskId(null)} aria-label="Close task comments" className="p-2 text-[#7C8B5F]"><X size={17} /></button>
              </div>
              <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
                {taskComments.length ? taskComments.map((comment) => <article key={comment.id} className="rounded-xl bg-[#FAF6F1] p-3">
                  <div className="mb-1 flex items-center justify-between gap-2"><strong className="text-xs">{comment.author}</strong><time className="text-[11px] text-[#7C8B5F]">{new Date(comment.createdAt).toLocaleString()}</time></div>
                  <p className="whitespace-pre-wrap break-words text-sm">{comment.message}</p>
                </article>) : <p className="text-sm text-[#7C8B5F]">No comments on this task yet.</p>}
              </div>
              <form onSubmit={sendTaskComment} className="space-y-3">
                <label className="block text-xs text-[#3F4A32]">Add a comment<textarea autoFocus required maxLength={1000} rows={3} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} className="mt-1 w-full rounded-xl border border-[#E5EADF] px-3 py-2 text-sm" placeholder="Write a task update or question" /></label>
                <div className="flex justify-end"><button disabled={commentSending || !commentDraft.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#3F4A32] px-4 py-2.5 text-sm text-[#FAF6F1] disabled:opacity-50"><MessageCircle size={15} className="text-[#D9A441]" />{commentSending ? 'Sending...' : 'Add comment'}</button></div>
              </form>
            </section>
          </div>;
        })()}
      </main>
    </div>
  );
};