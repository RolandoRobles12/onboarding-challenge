'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Route,
  Users,
  Shuffle,
  Award,
  Target,
  BookOpen,
  CheckCircle,
  Plus,
  GitBranch,
} from 'lucide-react';

const PLANNED_FEATURES = [
  { icon: Plus, label: 'Crear rutas con pasos: cursos, desafíos y evaluaciones' },
  { icon: Target, label: 'Pre-requisitos entre pasos de la ruta' },
  { icon: CheckCircle, label: 'Score mínimo por paso para avanzar' },
  { icon: Users, label: 'Auto-asignación por rol, grupo o branch' },
  { icon: BookOpen, label: 'Mezcla de tipos de contenido (cursos + desafíos)' },
  { icon: Award, label: 'Certificado al completar toda la ruta' },
  { icon: Shuffle, label: 'Encadenamiento de certificaciones de compliance' },
  { icon: GitBranch, label: 'Rutas ramificadas con lógica condicional' },
];

export default function AdminLearningPathsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Rutas de Aprendizaje</h1>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Próximamente</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Diseño y gestión de itinerarios formativos (Assignment Engine).
          </p>
        </div>
        <Button disabled className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva ruta
        </Button>
      </div>

      {/* Hero */}
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50">
        <CardContent className="py-10 text-center space-y-4">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg">
            <Route className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Assignment Engine</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto mt-2 leading-relaxed">
              Diseña itinerarios formativos completos combinando cursos, desafíos y evaluaciones.
              Define pre-requisitos, scores mínimos, auto-asignaciones y certificaciones
              encadenadas para programas de onboarding y compliance.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Conceptual flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flujo conceptual</CardTitle>
          <CardDescription>
            Cómo interactúan los módulos dentro de una ruta de aprendizaje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-mono bg-muted rounded-lg p-4 text-xs space-y-2 text-center">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="bg-background px-3 py-1.5 rounded border text-emerald-700 font-semibold">Usuario</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border text-emerald-700 font-semibold">Assignment Engine</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border">Course Container</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="bg-background px-3 py-1.5 rounded border">Course Container</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border">Assessment Engine</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border text-amber-700 font-semibold">Certification Engine</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="bg-background px-3 py-1.5 rounded border text-amber-700 font-semibold">Certification Engine</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border">Compliance Lifecycle</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-background px-3 py-1.5 rounded border">Renovación</span>
            </div>
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
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-emerald-600" />
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
    </div>
  );
}
