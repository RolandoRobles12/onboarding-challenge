'use client';

import { useState, useCallback, useRef } from 'react';
import { useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { batchCreateQuestions } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Upload, FileSpreadsheet, FileText, CheckCircle, XCircle,
  AlertTriangle, Download, Eye, Loader2, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionType, QuizDifficulty } from '@/lib/types-scalable';
const uuidv4 = () => crypto.randomUUID();

interface ParsedQuestion {
  _id: string;
  text: string;
  options: { text: string; isCorrect: boolean }[];
  type: QuestionType;
  difficulty: QuizDifficulty;
  category: string;
  tags: string[];
  explanation: string;
  isTricky: boolean;
  trickyHint: string;
  _valid: boolean;
  _errors: string[];
  _selected: boolean;
}

type ColumnKey =
  | 'text' | 'option1' | 'option2' | 'option3' | 'option4' | 'option5'
  | 'correct' | 'type' | 'difficulty' | 'category' | 'tags'
  | 'explanation' | 'isTricky' | 'trickyHint';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  text: 'Pregunta (texto)',
  option1: 'Opción 1',
  option2: 'Opción 2',
  option3: 'Opción 3',
  option4: 'Opción 4',
  option5: 'Opción 5',
  correct: 'Respuesta(s) Correcta(s)',
  type: 'Tipo (single_choice / multiple_choice)',
  difficulty: 'Dificultad (easy / medium / hard)',
  category: 'Categoría',
  tags: 'Etiquetas (separadas por |)',
  explanation: 'Explicación',
  isTricky: 'Es Tricky (true/false)',
  trickyHint: 'Pista Tricky',
};

const REQUIRED_COLUMNS: ColumnKey[] = ['text', 'option1', 'option2', 'correct'];

function generateCSVTemplate(): string {
  const headers = Object.keys(COLUMN_LABELS).join(',');
  const example1 = [
    '"¿Qué significa AOS?"',
    '"Aviva On System"',
    '"Aviva Onboarding System"',
    '"App Online Store"',
    '"Aviva Operating System"',
    '""',
    '"Aviva On System"',
    '"single_choice"',
    '"medium"',
    '"Plataformas"',
    '"AOS|herramientas"',
    '"AOS significa Aviva On System, la plataforma principal."',
    '"false"',
    '""',
  ].join(',');
  const example2 = [
    '"¿Cuáles son documentos requeridos para crédito BA? (Selecciona todos)"',
    '"INE vigente"',
    '"Comprobante de domicilio"',
    '"Acta de nacimiento"',
    '"CURP"',
    '"RFC"',
    '"INE vigente|Comprobante de domicilio"',
    '"multiple_choice"',
    '"hard"',
    '"Documentos"',
    '"requisitos|documentos"',
    '"Se requieren INE y comprobante de domicilio."',
    '"false"',
    '""',
  ].join(',');
  return `${headers}\n${example1}\n${example2}`;
}

function parseRow(row: Record<string, string>): ParsedQuestion {
  const errors: string[] = [];
  const id = uuidv4();

  const text = (row.text || '').trim();
  if (!text) errors.push('Falta el texto de la pregunta');

  const optionFields: ColumnKey[] = ['option1', 'option2', 'option3', 'option4', 'option5'];
  const rawOptions = optionFields
    .map((f) => (row[f] || '').trim())
    .filter(Boolean);

  if (rawOptions.length < 2) errors.push('Se requieren al menos 2 opciones');

  const correctRaw = (row.correct || '').trim();
  if (!correctRaw) errors.push('Falta la(s) respuesta(s) correcta(s)');

  const correctAnswers = correctRaw.split('|').map((c) => c.trim()).filter(Boolean);

  const options = rawOptions.map((optText) => ({
    text: optText,
    isCorrect: correctAnswers.includes(optText),
  }));

  const hasCorrect = options.some((o) => o.isCorrect);
  if (!hasCorrect && correctRaw) {
    errors.push(`La respuesta "${correctRaw}" no coincide con ninguna opción`);
  }

  const rawType = (row.type || 'single_choice').trim().toLowerCase();
  const type: QuestionType = ['single_choice', 'multiple_choice', 'tricky'].includes(rawType)
    ? (rawType as QuestionType)
    : 'single_choice';

  const rawDiff = (row.difficulty || 'medium').trim().toLowerCase();
  const difficulty: QuizDifficulty = ['easy', 'medium', 'hard'].includes(rawDiff)
    ? (rawDiff as QuizDifficulty)
    : 'medium';

  const category = (row.category || '').trim();
  const tagsRaw = (row.tags || '').trim();
  const tags = tagsRaw ? tagsRaw.split('|').map((t) => t.trim()).filter(Boolean) : [];
  const explanation = (row.explanation || '').trim();
  const isTrickyRaw = (row.isTricky || '').trim().toLowerCase();
  const isTricky = isTrickyRaw === 'true' || isTrickyRaw === '1' || isTrickyRaw === 'si' || isTrickyRaw === 'sí';
  const trickyHint = (row.trickyHint || '').trim();

  return {
    _id: id,
    text,
    options,
    type,
    difficulty,
    category,
    tags,
    explanation,
    isTricky,
    trickyHint,
    _valid: errors.length === 0,
    _errors: errors,
    _selected: errors.length === 0,
  };
}

export default function ImportPage() {
  const { profile } = useAuth();
  const { products } = useProducts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const processData = useCallback((rawData: Record<string, string>[]) => {
    const parsed = rawData
      .filter((row) => Object.values(row).some((v) => v && v.trim()))
      .map(parseRow);
    setParsedQuestions(parsed);
    setImportDone(false);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      setParsedQuestions([]);
      setImportDone(false);

      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processData(results.data as Record<string, string>[]);
          },
          error: (err) => {
            toast({ title: 'Error al parsear CSV', description: err.message, variant: 'destructive' });
          },
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            const wb = XLSX.read(data, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
            processData(rows);
          } catch (err: any) {
            toast({ title: 'Error al parsear Excel', description: err.message, variant: 'destructive' });
          }
        };
        reader.readAsBinaryString(file);
      } else {
        toast({
          title: 'Formato no soportado',
          description: 'Solo se aceptan archivos .csv, .xlsx o .xls',
          variant: 'destructive',
        });
      }
    },
    [processData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const toggleSelect = (id: string) => {
    setParsedQuestions((prev) =>
      prev.map((q) => (q._id === id ? { ...q, _selected: !q._selected } : q))
    );
  };

  const toggleSelectAll = () => {
    const allValidSelected = parsedQuestions.filter((q) => q._valid).every((q) => q._selected);
    setParsedQuestions((prev) =>
      prev.map((q) => (!q._valid ? q : { ...q, _selected: !allValidSelected }))
    );
  };

  const handleImport = async () => {
    if (!selectedProductId) {
      toast({ title: 'Selecciona un producto', variant: 'destructive' });
      return;
    }
    const toImport = parsedQuestions.filter((q) => q._valid && q._selected);
    if (toImport.length === 0) {
      toast({ title: 'No hay preguntas válidas seleccionadas', variant: 'destructive' });
      return;
    }

    setImporting(true);
    try {
      const questionsToCreate = toImport.map((q) => ({
        productId: selectedProductId,
        organizationId: 'aviva-credito',
        text: q.text,
        explanation: q.explanation || undefined,
        type: q.type,
        difficulty: q.difficulty,
        options: q.options.map((o, i) => ({
          id: uuidv4(),
          text: o.text,
          isCorrect: o.isCorrect,
          order: i,
        })),
        tags: q.tags,
        category: q.category || undefined,
        isTricky: q.isTricky,
        trickyHint: q.trickyHint || undefined,
        active: true,
        timesUsed: 0,
        averageCorrectRate: 0,
      }));

      await batchCreateQuestions(questionsToCreate as any, profile?.uid || '');
      setImportDone(true);
      toast({
        title: `✅ ${toImport.length} preguntas importadas correctamente`,
        description: `Producto: ${products.find((p) => p.id === selectedProductId)?.name}`,
      });
      setParsedQuestions([]);
      setFileName('');
    } catch (err: any) {
      toast({ title: 'Error al importar', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_preguntas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsedQuestions.filter((q) => q._valid).length;
  const invalidCount = parsedQuestions.filter((q) => !q._valid).length;
  const selectedCount = parsedQuestions.filter((q) => q._valid && q._selected).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Importar Preguntas</h1>
        <p className="text-muted-foreground mt-2">
          Carga masivamente preguntas desde archivos CSV o Excel al banco de preguntas.
        </p>
      </div>

      {/* Template download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Plantilla de importación
          </CardTitle>
          <CardDescription>
            Descarga la plantilla CSV con el formato correcto. Las columnas obligatorias son:{' '}
            <strong>text, option1, option2, correct</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate} className="gap-2">
            <Download className="h-4 w-4" /> Descargar Plantilla CSV
          </Button>
        </CardContent>
      </Card>

      {/* Product selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Selecciona el Producto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label>Producto destino</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona un producto..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* File upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Sube tu Archivo</CardTitle>
          <CardDescription>Formatos soportados: .csv, .xlsx, .xls</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/30 hover:border-primary/50'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            {fileName ? (
              <div>
                <p className="font-semibold text-foreground">{fileName}</p>
                <p className="text-sm text-muted-foreground mt-1">Haz clic para cambiar el archivo</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">Arrastra aquí tu archivo o haz clic para seleccionar</p>
                <p className="text-sm text-muted-foreground mt-1">.csv, .xlsx, .xls</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {parsedQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">3. Vista Previa y Selección</CardTitle>
                <CardDescription className="mt-1 flex gap-4">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" /> {validCount} válidas
                  </span>
                  {invalidCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-4 w-4" /> {invalidCount} con errores
                    </span>
                  )}
                  <span className="text-muted-foreground">{selectedCount} seleccionadas para importar</span>
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                {parsedQuestions.filter((q) => q._valid).every((q) => q._selected)
                  ? 'Deseleccionar todo'
                  : 'Seleccionar todo'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {parsedQuestions.map((q, idx) => (
              <div
                key={q._id}
                className={cn(
                  'border rounded-lg transition-colors',
                  q._valid ? 'border-border' : 'border-destructive/40 bg-destructive/5'
                )}
              >
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onClick={() => q._valid && toggleSelect(q._id)}
                >
                  <div className="mt-0.5">
                    {q._valid ? (
                      <div
                        className={cn(
                          'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                          q._selected ? 'bg-primary border-primary' : 'border-muted-foreground'
                        )}
                      >
                        {q._selected && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          q.difficulty === 'easy'
                            ? 'bg-green-100 text-green-700'
                            : q.difficulty === 'hard'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        )}
                      >
                        {q.difficulty}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        {q.type}
                      </span>
                      {q.isTricky && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          tricky
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1 line-clamp-2">{q.text || '(sin texto)'}</p>
                    {!q._valid && (
                      <div className="mt-1 space-y-0.5">
                        {q._errors.map((err, i) => (
                          <p key={i} className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedRow(expandedRow === q._id ? null : q._id);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expandedRow === q._id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {expandedRow === q._id && (
                  <div className="px-3 pb-3 border-t bg-muted/30">
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Opciones:</p>
                        {q.options.map((o, i) => (
                          <p
                            key={i}
                            className={cn(
                              'flex items-center gap-1',
                              o.isCorrect ? 'text-green-700 font-medium' : 'text-foreground'
                            )}
                          >
                            {o.isCorrect ? '✓' : '○'} {o.text}
                          </p>
                        ))}
                      </div>
                      <div>
                        {q.category && <p><span className="text-muted-foreground">Categoría:</span> {q.category}</p>}
                        {q.tags.length > 0 && <p><span className="text-muted-foreground">Tags:</span> {q.tags.join(', ')}</p>}
                        {q.explanation && <p className="mt-1"><span className="text-muted-foreground">Explicación:</span> {q.explanation}</p>}
                        {q.isTricky && q.trickyHint && <p className="mt-1"><span className="text-muted-foreground">Pista:</span> {q.trickyHint}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Import button */}
      {parsedQuestions.length > 0 && (
        <div className="flex gap-3 items-center">
          <Button
            onClick={handleImport}
            disabled={importing || selectedCount === 0 || !selectedProductId}
            className="gap-2 min-w-[200px]"
            size="lg"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Importar {selectedCount} preguntas
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setParsedQuestions([]); setFileName(''); }}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" /> Limpiar
          </Button>
          {importDone && (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle className="h-5 w-5" /> ¡Importación completada!
            </span>
          )}
        </div>
      )}
    </div>
  );
}
