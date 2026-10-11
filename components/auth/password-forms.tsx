"use client";
import { T } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordState } from "@/lib/auth/password-service";
type PasswordAction = (previous: PasswordState, form: FormData) => Promise<PasswordState>;
function Feedback({ state }: {
    state: PasswordState;
}) {
    return <div aria-live="polite" aria-atomic="true">
    {state.error && <p id="password-error" role="alert" className="text-sm text-destructive">{<T text={state.error}/>}</p>}
    {state.message && <p role="status" className="text-sm">{<T text={state.message}/>}</p>}
  </div>;
}
export function ForgotPasswordForm({ action }: {
    action: PasswordAction;
}) {
    const [state, submit, pending] = useActionState(action, {});
    return <form action={submit} className="space-y-5">
    <div className="space-y-2">
      <Label htmlFor="reset-email"><T text={"Email address"}/></Label>
      <Input id="reset-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} aria-describedby={state.error ? "password-error" : undefined}/>
    </div>
    <Feedback state={state}/>
    <Button type="submit" className="w-full" loading={pending}>{pending ? <T text={"Requesting link…"}/> : <T text={"Send reset link"}/>}</Button>
    <Link href="/login" className="block rounded text-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"><T text={"Back to sign in"}/></Link>
  </form>;
}
export function RecoveryConfirmationForm({ tokenHash, action }: {
    tokenHash: string;
    action: PasswordAction;
}) {
    const [state, submit, pending] = useActionState(action, {});
    return <form action={submit} className="space-y-5">
    <input type="hidden" name="tokenHash" value={tokenHash}/>
    <p className="text-sm text-muted-foreground"><T text={"Continue to verify your link and choose a new password. This will sign you in to the account associated with this reset link."}/></p>
    <Feedback state={state}/>
    <Button type="submit" className="w-full" loading={pending} disabled={state.error !== undefined}>{pending ? <T text={"Verifying link…"}/> : <T text={"Continue to reset password"}/>}</Button>
    <Link href="/forgot-password" className="block rounded text-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"><T text={"Request a new reset link"}/></Link>
  </form>;
}
export function PasswordForm({ action, recovery = false }: {
    action: PasswordAction;
    recovery?: boolean;
}) {
    const [values, setValues] = useState({ currentPassword: "", password: "", confirmation: "" });
    const [state, submit, pending] = useActionState(async (previous: PasswordState, form: FormData) => {
        const result = await action(previous, form);
        if (result.success)
            setValues({ currentPassword: "", password: "", confirmation: "" });
        return result;
    }, {});
    if (state.success)
        return <div className="space-y-5"><Feedback state={state}/><Link href="/login" className="inline-flex min-h-11 items-center rounded text-primary underline focus-visible:outline-2 focus-visible:outline-ring"><T text={"Sign in with your new password"}/></Link></div>;
    const describedBy = state.error ? "password-help password-error" : "password-help";
    return <form action={submit} className="space-y-5">
    {!recovery && <div className="space-y-2">
      <Label htmlFor="current-password"><T text={"Current password"}/></Label>
      <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending} value={values.currentPassword} onChange={event => setValues({ ...values, currentPassword: event.target.value })} aria-describedby={state.error ? "password-error" : undefined}/>
    </div>}
    <div className="space-y-2">
      <Label htmlFor="new-password"><T text={"New password"}/></Label>
      <Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} aria-describedby={describedBy}/>
      <p id="password-help" className="text-sm text-muted-foreground"><T text={"Use 12\u2013128 characters. A long, unique password is recommended."}/></p>
    </div>
    <div className="space-y-2">
      <Label htmlFor="confirm-password"><T text={"Confirm new password"}/></Label>
      <Input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} value={values.confirmation} onChange={event => setValues({ ...values, confirmation: event.target.value })} aria-describedby={describedBy}/>
    </div>
    <p className="text-sm text-muted-foreground"><T text={"After updating your password, you will need to sign in again."}/></p>
    <Feedback state={state}/>
    <Button type="submit" className="w-full" loading={pending}>{pending ? <T text={"Updating password…"}/> : <T text={"Update password"}/>}</Button>
    <Link href={recovery ? "/forgot-password" : "/dashboard"} className="block rounded text-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring">{recovery ? <T text={"Request a new reset link"}/> : <T text={"Cancel"}/>}</Link>
  </form>;
}
