import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query/QueryProvider";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Clearline",
  description: "Run your services business from one app: jobs, customers, invoices, expenses, taxes, profit.",
  manifest: "/manifest.json",
  applicationName: "Clearline",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-text">
        <QueryProvider>
          <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
