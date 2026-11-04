import { redirect } from 'next/navigation';
import { auth, devAuthEnabled, signIn } from '@/auth';
import { Button, Card, Input, Label } from '@/components/ui';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string }> }) {
  const session = await auth();
  if (session?.user) redirect('/deals');
  const params = await searchParams;
  const emailEnabled = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const callbackUrl = params.callbackUrl ?? '/deals';
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      {params.sent ? <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Check your email for a sign-in link.</p> : null}
      {params.error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Sign-in failed ({params.error}). Try again.</p> : null}
      <div className="space-y-4">
        {emailEnabled ? (
          <Card title="Email link">
            <form
              className="space-y-3"
              action={async (formData) => {
                'use server';
                await signIn('nodemailer', { email: String(formData.get('email') ?? ''), redirectTo: callbackUrl });
              }}
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@firm.com" />
              </div>
              <Button type="submit">Send sign-in link</Button>
            </form>
          </Card>
        ) : null}
        {googleEnabled ? (
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: callbackUrl });
            }}
          >
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Google
            </Button>
          </form>
        ) : null}
        {devAuthEnabled ? (
          <Card title="Development sign-in">
            <form
              className="space-y-3"
              action={async (formData) => {
                'use server';
                await signIn('dev', { email: String(formData.get('email') ?? ''), redirectTo: callbackUrl });
              }}
            >
              <p className="text-xs text-neutral-500">No email is sent. Enabled only outside production or with PENCIL_DEV_AUTH=1.</p>
              <div>
                <Label htmlFor="dev-email">Email</Label>
                <Input id="dev-email" name="email" type="email" required placeholder="you@example.com" data-testid="dev-email" />
              </div>
              <Button type="submit" data-testid="dev-signin">
                Sign in
              </Button>
            </form>
          </Card>
        ) : null}
        {!emailEnabled && !googleEnabled && !devAuthEnabled ? <p className="text-sm text-neutral-600">No sign-in method is configured. Set EMAIL_SERVER and EMAIL_FROM, or AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.</p> : null}
      </div>
    </div>
  );
}
