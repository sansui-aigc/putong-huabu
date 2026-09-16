import { redirect } from "@/compat/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { getInstallStatus } from "@/lib/server/install-status";

type RegisterPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
    const params = searchParams ? await searchParams : {};
    const nextPath = safeNextPath(firstValue(params.next));
    const install = await getInstallStatus();
    if (!install.ready) redirect("/install");

    const [user, settings] = await Promise.all([getCurrentUser(), getAuthSettings()]);
    if (user) redirect(nextPath);

    return <AuthForm mode="register" nextPath={nextPath} registrationEnabled={settings.registrationEnabled} emailRegistrationEnabled={settings.emailRegistrationEnabled} />;
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined) {
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/canvas";
}
