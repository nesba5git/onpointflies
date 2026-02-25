import { getCatalogStore } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

const STORE_KEY = 'all';

// Default catalog data — used to seed the store on first access
const DEFAULT_CATALOG = [
  {
    name: "Woolly Bugger - Black",
    type: "Streamer",
    bestFor: "Trout, Bass, Panfish",
    description: "The classic all-around streamer. Effective in virtually any water condition.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Black_Woolly_Bugger_by_James_Stripes.jpg/600px-Black_Woolly_Bugger_by_James_Stripes.jpg",
    recipe: "Hook: 4-10 3XL streamer\nThread: Black 6/0\nTail: Black marabou\nBody: Black chenille\nHackle: Black saddle"
  },
  {
    name: "Woolly Bugger - Olive",
    type: "Streamer",
    bestFor: "Trout, Bass",
    description: "Olive variation imitates leeches and baitfish. Great in stained water.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/OliveDumbBellWoollyBugger.jpg/600px-OliveDumbBellWoollyBugger.jpg",
    recipe: "Hook: 4-10 3XL streamer\nThread: Olive 6/0\nTail: Olive marabou\nBody: Olive chenille\nHackle: Grizzly saddle"
  },
  {
    name: "Muddler Minnow",
    type: "Streamer",
    bestFor: "Trout, Bass",
    description: "Classic sculpin imitation. Deadly when stripped along the bottom.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Muddler_minnow_fly.JPG/600px-Muddler_minnow_fly.JPG",
    recipe: "Hook: 4-8 3XL streamer\nThread: Brown 6/0\nTail: Turkey quill\nBody: Gold tinsel\nWing: Turkey quill\nHead: Spun deer hair"
  },
  {
    name: "Zonker - White",
    type: "Streamer",
    bestFor: "Trout, Bass, Pike",
    description: "Rabbit strip creates incredible action. Imitates baitfish perfectly.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/OliveAndWhiteDumbBellWoollyBugger.jpg/600px-OliveAndWhiteDumbBellWoollyBugger.jpg",
    recipe: "Hook: 2-6 3XL streamer\nThread: White 6/0\nBody: Pearl mylar\nWing: White rabbit strip\nCollar: White hackle"
  },
  {
    name: "Pheasant Tail Nymph",
    type: "Nymph",
    bestFor: "Trout",
    description: "Legendary mayfly nymph pattern. A must-have in every fly box.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Pheasant_Tail_Flash_Back_Nymph.jpg/600px-Pheasant_Tail_Flash_Back_Nymph.jpg",
    recipe: "Hook: 12-18 nymph\nThread: Brown 8/0\nTail: Pheasant tail fibers\nBody: Pheasant tail fibers\nThorax: Peacock herl\nWingcase: Pheasant tail"
  },
  {
    name: "Hare's Ear Nymph",
    type: "Nymph",
    bestFor: "Trout",
    description: "Buggy profile imitates many aquatic insects. Highly effective pattern.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Gold_ribbed_hairs_ear_trout_fly.JPG/600px-Gold_ribbed_hairs_ear_trout_fly.JPG",
    recipe: "Hook: 10-16 nymph\nThread: Brown 8/0\nTail: Hare's mask guard hairs\nBody: Hare's ear dubbing\nRib: Gold tinsel\nWingcase: Turkey quill"
  },
  {
    name: "Prince Nymph",
    type: "Nymph",
    bestFor: "Trout",
    description: "Attractor pattern that triggers strikes. The white wings are key.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Bead_Head_Prince_Nymph.jpg/600px-Bead_Head_Prince_Nymph.jpg",
    recipe: "Hook: 10-16 nymph\nThread: Black 8/0\nTail: Brown goose biots\nBody: Peacock herl\nRib: Gold tinsel\nWings: White goose biots\nHackle: Brown hen"
  },
  {
    name: "Adams Dry Fly",
    type: "Dry Fly",
    bestFor: "Trout",
    description: "The most versatile dry fly ever created. If you only carry one dry, make it an Adams.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Standard_Adams_Dry_Fly.jpg/600px-Standard_Adams_Dry_Fly.jpg",
    recipe: "Hook: 12-18 dry fly\nThread: Gray 8/0\nTail: Mixed grizzly/brown hackle fibers\nBody: Muskrat dubbing\nWing: Grizzly hen tips\nHackle: Mixed grizzly/brown"
  },
  {
    name: "Elk Hair Caddis",
    type: "Dry Fly",
    bestFor: "Trout",
    description: "Essential caddis imitation. Floats like a cork and drives fish crazy.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Elk_Hair_Caddis2.jpg/600px-Elk_Hair_Caddis2.jpg",
    recipe: "Hook: 12-18 dry fly\nThread: Tan 8/0\nBody: Hare's ear dubbing\nHackle: Brown, palmered\nWing: Elk hair"
  },
  {
    name: "Royal Wulff",
    type: "Dry Fly",
    bestFor: "Trout",
    description: "High-floating attractor pattern. Visible in rough water and low light.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/RoyalWulffDryFly.jpg/600px-RoyalWulffDryFly.jpg",
    recipe: "Hook: 10-16 dry fly\nThread: Black 8/0\nTail: Elk hair\nBody: Peacock herl/red floss/peacock herl\nWing: White calf tail\nHackle: Brown"
  }
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  try {
    const store = getCatalogStore();

    // GET — public, no auth required
    if (event.httpMethod === 'GET') {
      let catalog = await store.get(STORE_KEY, { type: 'json' });
      if (!catalog) {
        // Seed with default data on first access
        catalog = DEFAULT_CATALOG;
        await store.setJSON(STORE_KEY, catalog);
      }
      return respond(catalog);
    }

    // All write operations require authentication
    const user = await verifyAuth(event);
    if (!user) return respond({ error: 'Unauthorized' }, 401);

    let catalog = (await store.get(STORE_KEY, { type: 'json' })) || [];

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      if (!body.name || !body.type) {
        return respond({ error: 'Name and type are required' }, 400);
      }
      catalog.push({
        name: body.name,
        type: body.type,
        bestFor: body.bestFor || '',
        description: body.description || '',
        image: body.image || '',
        recipe: body.recipe || '',
      });
      await store.setJSON(STORE_KEY, catalog);
      return respond({ message: 'Fly pattern added', catalog });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      if (body.index === undefined && !body.originalName) {
        return respond({ error: 'Index or originalName is required to update' }, 400);
      }
      let index = body.index;
      if (index === undefined) {
        index = catalog.findIndex(f => f.name === body.originalName);
      }
      if (index < 0 || index >= catalog.length) {
        return respond({ error: 'Fly pattern not found' }, 404);
      }
      catalog[index] = {
        name: body.name || catalog[index].name,
        type: body.type || catalog[index].type,
        bestFor: body.bestFor !== undefined ? body.bestFor : catalog[index].bestFor,
        description: body.description !== undefined ? body.description : catalog[index].description,
        image: body.image !== undefined ? body.image : catalog[index].image,
        recipe: body.recipe !== undefined ? body.recipe : catalog[index].recipe,
      };
      await store.setJSON(STORE_KEY, catalog);
      return respond({ message: 'Fly pattern updated', catalog });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      let index = params.index !== undefined ? parseInt(params.index) : -1;
      if (index === -1 && params.name) {
        index = catalog.findIndex(f => f.name === params.name);
      }
      if (index < 0 || index >= catalog.length) {
        return respond({ error: 'Fly pattern not found' }, 404);
      }
      catalog.splice(index, 1);
      await store.setJSON(STORE_KEY, catalog);
      return respond({ message: 'Fly pattern deleted', catalog });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Catalog error:', err);
    return respond({ error: err.message }, 500);
  }
};
