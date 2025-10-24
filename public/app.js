// Simple fun-facts matcher

const state = {
  people: [], // {name, image?}
  facts: [], // {id, name, fact}
  // per fact id
  attempts: new Map(), // id -> number of submit attempts where this fact was included
  assignedTo: new Map(), // factId -> personName (current placement)
  locked: new Set(), // factIds that are correct and locked
  score: 0,
};

const $facts = document.getElementById('facts');
const $people = document.getElementById('people');
const $submit = document.getElementById('submit');
const $reset = document.getElementById('reset');
const $score = document.getElementById('score');
const $status = document.getElementById('status');

function setStatus(text) {
  $status.textContent = text || '';
}

function pointsForAttempt(attemptNumber) {
  // 1 -> 64, 2 -> 32, 3 -> 16 ... min 1
  const raw = 64 >> (attemptNumber - 1);
  return Math.max(1, raw);
}

async function loadData() {
  const [peopleRes, factsRes] = await Promise.all([
    fetch('/api/people'),
    fetch('/api/facts'),
  ]);
  const [peopleJson, factsJson] = await Promise.all([
    peopleRes.json(), factsRes.json(),
  ]);

  const peopleByName = new Map();
  for (const p of peopleJson.people || []) {
    peopleByName.set(p.name, p);
  }

  // union of people from the people directory and from CSV names
  const allNames = new Set([
    ...peopleByName.keys(),
    ...((factsJson.facts || []).map(f => f.name))
  ]);

  state.people = Array.from(allNames).map(name => ({
    name,
    image: peopleByName.get(name)?.image || null,
  })).sort((a, b) => a.name.localeCompare(b.name));

  state.facts = (factsJson.facts || []).map(f => ({ id: f.id, name: f.name, fact: f.fact }));
}

function render() {
  $facts.innerHTML = '';
  $people.innerHTML = '';
  $score.textContent = String(state.score);

  // Facts panel
  for (const f of state.facts) {
    const isLocked = state.locked.has(f.id);
    const card = document.createElement('div');
    card.className = 'fact-card' + (isLocked ? ' locked' : '');
    card.setAttribute('draggable', isLocked ? 'false' : 'true');
    card.dataset.factId = f.id;
    card.textContent = f.fact || '(No fact)';
    if (isLocked) {
      const chip = document.createElement('span');
      chip.className = 'chip ok';
      chip.textContent = 'Locked';
      chip.style.marginLeft = '8px';
      card.appendChild(chip);
    }
    // Only show in pool if not currently assigned to a person
    const assigned = state.assignedTo.get(f.id);
    if (!assigned || state.locked.has(f.id)) {
      $facts.appendChild(card);
    }
    attachDragHandlers(card);
  }

  // People grid
  for (const p of state.people) {
    const $p = document.createElement('div');
    $p.className = 'person';
    $p.dataset.personName = p.name;

    if (p.image) {
      const img = document.createElement('img');
      img.className = 'face';
      img.src = p.image;
      img.alt = p.name;
      $p.appendChild(img);
    }

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name;
    $p.appendChild(name);

    const drop = document.createElement('div');
    drop.className = 'dropzone';
    drop.dataset.personName = p.name;
    drop.setAttribute('aria-label', `Drop facts on ${p.name}`);

    // Render assigned facts to this person
    const assignedFacts = state.facts.filter(f => state.assignedTo.get(f.id) === p.name);
    if (assignedFacts.length === 0) {
      const note = document.createElement('div');
      note.className = 'slot-note';
      note.textContent = 'Drop fact here';
      drop.appendChild(note);
    } else {
      for (const f of assignedFacts) {
        const isLocked = state.locked.has(f.id);
        const card = document.createElement('div');
        card.className = 'fact-card' + (isLocked ? ' locked' : '');
        card.setAttribute('draggable', isLocked ? 'false' : 'true');
        card.dataset.factId = f.id;
        card.textContent = f.fact || '(No fact)';
        if (isLocked) {
          const chip = document.createElement('span');
          chip.className = 'chip ok';
          chip.textContent = 'Correct';
          chip.style.marginLeft = '8px';
          card.appendChild(chip);
        }
        drop.appendChild(card);
        attachDragHandlers(card);
      }
    }

    attachDropHandlers($p, drop);
    $p.appendChild(drop);
    $people.appendChild($p);
  }
}

function attachDragHandlers(el) {
  el.addEventListener('dragstart', (e) => {
    const id = el.dataset.factId;
    if (!id || state.locked.has(Number(id))) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/fact-id', id);
    e.dataTransfer.effectAllowed = 'move';
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
    const id = Number(e.dataTransfer.getData('text/fact-id'));
    if (!id || state.locked.has(id)) return;
    const personName = getPersonName();
    if (!personName) return;
    // Move assignment to this person
    state.assignedTo.set(id, personName);
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

  for (const f of state.facts) {
    if (state.locked.has(f.id)) continue;
    const assignedPerson = state.assignedTo.get(f.id);
    if (!assignedPerson) continue; // not included this round

    const prev = state.attempts.get(f.id) || 0;
    const attemptNum = prev + 1;
    state.attempts.set(f.id, attemptNum);

    const isCorrect = assignedPerson === f.name;
    if (isCorrect) {
      const pts = pointsForAttempt(attemptNum);
      state.score += pts;
      state.locked.add(f.id);
      corrected++;
      results.push({ id: f.id, ok: true, pts });
    } else {
      results.push({ id: f.id, ok: false });
    }
  }

  render();

  const totalLocked = state.locked.size;
  const totalFacts = state.facts.length;
  if (results.length === 0) {
    setStatus('Nothing to check. Drag facts onto people.');
    return;
  }
  if (corrected > 0) {
    setStatus(`Nice! ${corrected} correct this round. ${totalLocked}/${totalFacts} locked.`);
  } else {
    setStatus('No correct matches that round. Try again!');
  }
  if (totalLocked === totalFacts && totalFacts > 0) {
    setStatus(`All matched! Final score: ${state.score}`);
  }
}

function resetGame() {
  state.attempts.clear();
  state.assignedTo.clear();
  state.locked.clear();
  state.score = 0;
  setStatus('');
  render();
}

async function main() {
  try {
    await loadData();
    render();
    setStatus('Drag facts onto people, then press Submit.');
  } catch (e) {
    console.error(e);
    setStatus('Failed to load data. Check server.');
  }
}

$submit.addEventListener('click', submitRound);
$reset.addEventListener('click', resetGame);

main();

// Allow dropping onto the facts pool to unassign
$facts.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});
$facts.addEventListener('drop', (e) => {
  e.preventDefault();
  const id = Number(e.dataTransfer.getData('text/fact-id'));
  if (!id || state.locked.has(id)) return;
  state.assignedTo.delete(id);
  setStatus('');
  render();
});
