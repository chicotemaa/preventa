import type { Metadata } from "next";
import { AppHeader } from "./app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARA Distribuidora RAP",
  description: "Comparador de precios para preventa y listas comerciales",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
