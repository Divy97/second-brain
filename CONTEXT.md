# Second Brain

A multi-user web app where people capture notes, links and files and later ask questions over them.

## Language

**User**:
A person with a Second Brain, identified by one email address.
_Avoid_: Account, customer

**Sign-in method**:
A way a **User** proves who they are: email and password, or Google.
_Avoid_: Login type, provider (except in code)

**Linked sign-in**:
The stored record tying one **Sign-in method** to one **User** (the `accounts` table).
_Avoid_: Account

**Session**:
A **User**'s signed-in period on one browser, carried by a cookie.

**Capture**:
Saving something a **User** came across into their Second Brain. Manual captures are always **Indexed**; passive captures follow the **User**'s capture setting.
_Avoid_: Clip, import, save (as a noun)

**Passive capture**:
A **Capture** the browser extension makes on its own as the **User** browses. Off by default; the **User** turns it on.
_Avoid_: Auto-save, history sync

**Stored**:
The state of a captured item whose page text is kept but not yet **Indexed**. Not searchable by Ask.
_Avoid_: Archived, saved

**Index**:
To make a **Stored** item searchable and understood: chunked, embedded, enriched. It spends the **User**'s model key or operator-paid fallbacks.
_Avoid_: Process, ingest (except in code)

**Extension**:
The browser add-on that performs **Captures** from the pages a **User** visits.
_Avoid_: Plugin, clipper

## Relationships

- A **User** has one or more **Linked sign-ins**
- A **User** has many **Sessions**
- A **Linked sign-in** belongs to exactly one **User**
- A **Capture** is either **Stored** or **Indexed**; a **Stored** item can be **Indexed** later, never the reverse

## Example dialogue

> **Dev:** "Someone signs in with Google using an email that already has a password — do we add a second **Linked sign-in**?"
> **Domain expert:** "Not while the password **User**'s email is unverified. They sign in with their password instead."

## Flagged ambiguities

- "account" was used to mean both the **User** and the `accounts` table row — resolved: the person is a **User**, the row is a **Linked sign-in**.
