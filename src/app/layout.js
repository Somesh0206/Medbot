import "./globals.css";

export const metadata = {
  title: "Healio — Verifiable Clinical Intelligence & Medical Governance Studio",
  description: "Next-generation verifiable medical compliance, patient record management, grounded evidence Q&A, and statutory audit engine.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
