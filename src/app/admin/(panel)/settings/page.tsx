import { PageHeader } from "@/components/admin/page-header";
import { getVenue } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { FeaturesForm, VenueForm } from "./settings-forms";

export const metadata = { title: "Заведение" };

export default async function SettingsPage() {
  await requireAdmin("manager");
  const v = await getVenue(await getDb());
  const c = v.contacts;
  return (
    <>
      <PageHeader
        title="Заведение"
        description="Функции применяются сразу. Остальное попадает в черновик и видно гостям после публикации."
      />
      <div className="flex flex-col gap-4">
        <FeaturesForm initial={v.features} />
        <VenueForm
          initial={{
            name: v.name,
            servicePercent: v.serviceRateBp / 100,
            hours: v.hours,
            contacts: {
              phone: c.phone,
              phoneDisplay: c.phoneDisplay,
              whatsapp: c.whatsapp ?? "",
              instagram: c.instagram ?? "",
              telegram: c.telegram ?? "",
              map2gis: c.map2gis ?? "",
              mapYandex: c.mapYandex ?? "",
              review2gis: c.review2gis ?? "",
              rating: c.rating ?? "",
              reviewsCount: c.reviewsCount ?? "",
              address: c.address,
            },
            content: v.content,
            analytics: { goatcounterCode: v.analytics.goatcounterCode ?? "" },
          }}
        />
      </div>
    </>
  );
}
