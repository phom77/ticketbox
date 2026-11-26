-- Backfill the sales ledger from existing orders. Rows already written by the live writer are kept.
-- Historical refunds are dated by the OrderRefunded event time (no confirmation time was stored before).

INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id, offer_id,
        group_id, offer_name, section_label, quantity, amount, provider, occurred_at)
SELECT o.id, oi.id, 'SALE', COALESCE(o.organization_id, c.organization_id),
       COALESCE(o.performance_event_id, o.concert_id), o.concert_id, oi.ticket_type_id, oi.group_id,
       COALESCE(oi.offer_name, tt.name, ''), COALESCE(oi.section_label, tt.name), oi.quantity, oi.subtotal,
       o.payment_provider, o.paid_at
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN concerts c ON c.id = o.concert_id
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
 WHERE o.status IN ('PAID', 'REFUNDED') AND o.paid_at IS NOT NULL
ON CONFLICT (order_item_id, kind) DO NOTHING;

INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id, offer_id,
        group_id, offer_name, section_label, quantity, amount, provider, occurred_at)
SELECT o.id, oi.id, 'REFUND', COALESCE(o.organization_id, c.organization_id),
       COALESCE(o.performance_event_id, o.concert_id), o.concert_id, oi.ticket_type_id, oi.group_id,
       COALESCE(oi.offer_name, tt.name, ''), COALESCE(oi.section_label, tt.name), oi.quantity, oi.subtotal,
       o.payment_provider, (SELECT max(e.recorded_at) FROM order_events e
         WHERE e.order_id = o.id AND e.event_type = 'OrderRefunded')
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN concerts c ON c.id = o.concert_id
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
 WHERE o.status = 'REFUNDED' AND o.paid_at IS NOT NULL
   AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'OrderRefunded')
ON CONFLICT (order_item_id, kind) DO NOTHING;

UPDATE order_refunds f
   SET confirmed_at = (SELECT max(e.recorded_at) FROM order_events e
                        WHERE e.order_id = f.order_id AND e.event_type = 'OrderRefunded')
 WHERE f.state = 'CONFIRMED' AND NOT f.compensation AND f.confirmed_at IS NULL;
