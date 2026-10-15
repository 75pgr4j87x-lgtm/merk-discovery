import React from 'react';
import { MerakifosDiscovery } from './components/MerakifosDiscovery';
import { StudioPortalApp } from './components/studio/StudioPortalApp';
import { CookieConsent } from './components/compliance/CookieConsent';
import { INITIAL_ANSWERS } from './data/discoveryQuestions';
import { DiscoveryAnswers } from './types/questionnaire';
import { generateProjectBrief } from './services/briefGenerator';
import { ClientProjectView } from './components/ClientProjectView';

export default function App() {
  const [answers, setAnswers] = React.useState<DiscoveryAnswers>(INITIAL_ANSWERS);
  const isStudioRoute =
    typeof window !== 'undefined' && window.location.pathname.toLowerCase().startsWith('/studio');
  const clientProjectToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.slice(1)).get('project')
      || new URLSearchParams(window.location.search).get('project')
    : null;

  // Callback to synthesize brief
  const handleCompleteAndSynthesize = async (latestAnswers?: DiscoveryAnswers): Promise<string> => {
    return await generateProjectBrief(latestAnswers || answers);
  };

  // Callback to log to studio spreadsheet database
  const handleSaveToSpreadsheet = async (
    data: DiscoveryAnswers,
    brief: string,
    approved: boolean,
    submissionId?: string
  ): Promise<{ success: boolean; id?: string }> => {
    try {
      const res = await fetch('/api/submit-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: submissionId, answers: data, brief, approved }),
      });
      if (res.ok) {
        const json = await res.json();
        return { success: true, id: json.id };
      }
    } catch (e) {
      console.error('Failed to log response to spreadsheet:', e);
    }
    return { success: false };
  };

  // 1. RENDER: Studio Portal Application (Founder Operating System - Restricted to Keven Sarbah)
  if (isStudioRoute) {
    return (
      <>
        <StudioPortalApp />
        <CookieConsent />
      </>
    );
  }

  if (clientProjectToken) {
    return <ClientProjectView token={clientProjectToken} />;
  }

  // 2. RENDER: Client-Facing Discovery (Pristine, zero studio portal UI or login buttons for clients)
  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#3F4A32] flex flex-col justify-between font-sans relative selection:bg-[#7C8B5F]/20 selection:text-[#3F4A32]">
      <MerakifosDiscovery
        answers={answers}
        onChange={setAnswers}
        onCompleteAndSynthesize={handleCompleteAndSynthesize}
        onSaveToSpreadsheet={handleSaveToSpreadsheet}
      />
      <CookieConsent />
    </div>
  );
}
