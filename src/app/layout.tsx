import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zco - Assistant Dashboard",
  description: "Local Knowledge AI Assistant Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${poppins.className} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC] text-slate-900 font-sans antialiased">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
