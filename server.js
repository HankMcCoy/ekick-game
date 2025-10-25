const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 9001;

const ROOT = process.cwd();
const PEOPLE_DIR = path.join(ROOT, 'people');
const PETS_DIR = path.join(ROOT, 'pets');
const FACTS_CSV = path.join(ROOT, 'fun-facts.csv');

function sendJson(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function send500(res, err) {
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Server error: ' + (err && err.message ? err.message : String(err)));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.csv': return 'text/csv; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function titleCaseFromFilename(filename) {
  const base = filename.replace(/^\.+/, '').replace(/\.[^.]+$/, '');
  return base
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
}

function loadPeople() {
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const people = readDirSafe(PEOPLE_DIR)
    .filter(f => allowed.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map(f => ({
      name: titleCaseFromFilename(f),
      image: '/people/' + f,
      filename: f,
    }));
  return people;
}

function firstSegment(str) {
  const idx = str.indexOf('_');
  if (idx === -1) return str;
  return str.slice(0, idx);
}

function remainderSegments(str) {
  const idx = str.indexOf('_');
  if (idx === -1) return '';
  return str.slice(idx + 1);
}

function loadPets() {
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const files = readDirSafe(PETS_DIR)
    .filter(f => allowed.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return files.map((f, idx) => {
    const base = f.replace(/\.[^.]+$/, '');
    const ownerSegment = firstSegment(base);
    const petSegment = remainderSegments(base);
    const owner = titleCaseFromFilename(ownerSegment);
    const petName = petSegment ? titleCaseFromFilename(petSegment) : 'Pet';
    return {
      id: idx + 1,
      owner,
      name: petName,
      image: '/pets/' + f,
      filename: f,
    };
  });
}

function parseCsv(text) {
  // Simple CSV with header: Name,Fun Fact
  // Handles commas inside quotes roughly.
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map(s => s.trim());
  const nameIdx = header.findIndex(h => /^name$/i.test(h));
  const factIdx = header.findIndex(h => /^(fun\s*fact|fact)$/i.test(h));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // Basic CSV split supporting quotes
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j];
      if (ch === '"') {
        if (inQuotes && raw[j + 1] === '"') { // escaped quote
          cur += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    const get = (idx) => (idx >= 0 && idx < out.length ? String(out[idx]).trim() : '');
    const name = get(nameIdx);
    const fact = get(factIdx);
    if (name || fact) rows.push({ name, fact });
  }
  return rows;
}

function loadFacts() {
  try {
    const text = fs.readFileSync(FACTS_CSV, 'utf8');
    const rows = parseCsv(text);
    // Assign IDs; keep fields consistent
    return rows.map((r, i) => ({ id: i + 1, name: r.name, fact: r.fact }));
  } catch (e) {
    return [];
  }
}

function serveStatic(req, res) {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/public/index.html';
  // Prevent path traversal
  const safePath = path.normalize(reqPath).replace(/^\/+/, '/');
  const filePath = path.join(ROOT, safePath);
  // Only allow serving files within ROOT
  if (!filePath.startsWith(ROOT)) {
    return send404(res);
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send404(res);
    }
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/people') {
    try {
      const people = loadPeople();
      return sendJson(res, { people });
    } catch (e) {
      return send500(res, e);
    }
  }
  if (url === '/api/facts') {
    try {
      const facts = loadFacts();
      return sendJson(res, { facts });
    } catch (e) {
      return send500(res, e);
    }
  }
  if (url === '/api/pets') {
    try {
      const pets = loadPets();
      return sendJson(res, { pets });
    } catch (e) {
      return send500(res, e);
    }
  }
  // static files (including /public/*, /people/*, and /pets/*)
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
