import React from 'react';
import { Headphones, LayoutDashboard } from 'lucide-react';

export const WorkspaceNavigation: React.FC<{ active: 'studio' | 'support' }> = ({ active }) => (
  <nav aria-label="Workspace navigation" className="flex flex-wrap items-center gap-2">
    {[
      { id: 'studio', label: 'Studio', href: '/studio', icon: LayoutDashboard },
      { id: 'support', label: 'Customer Support', href: '/studio/customer-operations', icon: Headphones },
    ].map(({ id, label, href, icon: Icon }) => (
      <a
        key={id}
        href={href}
        aria-current={active === id ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F4A32] ${
          active === id
            ? 'border-[#3F4A32] bg-[#3F4A32] text-white'
            : 'border-[#E5EADF] bg-white text-[#3F4A32] hover:border-[#7C8B5F]'
        }`}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {label}
      </a>
    ))}
  </nav>
);
