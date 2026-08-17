import type { ReactNode } from "react";
import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";

/**
 * Client-side route guards.
 *
 * These are DEFENCE IN DEPTH and a UX correction, not the security boundary.
 * The real boundary is server-side: `protectedProcedure` / `adminProcedure` in
 * server/_core/trpc.ts reject unauthorised calls regardless of what the browser
 * renders. Previously an unauthenticated visitor could load /admin, /audit-log
 * and /risk-settings and see the full shell with every query failing — which
 * looks like a broken app and needlessly advertises the admin surface.
 */

function GuardNotice({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/75 p-6 text-center shadow-[0_24px_80px_rgba(3,7,34,0.18)]">
        <span className="mx-auto inline-flex size-11 items-center justify-center rounded-xl border border-border text-foreground-muted">
          <ShieldAlert className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">{detail}</p>
        <div className="mt-5 flex justify-center">{action}</div>
      </div>
    </main>
  );
}

function GuardLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="grid min-h-[calc(100vh-4rem)] place-items-center bg-background px-4">
      <div className="h-10 w-full max-w-md rounded-xl bg-muted" />
      <span className="sr-only">Checking access</span>
    </main>
  );
}

/** Requires any signed-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <GuardLoading />;
  if (!user) {
    return (
      <GuardNotice
        title="Sign in required"
        detail="This workspace is tied to your account. Sign in to load your stored evidence and settings."
        action={<Button onClick={() => startLogin()}>Sign in</Button>}
      />
    );
  }
  return <>{children}</>;
}

/**
 * Requires an administrator. `role` comes from the server `users` row returned
 * by `auth.me`, so it cannot be set by the client.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <GuardLoading />;
  if (!user) {
    return (
      <GuardNotice
        title="Sign in required"
        detail="Administrator surfaces require an authenticated session."
        action={<Button onClick={() => startLogin()}>Sign in</Button>}
      />
    );
  }
  if (user.role !== "admin") {
    return (
      <GuardNotice
        title="Administrator access required"
        detail="This account does not have administrator permission. Integration telemetry and account administration are restricted."
        action={
          <Button variant="outline" asChild>
            <Link href="/">Return to dashboard</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
