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

**Reel audio**:
The paid lookup that turns an Instagram video's speech into text, so a reel is searchable by what was said in it and not only by its caption. Spent only on media Instagram reports as a video, and capped per **User** per day apart from the other paid lookups.
_Avoid_: Reel transcript (Instagram has no caption track to fetch)

**Device key**:
The secret a **User** creates in Settings and pastes into the **Extension** to connect it. One per browser or profile, shown once, revocable, limited to **Captures**, capture settings and **Stored** items.
_Avoid_: Token, API key (that word means the model key)

**Fact**:
An atomic statement in the **User**'s own words, extracted from one source item (`kind ∈ {thought, fact, meeting, quote}`). Superseded facts are invalidated (`valid_to` set), never deleted. A **User** can also **Forget** a fact manually, which invalidates it the same way.
_Avoid_: Memory (that word is unused elsewhere here)

**Forget** (a fact):
A **User**-initiated action that invalidates one of their own **Facts** by setting `valid_to`. Never a physical delete. Distinct from the pipeline's automatic `DELETE` reconciliation, which invalidates a fact because a newer one supersedes it.
_Avoid_: Delete (reserved for the pipeline's own DELETE action on facts; items are "deleted", facts are "forgotten")

## Relationships

- A **User** has one or more **Linked sign-ins**
- A **User** has many **Sessions**
- A **Linked sign-in** belongs to exactly one **User**
- A **Capture** is either **Stored** or **Indexed**; a **Stored** item can be **Indexed** later, never the reverse
- A **Fact** belongs to exactly one source item; one item can produce many **Facts**

## Example dialogue

> **Dev:** "Someone signs in with Google using an email that already has a password — do we add a second **Linked sign-in**?"
> **Domain expert:** "Not while the password **User**'s email is unverified. They sign in with their password instead."

## Flagged ambiguities

- "account" was used to mean both the **User** and the `accounts` table row — resolved: the person is a **User**, the row is a **Linked sign-in**.
- An item's `kind` can itself be the value `fact` (a short, typed-as-a-fact note) — distinct from a **Fact** (the atomic statement the facts layer extracts from such notes). The item is "fact-kind"; what it produces are **Facts**. UI copy spells out "Facts extracted from this note" to keep the two apart.
