import { useState } from 'react';
import { useProducts, useRemoveProduct } from '../../app/data-hooks';
import { type UserProduct } from '../../core/food';
import { DataError } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { ProductForm } from './ProductForm';

/** "המוצרים שלי" in the settings: every saved product, to open (its photo and values), change or delete. */
export function ProductsSection() {
  const query = useProducts();
  const products = query.data ?? [];
  const removeProduct = useRemoveProduct();
  const toast = useToast();
  /** The product open in the editor; 'new' for a new one; null = closed. */
  const [open, setOpen] = useState<UserProduct | 'new' | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, 'he'));

  async function remove(id: string): Promise<void> {
    setConfirmRemoveId(null);
    try {
      await removeProduct.mutateAsync(id);
    } catch (error) {
      toast.show({ message: dataErrorMessage(error instanceof DataError ? error.code : null) });
    }
  }

  return (
    <section aria-labelledby="products-title" className="space-y-3 card p-5">
      <h2 id="products-title" className="text-xl font-bold">
        {he.products.title}
      </h2>
      {query.isError && <p className="text-sm text-muted">{he.products.loadError}</p>}
      {query.isSuccess && products.length === 0 && (
        <p className="text-sm text-muted">{he.products.empty}</p>
      )}
      {sorted.length > 0 && (
        <ul className="divide-y divide-faint overflow-hidden rounded-2xl bg-surface-2">
          {sorted.map((product) => (
            <li key={product.id} className="flex items-center">
              {confirmRemoveId === product.id ? (
                <span className="flex min-h-14 flex-1 flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 break-words text-base">
                    {product.name} · {he.products.removeAsk}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button onClick={() => void remove(product.id)}>{he.products.removeYes}</Button>
                    <Button variant="ghost" onClick={() => setConfirmRemoveId(null)}>
                      {he.cancel}
                    </Button>
                  </span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen(product)}
                    aria-label={he.products.edit(product.name)}
                    className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2 text-start transition hover:bg-faint/60"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-base font-medium">
                        {product.name}
                      </span>
                      <span className="block text-sm text-muted">
                        {he.products.per100(formatInt(product.kcal100), product.basis === 'ml')}
                      </span>
                    </span>
                    <Icon name="pencil" />
                  </button>
                  <Button
                    icon
                    variant="ghost"
                    className="me-1 shrink-0"
                    aria-label={he.products.remove(product.name)}
                    onClick={() => setConfirmRemoveId(product.id)}
                  >
                    <Icon name="trash" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => setOpen('new')}>
        <Icon name="plus" /> {he.products.addNew}
      </Button>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' ? he.products.newTitle : he.products.editTitle}
        dismissOnBackdrop={false}
      >
        {open !== null && (
          <ProductForm
            key={open === 'new' ? 'new' : open.id}
            editing={open === 'new' ? null : open}
            products={products}
            onCancel={() => setOpen(null)}
            onSaved={(_, { photoFailed }) => {
              setOpen(null);
              if (photoFailed) toast.show({ message: he.products.photoNotSaved });
            }}
          />
        )}
      </Sheet>
    </section>
  );
}
