import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
          LabFlow
        </Link>
        {children}
      </div>
    </div>
  );
}
