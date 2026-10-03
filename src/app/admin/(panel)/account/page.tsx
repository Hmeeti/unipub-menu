import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card } from "@/components/admin/ui";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { requireAdmin } from "@/lib/admin/session";
import { PasswordForm, TotpForm } from "./account-forms";

export const metadata = { title: "Мой аккаунт" };

export default async function AccountPage() {
  const { user } = await requireAdmin("waiter");
  return (
    <>
      <PageHeader title="Мой аккаунт" />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">{user.name}</span>
          <span className="text-muted">{user.login}</span>
          <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
        </Card>
        <PasswordForm />
        <TotpForm enabled={user.totpEnabled} />
      </div>
    </>
  );
}
