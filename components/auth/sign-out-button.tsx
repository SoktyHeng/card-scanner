"use client";
import { useActionState } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { invalidateWorkspaceCache } from "@/lib/cache/events";
export function SignOutButton({ action: signOutAction = signOut }: { action?: typeof signOut } = {}) {
  const [state, action, pending] = useActionState(signOutAction, {});
  return (
    <form action={action} onSubmit={() => invalidateWorkspaceCache(true)}>
      <Button type="submit" variant="outline" loading={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 max-w-60 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
