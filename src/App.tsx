import CustomerOperationsInvite from './components/CustomerOperationsInvite';
import React from 'react';
import { MerakifosDiscovery } from './components/MerakifosDiscovery';
import { StudioPortalApp } from './components/studio/StudioPortalApp';
import { CookieConsent } from './components/compliance/CookieConsent';
import { INITIAL_ANSWERS } from './data/discoveryQuestions';
import { DiscoveryAnswers } from './types/questionnaire';
import { generateProjectBrief } from './services/briefGenerator';
import { ClientProjectView } from './components/ClientProjectView';
import { BetaDeskAdmin } from './components/beta-desk/BetaDesk';
import { TesterLinkRequired, TesterPortal } from './components/beta-desk/TesterPortal';
import { StudioInviteClaim } from './components/studio/StudioInviteClaim';
import { CustomerOperationsApp } from './components/CustomerOperationsApp';
import { CustomerOperationsCustomerConversation } from './components/CustomerOperationsCustomerConversation';

export default function App() {
  const [answers, setAnswers] = React.useState<DiscoveryAnswers>(INITIAL_ANSWERS);
  const isStudioRoute =
    typeof window !== 'undefined' && window.location.pathname.toLowerCase().startsWith('/studio');
  const clientProjectToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.slice(1)).get('project')
      || new URLSearchParams(window.location.search).get('project')
    : null;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const adminInviteToken = pathname === '/studio/invite' && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.slice(1)).get('invite') || ''
    : '';

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

  if (pathname === '/studio/beta-feedback' || pathname.startsWith('/studio/beta-feedback/')) {
    return <BetaDeskAdmin />;
  }

  if (pathname === '/studio/invite') {
    return (
      <>
        <StudioInviteClaim token={adminInviteToken} />
        <CookieConsent />
      </>
    );
  }

  if (pathname === '/customer-operations/conversations') {
    return <CustomerOperationsCustomerConversation />;
  }

  if(pathname === '/studio/customer-operations/invite') return <CustomerOperationsInvite />;

  if (pathname === '/studio/customer-operations' || pathname.startsWith('/studio/customer-operations/')) {
    return <CustomerOperationsApp />;
  }

  if (pathname === '/feedback/submit') {
    return <TesterLinkRequired />;
  }

  if (pathname === '/feedback/tester') {
    const testerToken = new URLSearchParams(window.location.hash.slice(1)).get('tester') || '';
    return testerToken ? <TesterPortal testerToken={testerToken} /> : <TesterLinkRequired />;
  }

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
