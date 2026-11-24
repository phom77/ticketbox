import { useEffect, useState } from 'react';
import type { Order } from '../../api/orders';
import { loadOrderPoster } from './checkoutPresentation';

/** The poster image of an order's event, or `null` while unknown or when there is none. */
export function useOrderPoster(order: Order | null | undefined, known?: string | null) {
  const [loaded, setLoaded] = useState<{ orderId: string; url: string | null } | null>(null);
  const orderId = order?.id;

  useEffect(() => {
    if (!order || known) return;
    const controller = new AbortController();
    void loadOrderPoster(order, controller.signal).then((url) => {
      if (!controller.signal.aborted) setLoaded({ orderId: order.id, url });
    });
    return () => controller.abort();
    // The poster depends on the order identity, not on each refreshed snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, known]);

  return known ?? (loaded && loaded.orderId === orderId ? loaded.url : null);
}
