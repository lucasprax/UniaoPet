# Security Specification for União Pet Firestore Database

## 1. Data Invariants
- Users can only read and write their own messages, or messages in conversations they are a part of.
- Anyone signed in can read posts and create new posts.
- Users can only edit or delete posts they authored.
- Comments can only be edited or deleted by their authors.
- All IDs must match standard valid pattern '^[a-zA-Z0-9_\-]+$'.
- Maximum size limit of strings and fields is enforced to prevent resource consumption.

## 2. The "Dirty Dozen" Payloads
Here are 12 malicious payloads that MUST be rejected:
1. Creating a Post with a non-matching authorEmail or authorName (Identity Spoofing).
2. Modifying a Post's immutable fields such as `authorEmail` or `id` (Immutability violation).
3. Injecting a massive 10MB string into the title of a Post (Denial of Wallet).
4. Creating a Comment with `authorEmail` of another user (Identity Spoofing).
5. Attempting to update a comment's `postId` to point to a different post (Relational sync violation).
6. Attempting to read a conversation where the user is not in the `participants` list (Confidentiality leak).
7. Creating a conversation with a massive array of participants (Resource exhaustion).
8. Injecting special characters as document IDs (ID Poisoning).
9. Appending a fake field `isVerified` or `isAdmin` inside the user profile or post (Ghost Field Injection).
10. Attempting to bypass the authentication check on writing messages (Anonymous writes).
11. Sending a client-side timestamp instead of the server timestamp for the `date` of comments.
12. Attempting to delete someone else's post or comment.

## 3. Test Runner Definition (firestore.rules.test.ts)
A mock/conceptual representation of our test suite:
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Test suite validating all security assertions return PERMISSION_DENIED for unauthorized or invalid payloads.
```
