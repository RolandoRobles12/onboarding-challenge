import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { AvivaLogo } from '@/components/AvivaLogo';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8">
      <div className="text-center mb-8">
        <AvivaLogo className="w-48 h-auto mx-auto mb-4" />
        <h1 className="text-4xl sm:text-5xl font-bold font-headline text-primary">AvivaQuest</h1>
        <p className="mt-2 text-lg text-muted-foreground">Tu aventura de conocimiento ha comenzado.</p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Promotores BA</CardTitle>
            <CardDescription>Para el producto Aviva Tu Compra.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-6">
              Comienza tu misión para dominar los secretos de Aviva Tu Compra y prepárate para el éxito.
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/ba">
                Iniciar Misión BA <ArrowRight className="ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Promotores y Gerentes</CardTitle>
            <CardDescription>Para Aviva Tu Negocio y Aviva Contigo.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-6">
              Embárcate en esta aventura para convertirte en un experto de Aviva Tu Negocio y Aviva Contigo.
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/atn">
                Iniciar Misión ATN <ArrowRight className="ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
      </footer>
    </main>
  );
}
