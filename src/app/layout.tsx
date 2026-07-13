import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import Sidebar from "@/components/Sidebar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "BudgetFlow",
  description: "A Copilot/Monarch-style personal budget app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <DataProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 px-8 py-8 max-w-6xl mx-auto">{children}</main>
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
