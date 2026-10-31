import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
          Labquill
        </Link>
        {children}
        <p className="mt-8 text-center text-xs leading-5 text-subtle">
          By creating an account, joining a lab or signing in, you agree to the{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-fg">
            Terms
          </Link>{' '}
          and the{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">
            Privacy statement
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
