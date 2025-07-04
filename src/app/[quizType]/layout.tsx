import { AvivaLogo } from '@/components/AvivaLogo';
import Link from 'next/link';

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="py-4 px-8 border-b">
        <Link href="/" aria-label="Volver al inicio">
          <AvivaLogo className="w-32 h-auto" />
        </Link>
      </header>
      <main className="flex flex-col items-center justify-start p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </main>
    </>
  );
}
