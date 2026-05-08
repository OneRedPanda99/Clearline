"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/session/SessionProvider";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

export default function RootPage() {
  const router = useRouter();
  const { status, configured, member, orgId } = useSession();

  useEffect(() => {
    if (!configured) {
      router.replace("/setup");
      return;
    }
    if (status === "anon") router.replace("/signin");
    else if (status === "user" && !orgId) router.replace("/onboarding");
    else if (status === "user" && orgId && !member) router.replace("/onboarding");
    else if (status === "ready") router.replace("/home");
  }, [status, configured, member, orgId, router]);

  return <LoadingScreen label="Starting Clearline" />;
}
