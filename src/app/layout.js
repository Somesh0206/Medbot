import "./globals.css";

export const metadata = {
  title: "VeriMed AI Audit Studio",
  description: "Verifiable Medical Compliance Engine",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
