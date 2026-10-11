import { T } from "@/components/i18n/language-provider";
import { requireUser } from "@/lib/auth/session";
import { PasswordForm } from "@/components/auth/password-forms";
import { changePassword } from "@/app/auth/password-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default async function AccountPage() {
    await requireUser();
    return <div className="mx-auto max-w-md space-y-6">
    <div><h1 className="text-3xl font-semibold tracking-tight"><T text={"Account"}/></h1><p className="mt-2 text-muted-foreground"><T text={"Manage your password."}/></p></div>
    <Card><CardHeader><CardTitle><T text={"Change password"}/></CardTitle></CardHeader><CardContent><PasswordForm action={changePassword}/></CardContent></Card>
  </div>;
}
