import { AvivaLogo } from '@/components/AvivaLogo';
import Link from 'next/link';

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="py-3 sm:py-4 px-4 sm:px-8 bg-accent text-accent-foreground">
        <Link href="/" aria-label="Volver al inicio">
          <AvivaLogo className="h-8 sm:h-10 w-auto" />
        </Link>
      </header>
      <main className="flex flex-col items-center justify-start p-4 md:p-8">
        <div className="w-full max-w-lg md:max-w-2xl">
          {children}
        </div>
      </main>
    </div>
  );
}
