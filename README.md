Fun Facts Matcher

A simple web app game where you drag fun facts and pets onto people and submit to check your matches. Correct matches lock, and you keep going until everything is matched. Scoring awards 64 points on the first correct try, 32 on the second, 16 on the third, and halves each subsequent try down to a minimum of 1 point.

Data sources:
- Images: `people/` directory (file names become display names)
- Facts: `fun-facts.csv` with headers `Name,Fun Fact`
- Pets: `pets/` directory (filename prefix before the first underscore matches the owner; the remainder becomes the pet name)

Any changes to `people/`, `pets/`, or `fun-facts.csv` are picked up at runtime. Just refresh the page after edits.

Run locally
- Requires Node.js 16+.
- Start the server: `node server.js`
- Open: `http://localhost:3000`

How it works
- The server exposes:
  - `GET /api/people` — lists people detected from `people/` (filename -> display name)
  - `GET /api/facts` — parses `fun-facts.csv` to `[{ id, name, fact }]`
  - `GET /api/pets` — reads `pets/` and returns `[{ id, owner, name, image }]`
- The frontend fetches those endpoints and builds the drag-and-drop UI.
- Submit checks current assignments, locks correct ones, and updates score based on the attempt number per card.
- You can drag a card back to its panel to unassign it.

CSV format

```
Name,Fun Fact
Alice,Once biked across Europe
Bob,Has a pet iguana
```

Notes
- If a CSV name has no image, the person is shown as a name-only tile.
- If an image exists with no corresponding fact, that person tile is still shown; it just won’t receive a locked match until a fact for that person exists in the CSV.
- Multiple pets per person are supported—just drop each pet card on the right owner.
