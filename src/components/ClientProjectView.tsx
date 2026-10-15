import React from 'react';
import { MessageCircle, MessageSquare, Send, Sparkles } from 'lucide-react';

type TaskPriority = 'Severe' | 'High' | 'Medium' | 'Low';

const priorityStyle: Record<TaskPriority, string> = {
  Severe: 'border-red-200 bg-red-50 text-red-800',
  High: 'border-orange-200 bg-orange-50 text-orange-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  Low: 'border-[#D9E3D2] bg-[#F1F5EE] text-[#526A48]',
};

interface ClientProject {
  title: string;
  companyName: string;
  columns: string[];
  tasks: Array<{ id: string; title: string; description: string; status: string; dueDate: string; priority: TaskPriority; comments: Array<{ id: string; author: string; message: string; createdAt: string }> }>;
  comments: Array<{ id: string; author: string; message: string; createdAt: string }>;
}

export const ClientProjectView: React.FC<{ token: string }> = ({ token }) => {
  const [project, setProject] = React.useState<ClientProject | null>(null);
  const [author, setAuthor] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadProject = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/client-project', {
        headers: { 'X-Project-Share-Token': token },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 && !data) {
          throw new Error('Client sharing is not deployed on this site yet. Deploy the Studio API routes, then create a new link.');
        }
        if (response.status === 404) {
          throw new Error('This link was not found in this deployment. Links only work on the site and project store where they were created; create a new link there.');
        }
        throw new Error(data?.error || 'Could not load this project.');
      }
      if (!data) throw new Error('The project service returned an unreadable response.');
      setProject(data);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the project.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { loadProject(); }, [loadProject]);

  const sendComment = async (event: React.FormEvent, taskId?: string) => {
    event.preventDefault();
    if (!author.trim() || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/client-project/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, author, message, taskId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send comment.');
      setMessage('');
      await loadProject();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send comment.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="merakifos-ui grid min-h-screen place-items-center bg-[#FAF6F1] text-sm text-[#3F4A32]">Loading project...</main>;
  if (!project) return <main className="merakifos-ui grid min-h-screen place-items-center bg-[#FAF6F1] px-5 text-center"><div className="rounded-2xl border border-[#E5EADF] bg-white p-8"><div className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7C8B5F]">Merakifos Studio</div><h1 className="text-xl font-semibold">Project link unavailable</h1><p className="mt-2 text-sm text-[#3F4A32]">{error || 'This link may have expired or been replaced.'}</p></div></main>;

  return (
    <main className="merakifos-ui min-h-screen bg-[#FAF6F1] text-[#3F4A32]">
      <header className="border-b border-[#E5EADF] bg-white px-5 py-7 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-4">
          <div><div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#7C8B5F]">Merakifos Studio · Client workspace</div><h1 className="text-2xl font-semibold">{project.title}</h1><p className="mt-1 text-sm text-[#3F4A32]">{project.companyName}</p></div>
          <div className="hidden items-center gap-1.5 text-xs text-[#3F4A32] sm:flex"><Sparkles size={15} className="text-[#D9A441]" /> Project progress</div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1fr_320px] sm:px-10">
        <section>
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-base font-semibold">Workflow</h2><p className="mt-1 text-xs text-[#3F4A32]">Current milestones and target dates</p></div><button onClick={loadProject} className="border border-[#E5EADF] bg-white px-3 py-2 text-xs text-[#3F4A32] hover:bg-[#F1F2EC]">Refresh</button></div>
          <div className="flex items-start gap-3 overflow-x-auto pb-3">
            {project.columns.map((column) => <section key={column} className="merakifos-column min-h-52 min-w-[230px] flex-1 border border-[#E5EADF] bg-[#F1F2EC]">
              <h3 className="border-b border-[#E5EADF] bg-white px-3 py-2 text-xs font-semibold">{column}<span className="ml-2 font-normal text-[#7C8B5F]">{project.tasks.filter((task) => task.status === column).length}</span></h3>
              <div className="space-y-2 p-2">{project.tasks.filter((task) => task.status === column).map((task) => <article key={task.id} className="min-w-0 border border-[#E5EADF] bg-white p-3">
                <h4 className="whitespace-normal break-words text-sm font-semibold leading-snug">{task.title}</h4>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex rounded-xl border px-2 py-1 text-xs font-medium ${priorityStyle[task.priority || 'Medium']}`}>Priority: {task.priority || 'Medium'}</span>
                  <button onClick={() => { setActiveTaskId(activeTaskId === task.id ? null : task.id); setError(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5EADF] bg-white px-2.5 py-1.5 text-xs text-[#3F4A32] hover:bg-[#FAF6F1]" aria-label={`Open discussion for ${task.title}`}><MessageCircle size={14} className="text-[#7C8B5F]" />{task.comments.length || 'Comment'}</button>
                </div>
                {task.description && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[#59645B]">{task.description}</p>}
                {task.dueDate && <div className="mt-3 border-t border-[#E5E9E3] pt-2 text-[10px] text-[#687268]">Target: {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}</div>}
                {activeTaskId === task.id && <section className="mt-3 border-t border-[#E5EADF] pt-3" aria-label={`Discussion for ${task.title}`}>
                  <div className="mb-2 max-h-36 space-y-2 overflow-y-auto">{task.comments.length ? task.comments.map((comment) => <article key={comment.id} className="rounded-xl bg-[#FAF6F1] p-2.5"><div className="mb-1 flex items-center justify-between gap-2"><strong className="text-xs">{comment.author}</strong><time className="text-[10px] text-[#7C8B5F]">{new Date(comment.createdAt).toLocaleDateString()}</time></div><p className="whitespace-pre-wrap break-words text-xs">{comment.message}</p></article>) : <p className="text-xs text-[#7C8B5F]">No comments yet.</p>}</div>
                  <form onSubmit={(event) => sendComment(event, task.id)} className="space-y-2">
                    <label className="block text-[11px] text-[#3F4A32]">Your name<input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={80} required className="mt-1 w-full rounded-xl border border-[#E5EADF] bg-white px-2.5 py-2 text-xs text-[#3F4A32]" /></label>
                    <label className="block text-[11px] text-[#3F4A32]">Task comment<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} required rows={2} className="mt-1 w-full resize-y rounded-xl border border-[#E5EADF] bg-white px-2.5 py-2 text-xs text-[#3F4A32]" placeholder="Write a task update or question" /></label>
                    <button disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-[#3F4A32] px-3 py-2 text-xs text-[#FAF6F1] disabled:opacity-50"><Send size={13} className="text-[#D9A441]" />{sending ? 'Sending...' : 'Send'}</button>
                  </form>
                </section>}
              </article>)}</div>
            </section>)}
          </div>
        </section>
        <aside className="border-t border-[#E5EADF] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="mb-4 flex items-center gap-2"><MessageSquare size={16} /><h2 className="text-sm font-semibold">Project comments</h2></div>
          <form onSubmit={sendComment} className="space-y-2 border-b border-[#E5EADF] pb-5">
            <label className="block text-[11px] text-[#3F4A32]">Your name<input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={80} required className="mt-1 w-full border border-[#E5EADF] bg-white px-2.5 py-2 text-xs text-[#3F4A32]" /></label>
            <label className="block text-[11px] text-[#3F4A32]">Comment<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} required rows={3} className="mt-1 w-full resize-y border border-[#E5EADF] bg-white px-2.5 py-2 text-xs text-[#3F4A32]" placeholder="Ask a question or share feedback" /></label>
            <button disabled={sending} className="inline-flex items-center gap-2 bg-[#3F4A32] px-4 py-2.5 text-xs text-[#FAF6F1] disabled:opacity-50"><Send size={15} className="text-[#D9A441]" />{sending ? 'Sending...' : 'Send comment'}</button>
          </form>
          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
          <div className="space-y-3 pt-4">{project.comments.length ? [...project.comments].reverse().map((comment) => <article key={comment.id} className="border-b border-[#E1E5DF] pb-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs">{comment.author}</strong><time className="text-[10px] text-[#7C867D]">{new Date(comment.createdAt).toLocaleDateString()}</time></div><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#59645B]">{comment.message}</p></article>) : <p className="text-xs text-[#7C867D]">No comments yet.</p>}</div>
        </aside>
      </div>
      <footer className="border-t border-[#E5EADF] px-5 py-5 text-center text-[10px] uppercase tracking-[0.14em] text-[#7C8B5F]">Merakifos Studio</footer>
    </main>
  );
};