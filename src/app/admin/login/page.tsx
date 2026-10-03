import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="wordmark text-pink text-4xl">unipub</div>
          <p className="text-muted mt-2 text-[15px]">Вход для персонала</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
