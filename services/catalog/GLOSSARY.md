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

**Venue space**

A named room or stage of a venue (Hall A, Main stage). A performance is held in one space; space names are unique within a venue. A venue also carries a city, a default time zone and an optional capacity hint. Its name, address and space names are fixed while a released or in-review performance uses it.

**Release on approval**

A publication review submitted with *Release as soon as approved* instead of a release time. Approval records the approval time as the release time, and is refused after the sale start.

**Sales pause**

An organizer's immediate, audited stop of sales for a released performance. It publishes the next sale version with sales suspended, like a postponement, and the organizer can resume it. A platform disruption takes precedence and closes it as superseded.

**Disruption request**

An organizer's request to cancel or postpone a released performance, with a reason and, for postponement, a proposed schedule. It commits nothing. Platform operations accept it by confirming the performance disruption (which links it) or decline it with a reason; the organizer can withdraw it before a decision.
