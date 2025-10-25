// Simple fun-facts matcher

const FACT_PREFIX = 'fact';
const PET_PREFIX = 'pet';

const state = {
  people: [], // {name, image?}
  facts: [], // {id, name, fact}
  pets: [], // {id, owner, name, image}
  attempts: new Map(), // itemKey -> submit attempts this round included
  assignedTo: new Map(), // itemKey -> personName (current placement)
  locked: new Set(), // itemKeys that are correct and locked
  incorrect: new Set(), // itemKeys currently marked incorrect
  score: 0,
};

const $facts = document.getElementById('facts');
const $pets = document.getElementById('pets');
const $people = document.getElementById('people');
const $submit = document.getElementById('submit');
const $reset = document.getElementById('reset');
const $score = document.getElementById('score');
const $status = document.getElementById('status');

function setStatus(text) {
  $status.textContent = text || '';
}

function makeKey(prefix, id) {
  return `${prefix}-${id}`;
}

function factKey(fact) {
  return makeKey(FACT_PREFIX, fact.id);
}

function petKey(pet) {
  return makeKey(PET_PREFIX, pet.id);
}

function setDragPreview(e, el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const clone = el.cloneNode(true);
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.position = 'absolute';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  clone.style.pointerEvents = 'none';
  clone.style.opacity = '0.9';
  document.body.appendChild(clone);
  const offsetX = rect.width / 2;
  const offsetY = rect.height / 2;
  try {
    e.dataTransfer.setDragImage(clone, offsetX, offsetY);
  } catch {
    // ignore failures; default preview will be used
  }
  requestAnimationFrame(() => {
    document.body.removeChild(clone);
  });
}

function pointsForAttempt(attemptNumber) {
  // 1 -> 64, 2 -> 32, 3 -> 16 ... min 1
  const raw = 64 >> (attemptNumber - 1);
  return Math.max(1, raw);
}

async function loadData() {
  const [peopleRes, factsRes, petsRes] = await Promise.all([
    fetch('/api/people'),
    fetch('/api/facts'),
    fetch('/api/pets'),
  ]);
  const [peopleJson, factsJson, petsJson] = await Promise.all([
    peopleRes.json(), factsRes.json(), petsRes.json(),
  ]);

  const peopleByName = new Map();
  for (const p of peopleJson.people || []) {
    peopleByName.set(p.name, p);
  }

  // union of people from the people directory, CSV names, and pet owners
  const allNames = new Set([
    ...peopleByName.keys(),
    ...((factsJson.facts || []).map(f => f.name)),
    ...((petsJson.pets || []).map(p => p.owner)),
  ]);

  state.people = Array.from(allNames).map(name => ({
    name,
    image: peopleByName.get(name)?.image || null,
  })).sort((a, b) => a.name.localeCompare(b.name));

  state.facts = (factsJson.facts || []).map(f => ({ id: f.id, name: f.name, fact: f.fact }));
  state.pets = (petsJson.pets || []).map(p => ({
    id: p.id,
    owner: p.owner,
    name: p.name,
    image: p.image,
  }));
}

function render() {
  $facts.innerHTML = '';
  if ($pets) $pets.innerHTML = '';
  $people.innerHTML = '';
  $score.textContent = String(state.score);

  for (const fact of state.facts) {
    const key = factKey(fact);
    const card = buildFactCard(fact, 'pool');
    const assigned = state.assignedTo.get(key);
    if (!assigned || state.locked.has(key)) {
      $facts.appendChild(card);
    }
  }

  if ($pets) {
    for (const pet of state.pets) {
      const key = petKey(pet);
      const card = buildPetCard(pet, 'pool');
      const assigned = state.assignedTo.get(key);
      if (!assigned || state.locked.has(key)) {
        $pets.appendChild(card);
      }
    }
  }

  for (const person of state.people) {
    const $p = document.createElement('div');
    $p.className = 'person';
    $p.dataset.personName = person.name;

    if (person.image) {
      const img = document.createElement('img');
      img.className = 'face';
      img.src = person.image;
      img.alt = person.name;
      $p.appendChild(img);
    }

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = person.name;
    $p.appendChild(name);

    const drop = document.createElement('div');
    drop.className = 'dropzone';
    drop.dataset.personName = person.name;
    drop.setAttribute('aria-label', `Drop cards on ${person.name}`);

    const assignedItems = [];
    for (const fact of state.facts) {
      const key = factKey(fact);
      if (state.assignedTo.get(key) === person.name) {
        assignedItems.push({ type: FACT_PREFIX, item: fact });
      }
    }
    for (const pet of state.pets) {
      const key = petKey(pet);
      if (state.assignedTo.get(key) === person.name) {
        assignedItems.push({ type: PET_PREFIX, item: pet });
      }
    }

    if (assignedItems.length === 0) {
      const note = document.createElement('div');
      note.className = 'slot-note';
      note.textContent = 'Drop card here';
      drop.appendChild(note);
    } else {
      for (const entry of assignedItems) {
        if (entry.type === FACT_PREFIX) {
          drop.appendChild(buildFactCard(entry.item, 'person'));
        } else if (entry.type === PET_PREFIX) {
          drop.appendChild(buildPetCard(entry.item, 'person'));
        }
      }
    }

    attachDropHandlers($p, drop);
    $p.appendChild(drop);
    $people.appendChild($p);
  }
}

function buildFactCard(fact, context) {
  const key = factKey(fact);
  const isLocked = state.locked.has(key);
  const classes = ['fact-card'];
  if (isLocked) classes.push('locked');
  if (!isLocked && state.incorrect.has(key)) classes.push('incorrect');
  const card = document.createElement('div');
  card.className = classes.join(' ');
  card.dataset.itemId = key;
  card.dataset.itemType = FACT_PREFIX;
  card.textContent = fact.fact || '(No fact)';
  card.setAttribute('draggable', isLocked ? 'false' : 'true');
  if (isLocked) {
    const chip = document.createElement('span');
    chip.className = 'chip ok';
    chip.textContent = context === 'person' ? 'Correct' : 'Locked';
    chip.style.marginLeft = '8px';
    card.appendChild(chip);
  }
  attachDragHandlers(card);
  return card;
}

function buildPetCard(pet, context) {
  const key = petKey(pet);
  const isLocked = state.locked.has(key);
  const classes = ['pet-card'];
  if (isLocked) classes.push('locked');
  if (!isLocked && state.incorrect.has(key)) classes.push('incorrect');
  const card = document.createElement('div');
  card.className = classes.join(' ');
  card.dataset.itemId = key;
  card.dataset.itemType = PET_PREFIX;
  card.setAttribute('draggable', isLocked ? 'false' : 'true');

  const img = document.createElement('img');
  img.src = pet.image;
  img.alt = `${pet.name} — ${pet.owner}'s pet`;
  img.loading = 'lazy';
  card.appendChild(img);

  if (isLocked) {
    const chip = document.createElement('span');
    chip.className = 'chip ok';
    chip.textContent = context === 'person' ? 'Correct' : 'Locked';
    chip.style.marginLeft = '6px';
    card.appendChild(chip);
  }

  attachDragHandlers(card);
  return card;
}

function attachDragHandlers(el) {
  el.addEventListener('dragstart', (e) => {
    const key = el.dataset.itemId;
    if (!key || state.locked.has(key)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/item-id', key);
    e.dataTransfer.effectAllowed = 'move';
    setDragPreview(e, el);
  });
}

function attachDropHandlers(container, dropZone) {
  const getPersonName = () =>
    container.dataset.personName || dropZone?.dataset.personName || '';

  const addHighlight = () => {
    container.classList.add('over');
    if (dropZone) dropZone.classList.add('over');
  };

  const removeHighlight = () => {
    container.classList.remove('over');
    if (dropZone) dropZone.classList.remove('over');
  };

  let dragDepth = 0;

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth += 1;
    addHighlight();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) removeHighlight();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addHighlight();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeHighlight();
    dragDepth = 0;
    const key = e.dataTransfer.getData('text/item-id');
    if (!key || state.locked.has(key)) return;
    const personName = getPersonName();
    if (!personName) return;
    // Move assignment to this person
    state.incorrect.delete(key);
    state.assignedTo.set(key, personName);
    setStatus('');
    render();
  };

  container.addEventListener('dragenter', handleDragEnter);
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('dragleave', handleDragLeave);
  container.addEventListener('drop', handleDrop);

  if (dropZone) {
    dropZone.addEventListener('dragenter', handleDragEnter);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
  }
}

function submitRound() {
  const results = [];
  let corrected = 0;

  const allItems = [
    ...state.facts.map(f => ({
      key: factKey(f),
      answer: f.name,
      type: FACT_PREFIX,
    })),
    ...state.pets.map(p => ({
      key: petKey(p),
      answer: p.owner,
      type: PET_PREFIX,
    })),
  ];

  for (const item of allItems) {
    if (state.locked.has(item.key)) continue;
    const assignedPerson = state.assignedTo.get(item.key);
    if (!assignedPerson) continue; // not included this round

    const prev = state.attempts.get(item.key) || 0;
    const attemptNum = prev + 1;
    state.attempts.set(item.key, attemptNum);

    const isCorrect = assignedPerson === item.answer;
    if (isCorrect) {
      const pts = pointsForAttempt(attemptNum);
      state.score += pts;
      state.locked.add(item.key);
      state.incorrect.delete(item.key);
      corrected++;
      results.push({ key: item.key, ok: true, pts, type: item.type });
    } else {
      state.incorrect.add(item.key);
      results.push({ key: item.key, ok: false, type: item.type });
    }
  }

  render();

  const totalItems = state.facts.length + state.pets.length;
  const totalLocked = Array.from(state.locked).filter(key => {
    return typeof key === 'string' && (
      key.startsWith(`${FACT_PREFIX}-`) || key.startsWith(`${PET_PREFIX}-`)
    );
  }).length;

  if (results.length === 0) {
    setStatus('Nothing to check. Drag cards onto people.');
    return;
  }
  if (corrected > 0) {
    setStatus(`Nice! ${corrected} correct this round. ${totalLocked}/${totalItems} locked.`);
  } else {
    setStatus('No correct matches that round. Try again!');
  }
  if (totalLocked === totalItems && totalItems > 0) {
    setStatus(`All matched! Final score: ${state.score}`);
  }
}

function resetGame() {
  state.attempts.clear();
  state.assignedTo.clear();
  state.locked.clear();
  state.incorrect.clear();
  state.score = 0;
  setStatus('');
  render();
}

async function main() {
  try {
    await loadData();
    render();
    setStatus('Drag fun facts and pets onto people, then press Submit.');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load data. Check server.');
  }
}

$submit.addEventListener('click', submitRound);
$reset.addEventListener('click', resetGame);

main();

function setupPoolDrop(container, prefix) {
  if (!container) return;
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/item-id');
    if (!key || !key.startsWith(`${prefix}-`)) return;
    if (state.locked.has(key)) return;
    state.incorrect.delete(key);
    state.assignedTo.delete(key);
    setStatus('');
    render();
  });
}

setupPoolDrop($facts, FACT_PREFIX);
setupPoolDrop($pets, PET_PREFIX);
