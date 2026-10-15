import React from 'react';
import { Check, MapPin } from 'lucide-react';

interface JourneyTask {
  id: string;
  status: string;
  estimatedEffortDays?: number;
}

interface ProjectJourneyProgressProps {
  columns: string[];
  tasks: JourneyTask[];
  onSelectStage?: (index: number) => void;
}

export const calculateProjectProgress = (columns: string[], tasks: JourneyTask[]) => {
  if (!tasks.length || columns.length < 2) return 0;
  const lastStageIndex = columns.length - 1;
  let totalEffort = 0;
  let completedEffort = 0;

  for (const task of tasks) {
    const effort = Math.max(0.5, task.estimatedEffortDays || 1);
    const stageIndex = Math.max(0, columns.indexOf(task.status));
    totalEffort += effort;
    completedEffort += effort * Math.min(lastStageIndex, stageIndex) / lastStageIndex;
  }

  return totalEffort ? Math.round(completedEffort / totalEffort * 100) : 0;
};

export const ProjectJourneyProgress: React.FC<ProjectJourneyProgressProps> = ({ columns, tasks, onSelectStage }) => {
  const progress = calculateProjectProgress(columns, tasks);
  const completedCount = tasks.filter((task) => columns.indexOf(task.status) === columns.length - 1).length;
  const trackColumns = columns.length > 1 ? columns : ['To do', 'Complete'];

  return (
    <section className="rounded-2xl border border-[#E5EADF] bg-white px-4 py-4 sm:px-6" aria-label="Project progress">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[#7C8B5F]">Project journey</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-semibold text-[#3F4A32]">{progress}%</span>
            <span className="text-xs text-[#59645B]">complete</span>
          </div>
        </div>
        <span className="text-xs text-[#59645B]">{completedCount} of {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} finished</span>
      </div>

      <div className="relative px-2 pb-1 pt-2">
        <div className="absolute left-4 right-4 top-[18px] h-1 rounded-full bg-[#E8ECE3] sm:left-6 sm:right-6" aria-hidden="true" />
        <div className="absolute left-4 top-[18px] h-1 rounded-full bg-[#7C8B5F] transition-[width] duration-500 ease-out sm:left-6" style={{ width: `calc((100% - 3rem) * ${progress / 100})` }} aria-hidden="true" />
        <div className="relative flex justify-between gap-1">
          {trackColumns.map((column, index) => {
            const target = trackColumns.length > 1 ? index / (trackColumns.length - 1) * 100 : 0;
            const reached = progress >= target;
            const isCurrent = index === Math.min(trackColumns.length - 1, Math.round(progress / 100 * (trackColumns.length - 1)));
            return (
              <button
                key={`${index}-${column}`}
                type="button"
                onClick={() => onSelectStage?.(Math.min(index, columns.length - 1))}
                className="group flex min-w-0 flex-1 flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3F4A32]"
                aria-label={`Show ${column} stage`}
                aria-current={isCurrent ? 'step' : undefined}
                title={`View ${column}`}
              >
                <span className={`relative z-[1] grid h-8 w-8 place-items-center rounded-full border-2 transition-colors duration-300 ${reached ? 'border-[#3F4A32] bg-[#3F4A32] text-[#FAF6F1]' : 'border-[#C8D1C1] bg-white text-[#7C8B5F]'} ${isCurrent ? 'ring-4 ring-[#D9A441]/25' : ''}`}>
                  {reached && !isCurrent ? <Check size={14} aria-hidden="true" /> : isCurrent && progress < 100 ? <MapPin size={14} aria-hidden="true" /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                </span>
                <span className={`max-w-full break-words text-xs leading-tight transition-colors group-hover:text-[#3F4A32] ${isCurrent ? 'font-semibold text-[#3F4A32]' : 'text-[#6F786F]'}`}>{column}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="sr-only"
        role="progressbar"
        aria-label="Project completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${progress}% complete; ${completedCount} of ${tasks.length} tasks finished`}
      />
    </section>
  );
};
