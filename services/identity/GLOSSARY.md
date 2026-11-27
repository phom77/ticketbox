# Identity

## Language

**Account**

A person's identity, profile and assigned role in TicketBox.

**Audience**

An account allowed to join a sale and buy tickets.

**Organizer**

A member authorized to manage concerts owned by its organization.

**Organization**

A group approved by TicketBox to operate concerts. Membership connects an account to one organization. Grants on that membership authorize member management, event management or finance.

**Staff**

An account allowed to perform admission operations.

**Organization profile**

The contacts, logo, statement details and reporting timezone an organization keeps beside its approved display name. Identity owns it and other services read it only through `identity.organization-profile.v1`.

**Statement details**

The legal name, tax code and billing address printed on settlement statements. Members with `MEMBERS` or `FINANCE` edit them.

**Reporting timezone**

The IANA timezone in which an organization's sales reports group days. It defaults to `Asia/Ho_Chi_Minh`.
