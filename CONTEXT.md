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

## Relationships

- A **User** has one or more **Linked sign-ins**
- A **User** has many **Sessions**
- A **Linked sign-in** belongs to exactly one **User**

## Example dialogue

> **Dev:** "Someone signs in with Google using an email that already has a password — do we add a second **Linked sign-in**?"
> **Domain expert:** "Not while the password **User**'s email is unverified. They sign in with their password instead."

## Flagged ambiguities

- "account" was used to mean both the **User** and the `accounts` table row — resolved: the person is a **User**, the row is a **Linked sign-in**.
