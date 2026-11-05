import React from 'react';
import type { User } from 'firebase/auth';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { initAuth, studioFetch } from '../../services/auth';

interface StudioInviteClaimProps {
  token: string;
}

export const StudioInviteClaim: React.FC<StudioInviteClaimProps> = ({ token }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [claimError, setClaimError] = React.useState('');
  const attemptedUid = React.useRef<string | null>(null);

  React.useEffect(() => {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    return initAuth(
      (currentUser) => setUser(currentUser),
      () => setUser(null)
    );
  }, []);

  React.useEffect(() => {
    if (!user) {
      attemptedUid.current = null;
      return;
    }
    if (!token || attemptedUid.current === user.uid) return;

    attemptedUid.current = user.uid;
    setIsClaiming(true);
    setClaimError('');
    void (async () => {
      try {
        const response = await studioFetch('/api/studio/invite-links/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not claim this invite.');
        window.location.replace(data.kind === 'betadesk' ? '/studio/beta-feedback' : '/studio');
      } catch (error) {
        setClaimError(error instanceof Error ? error.message : 'Could not claim this invite.');
      } finally {
        setIsClaiming(false);
      }
    })();
  }, [token, user]);

  return (
    <main className="min-h-screen bg-[#FAF6F1] px-4 py-16 text-[#3F4A32]">
      <section className="mx-auto max-w-md rounded-2xl border border-[#E5EADF] bg-white p-7 text-center shadow-sm sm:p-9">
        <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-[#7C8B5F]" />
        <h1 className="text-2xl font-semibold">Admin invitation</h1>
        <p className="my-4 text-sm text-[#59645B]">
          Sign in with the verified Google account this invitation was created for. The invite is one-use and expires after 7 days.
        </p>
        {!token && (
          <p role="alert" className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle size={16} /> This invite link is invalid or has already been used.
          </p>
        )}
        {claimError && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {claimError}
          </p>
        )}
        {isClaiming && <p role="status" className="mb-4 text-sm text-[#7C8B5F]">Verifying invitation…</p>}
        <div className="flex justify-center">
          <GoogleSignInButton user={user} onAuthChange={setUser} isLoading={isClaiming || !token} />
        </div>
        {user && claimError && <p className="mt-4 text-xs text-[#76806B]">If this is not the invited account, sign out and choose the correct Google account.</p>}
        <a href="/" className="mt-6 inline-block text-xs text-[#7C8B5F] hover:underline">Return to Merk Discovery</a>
      </section>
    </main>
  );
};
