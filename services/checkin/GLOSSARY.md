# Check-in

## Language

**Admission**

The acceptance of a ticket for entry to its concert.

**Concert ownership projection**

The local copy of the Catalog organization that owns the concert. Organizer access to guest imports and admission summaries uses this scope.

**Ticket snapshot**

A local description of an issued ticket, combined with the admission state owned by Check-in.

**Offline sync**

Reconciliation of scans recorded while a scanner could not reach the admission authority.

**Guest**

A person invited through a concert's guest list.

**Performance admission**

The acceptance of a ticket for entry to its scheduled performance. Confirmation uses the ticket's scope and the staff member's current permission.

**Staff assignment**

The record that lets a staff account admit tickets and guests of one performance. Check-in checks it on every scoped request, and a revocation takes effect on the next request.

**Recent admissions**

The newest admissions of a performance as the organizer sees them: time, gate, ticket reference, ticket type and staff, never the QR value or device id.
