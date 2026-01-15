'use client';

import { useState } from 'react';
import { useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createProduct, updateProduct, deleteProduct } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { Package, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import type { ProductFormData } from '@/lib/types-scalable';

const ICON_OPTIONS = [
  'box', 'package', 'shopping-bag', 'shopping-cart', 'credit-card',
  'briefcase', 'building', 'home', 'store', 'wallet'
];

const COLOR_OPTIONS = [
  '#23cd7d', '#074750', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#14b8a6'
];

export default function ProductsPage() {
  const { products, loading, refresh } = useProducts();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    shortName: '',
    description: '',
    icon: 'package',
    color: '#23cd7d',
    targetAudience: '',
    tags: [],
  });
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDialog = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        shortName: product.shortName,
        description: product.description,
        icon: product.icon,
        color: product.color,
        targetAudience: product.targetAudience,
        tags: product.tags || [],
      });
      setTagsInput((product.tags || []).join(', '));
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        shortName: '',
        description: '',
        icon: 'package',
        color: '#23cd7d',
        targetAudience: '',
        tags: [],
      });
      setTagsInput('');
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.id) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo identificar tu usuario.',
      });
      return;
    }

    setSaving(true);

    try {
      // Procesar tags
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (editingProduct) {
        // Actualizar producto existente
        await updateProduct(editingProduct.id, {
          ...formData,
          tags,
        });

        toast({
          title: 'Producto actualizado',
          description: `${formData.name} se actualizó correctamente.`,
        });
      } else {
        // Crear nuevo producto
        await createProduct(
          {
            organizationId: 'aviva-credito',
            ...formData,
            tags,
            active: true,
            order: products.length, // Orden al final
          },
          profile.id
        );

        toast({
          title: 'Producto creado',
          description: `${formData.name} se creó correctamente.`,
        });
      }

      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el producto. Intenta de nuevo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar el producto "${productName}"?`)) {
      return;
    }

    try {
      await deleteProduct(productId);
      toast({
        title: 'Producto eliminado',
        description: `${productName} se eliminó correctamente.`,
      });
      refresh();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el producto.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Productos</h1>
          <p className="text-muted-foreground">
            Crea y gestiona los productos de onboarding
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Producto
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                </DialogTitle>
                <DialogDescription>
                  {editingProduct
                    ? 'Modifica la información del producto'
                    : 'Completa la información del nuevo producto'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del Producto *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Aviva Tu Compra"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shortName">Nombre Corto *</Label>
                    <Input
                      id="shortName"
                      value={formData.shortName}
                      onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                      placeholder="BA"
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe el producto y su propósito"
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Audiencia Objetivo *</Label>
                  <Input
                    id="targetAudience"
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                    placeholder="Promotores BA, Vendedores de Kiosco, etc."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color del Producto *</Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-10 w-10 rounded-lg border-2 transition-all ${
                          formData.color === color ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (separados por comas)</Label>
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="crédito, compra, promotores"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : editingProduct ? 'Actualizar' : 'Crear Producto'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar productos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No se encontraron productos' : 'No hay productos aún'}
            </p>
            {!searchQuery && (
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primer Producto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: product.color }}
                  >
                    {product.shortName}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(product)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(product.id, product.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="mt-3">{product.name}</CardTitle>
                <CardDescription>{product.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Audiencia:</span> {product.targetAudience}
                  </p>
                  {product.tags && product.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {product.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
