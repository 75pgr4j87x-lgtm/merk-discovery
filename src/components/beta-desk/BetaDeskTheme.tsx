import React from 'react';
import { Moon, Sun } from 'lucide-react';

export function useBetaDeskTheme() {
  const [isDark, setIsDark] = React.useState(
    () => window.localStorage.getItem('betadesk-theme') === 'dark'
  );

  React.useEffect(() => {
    window.localStorage.setItem('betadesk-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = () => setIsDark((current) => !current);
  return { theme: isDark ? 'dark' as const : 'light' as const, toggle };
}

export const BetaDeskThemeToggle: React.FC<{
  theme: 'dark' | 'light';
  onToggle: () => void;
}> = ({ theme, onToggle }) => (
  <button
    type="button"
    data-sound-control
    onClick={onToggle}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    className="inline-flex items-center gap-2 rounded-lg border border-[#E5EADF] bg-white px-3 py-2 text-sm text-[#3F4A32] hover:border-[#7C8B5F]"
  >
    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
  </button>
);
