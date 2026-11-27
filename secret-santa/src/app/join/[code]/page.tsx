import { joinParty } from "@/app/actions/party";
import { GoogleButton } from "@/components/GoogleButton";
import { NameSignIn } from "@/components/NameSignIn";
import { googleSignInEnabled } from "@/lib/sign-in-options";
import { Notice } from "@/components/Notice";
import { Shell } from "@/components/Shell";
import { getUserId } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ notice?: string }> };

export default async function JoinPage({ params, searchParams }: Props) {
  const { code } = await params;
  const { notice } = await searchParams;
  const userId = await getUserId();

  const supabase = await createServerClient();
  const { data } = await supabase.rpc("invite_preview", { p_code: code });
  const invite = (data as { party_name: string; organizer_name: string }[] | null)?.[0];

  return (
    <Shell signedIn={Boolean(userId)}>
      <Notice message={notice} />
      {!invite ? (
        <div className="text-center">
          <h1 className="christmas-font text-5xl font-bold text-santa">Oh no!</h1>
          <p className="mt-4 text-lg">This invite link is no longer valid.</p>
          <p className="mt-2 text-gray-600">Ask your organizer to send you a new one.</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-lg text-gray-700">{invite.organizer_name} invited you to</p>
          <h1 className="christmas-font mt-1 text-5xl font-bold break-words text-santa">{invite.party_name}</h1>
          <div className="mt-8">
            {userId ? (
              <form action={joinParty}>
                <input type="hidden" name="code" value={code} />
                <button type="submit" className="btn-christmas w-full text-lg">
                  🎄 Join the party
                </button>
              </form>
            ) : (
              <>
                <NameSignIn joinCode={code} button="🎄 Join the party" />
                {googleSignInEnabled ? (
                  <div className="mt-4">
                    <GoogleButton next={`/join/${encodeURIComponent(code)}`} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
