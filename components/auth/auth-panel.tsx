import { T } from "@/components/i18n/language-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function AuthPanel({ title, description, children }: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return <main className="flex min-h-dvh items-center justify-center px-5 py-12"><div className="w-full max-w-md"><Card>
    <CardHeader><CardTitle><h1>{<T text={title}/>}</h1></CardTitle><CardDescription>{<T text={description}/>}</CardDescription></CardHeader>
    <CardContent>{children}</CardContent>
  </Card></div></main>;
}
