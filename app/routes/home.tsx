import { ClauseJobWorkspace } from "@/components/clause/ClauseJobWorkspace";
import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} — Contract-as-Card Workspace`;
const SEO_DESCRIPTION =
  "Turn a contractor quote into an Airwallex virtual card whose spending limit, merchant allowlist, and deadline are enforced directly from the contract clauses.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <ClauseJobWorkspace />;
}
