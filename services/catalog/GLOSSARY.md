# Catalog

## Language

**Concert**

An event with a venue, schedule and sale lifecycle. An organizer's concert belongs to an organization. The creator records the account that created it.

**Sale window**

The interval in which a concert accepts ticket purchases.

**Sale activation version**

The version of the sale configuration recorded when an organizer publishes a draft. Ticketing must acknowledge this version for Catalog to expose the event. Check-in acknowledges independently.

**Ticket type**

A concert's named ticket category, price, configured capacity and account limit.

**Artist biography**

Concert information reviewed by an organizer before publication.

**Event**

A production or program that groups its scheduled performances.

**Performance**

A scheduled occurrence of an event with its own venue space and sale lifecycle.

**Venue space**

An area at a venue where a performance takes place, such as a screening room or arena.

**Venue layout**

A description of an arrangement of a venue space. A performance uses the layout published for that occurrence.

**Sale offer**

A named way to buy access to a performance at a price during a sale window. Offers can draw from the same capacity group. Organizers see an offer as a **Ticket type** (Loại vé) and a capacity group as a **Stock pool** (Nhóm chỗ), or a **Seat pool** (Nhóm ghế) for numbered seats; API and storage keep `offer` and `group`. An offer can carry a buyer-facing description (up to 500 characters) and a minimum quantity per order.

**Event content**

What buyers read about a native event besides its schedule: poster, original and translated title and description, artist bio, age rating and refund policy. It is edited directly until a performance is released.

**Content revision**

The one pending edit of a released event's content. A platform reviewer approves, returns or rejects it, and buyers see the live content until approval. Its revision number keeps counting across approvals.

**Content version**

The optimistic lock of the event content editors (`events.content_version`). It is separate from the event draft version, which is the token of publication reviews and only moves when the title or description of a draft changes.

**Segment**

The top level of event classification: Concerts, Festivals, Sports, Arts, Theater & Comedy, Family or Other. An event has one segment. The list is Catalog reference data changed only by migration.

**Genre**

A style inside a segment, such as V-Pop or Football. Genre ids are unique across segments. Retired genres are deactivated, never deleted; events that use one keep it.

**Primary genre**

The one genre of an event that belongs to its segment. A segment and a primary genre are needed before a performance can be submitted for release.

**Tag (secondary genre)**

Up to three additional genres of an event, from any segment, used by discovery. Changing tags after release goes through the content revision but does not re-issue sale snapshots.
