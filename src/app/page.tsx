import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { AvivaLogo } from '@/components/AvivaLogo';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-accent text-accent-foreground py-6 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
            <AvivaLogo className="h-16 w-auto mb-4" />
            <h1 className="text-4xl sm:text-5xl font-bold font-headline">Desafío Aviva</h1>
            <p className="mt-2 text-lg text-accent-foreground/80">Tu aventura de conocimiento ha comenzado.</p>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="bg-card hover:shadow-xl transition-shadow duration-300 rounded-lg border-accent/20">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-accent">Promotores BA</CardTitle>
              <CardDescription>Para el producto Aviva Tu Compra.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-6 text-card-foreground/80">
                Comienza tu misión para dominar los secretos de Aviva Tu Compra y prepárate para el éxito.
              </p>
              <Button asChild size="lg" className="w-full rounded-lg">
                <Link href="/ba">
                  Iniciar Misión BA <ArrowRight className="ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card hover:shadow-xl transition-shadow duration-300 rounded-lg border-accent/20">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-accent">Aviva Tu Negocio y Aviva Contigo</CardTitle>
              <CardDescription>Para Promotores y Gerentes.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-6 text-card-foreground/80">
                Embárcate en esta aventura para convertirte en un experto de Aviva Tu Negocio y Aviva Contigo.
              </p>
              <Button asChild size="lg" className="w-full rounded-lg">
                <Link href="/atn">
                  Iniciar Misión ATN <ArrowRight className="ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="bg-accent text-accent-foreground/80 py-4 px-4 sm:px-8 mt-12">
        <div className="max-w-7xl mx-auto text-center text-sm">
            <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
