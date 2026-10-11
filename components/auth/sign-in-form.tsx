"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function SignInForm({ next }: {
    next: string;
}) {
    const { t } = useLanguage();
    const [state, action, pending] = useActionState(signIn, {});
    return (<form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next}/>
      <div className="space-y-2">
        <Label htmlFor="email"><T text={"Email address"}/></Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder={t("you@example.com")} required maxLength={254} disabled={pending} aria-describedby={state.error ? "sign-in-error" : undefined}/>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password"><T text={"Password"}/></Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending} aria-describedby={state.error ? "sign-in-error" : undefined}/>
      </div>
      <div aria-live="polite">
        {state.error && (<p id="sign-in-error" className="text-sm text-destructive">
            {<T text={state.error}/>}
          </p>)}
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        {pending ? <T text={"Signing in…"}/> : <T text={"Sign in"}/>}
      </Button>
      <Link href="/forgot-password" className="block rounded text-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-ring"><T text={"Forgot password?"}/></Link>
    </form>);
}
