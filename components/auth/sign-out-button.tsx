"use client";
import { useActionState } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, {});
  return (
    <form action={action}>
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
