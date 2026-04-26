import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Macro Dashboard',
  description: 'Forex Factory economic calendar + macro metrics for USD, EUR, GBP, JPY, CAD, AUD',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className={`${inter.className} h-screen overflow-hidden bg-[#09090b] text-slate-100`}>
        {children}
      </body>
    </html>
  );
}
