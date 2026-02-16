'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Video,
  FileText,
  Headphones,
  Globe,
  ListOrdered,
  RefreshCw,
  Clock,
  Users,
  Plus,
} from 'lucide-react';

const PLANNED_FEATURES = [
  { icon: Plus, label: 'Crear curso con módulos y lecciones' },
  { icon: Video, label: 'Subida de videos y gestión de streaming' },
  { icon: FileText, label: 'Adjuntar PDFs, PPTs y documentos' },
  { icon: Headphones, label: 'Lecciones en formato audio' },
  { icon: Globe, label: 'Contenido SCORM e iFrame embebido' },
  { icon: ListOrdered, label: 'Configuración de navegación (secuencial / libre)' },
  { icon: Clock, label: 'Fechas de expiración y tiempo límite por curso' },
  { icon: Users, label: 'Asignación por rol, grupo o branch' },
  { icon: RefreshCw, label: 'Configuración de re-certificación automática' },
  { icon: BookOpen, label: 'Banco de cursos reutilizables por organización' },
];

export default function AdminCoursesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Gestión de Cursos</h1>
            <Badge className="bg-sky-100 text-sky-800 border-sky-200">Próximamente</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Módulo de autoría de cursos estructurados (Course Authoring Engine).
          </p>
        </div>
        <Button disabled className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo curso
        </Button>
      </div>

      {/* Hero */}
      <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50">
        <CardContent className="py-10 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Course Authoring Engine</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto mt-2 leading-relaxed">
              Este módulo permitirá crear y gestionar cursos completos con múltiples tipos de
              contenido (video, slides, documentos, SCORM) organizados en módulos y lecciones.
              Incluye configuración de navegación, pre-requisitos, evaluaciones y certificación.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Planned features */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Funcionalidades planificadas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLANNED_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <Card key={feat.label} className="border border-dashed border-muted-foreground/20 bg-muted/10">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-sky-600" />
                    </div>
                    <CardDescription className="text-sm text-foreground/80 font-medium">
                      {feat.label}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Architecture note */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="text-base">Arquitectura del módulo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="font-mono bg-muted rounded-lg p-3 text-xs space-y-1">
            <p><span className="text-sky-600 font-semibold">Course</span> → módulos → lecciones → contenido</p>
            <p><span className="text-sky-600 font-semibold">Lección</span>: video | slides | documento | html | audio | SCORM | iFrame</p>
            <p><span className="text-sky-600 font-semibold">Assessment</span>: vinculado por lección o al final del curso</p>
            <p><span className="text-sky-600 font-semibold">Certificado</span>: automático al alcanzar passing score</p>
          </div>
          <p className="text-xs">
            Las colecciones Firestore <code className="bg-muted px-1 rounded">courses</code>,{' '}
            <code className="bg-muted px-1 rounded">enrollments</code> y{' '}
            <code className="bg-muted px-1 rounded">lesson_progress</code> ya están definidas
            en el esquema de datos del LMS.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
