import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cadence — Find your rhythm",
  description: "A quiet space to focus, take a breath, and find your rhythm.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
