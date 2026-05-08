"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BottomTabs, SideNav } from "@/components/shell/Nav";
import { Header } from "@/components/shell/Header";
import { PageTransition } from "@/components/shell/PageTransition";
import { useSession } from "@/lib/session/SessionProvider";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, configured, member, orgId } = useSession();

  useEffect(() => {
    if (!configured) router.replace("/setup");
    else if (status === "anon") router.replace("/signin");
    else if (status === "user" && (!orgId || !member)) router.replace("/onboarding");
  }, [status, configured, member, orgId, router]);

  if (status !== "ready" || !member) {
    return <LoadingScreen label="Loading workspace" />;
  }

  return (
    <div className="app-shell flex">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 lg:px-8">
          <PageTransition>{children}</PageTransition>
        </main>
        <BottomTabs />
      </div>
    </div>
  );
}
