// Mogess Furniture server: public catalog + password-protected admin API
const express = require('express'), multer = require('multer'), fs = require('fs'),
      path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || 'mogess123';   // CHANGE THIS
const SECRET = crypto.createHash('sha256').update('mogess|' + PASSWORD).digest('hex');
const DATA = path.join(__dirname, 'data', 'products.json');
const UP = path.join(__dirname, 'uploads');
fs.mkdirSync(UP, { recursive: true });

const load = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const save = d => fs.writeFileSync(DATA, JSON.stringify(d, null, 2));
// First run on a fresh server: create the data folder and sample products
fs.mkdirSync(path.dirname(DATA), { recursive: true });
if (!fs.existsSync(DATA)) {
  const S = [
    ['sofa','1','ባለ 1 ወንበር ሶፋ','1-seater sofa','ግራጫ ጨርቅ','Grey fabric',16500],
    ['sofa','2','ባለ 2 ወንበር ሶፋ','2-seater sofa','ቡናማ ቆዳ፣ 160 ሴ.ሜ','Brown leather, 160 cm',36000],
    ['sofa','3','ባለ 3 ወንበር ሶፋ','3-seater sofa','ግራጫ ጨርቅ፣ 210 ሴ.ሜ','Grey fabric, 210 cm',48500],
    ['sofa','L','ኤል ቅርጽ ሶፋ','L-shaped sofa','ሰማያዊ ጨርቅ፣ ለ6 ሰው','Teal fabric, seats 6',89000],
    ['bed','','ባለ ድርብ አልጋ','Double bed','የእንጨት ፍሬም፣ 160×200','Wood frame, 160×200',32000],
    ['bed','','ባለ አንድ አልጋ','Single bed','የእንጨት ፍሬም፣ 90×200','Wood frame, 90×200',17500],
    ['table','','የመመገቢያ ጠረጴዛ ለ6','Dining table, 6 seats','የሜፕል እንጨት','Maple wood',27500],
    ['table','','የመመገቢያ ጠረጴዛ ለ4','Dining table, 4 seats','የእንጨት፣ ክብ','Wood, round',19800]
  ];
  save(S.map((r, i) => ({ id: 1000 + i, cat: r[0], sub: r[1], name_am: r[2], name_en: r[3],
    desc_am: r[4], desc_en: r[5], price: r[6], inStock: true, images: [] })));
}

const token = () => crypto.createHmac('sha256', SECRET).update('admin').digest('hex');
const isAdmin = req => (req.headers.cookie || '').split(';').some(c => c.trim() === 'auth=' + token());
const guard = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'login' });

const upload = multer({
  storage: multer.diskStorage({
    destination: UP,
    filename: (r, f, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype))
});

const app = express();
app.use(express.json());
app.use('/uploads', express.static(UP));
app.use(express.static(path.join(__dirname, 'public')));

const removeFile = url => { try { fs.unlinkSync(path.join(UP, path.basename(url))); } catch (e) {} };
const fields = b => ({
  cat: ['sofa', 'bed', 'table'].includes(b.cat) ? b.cat : 'sofa',
  sub: b.cat === 'sofa' ? (b.sub || '3') : '',
  name_am: (b.name_am || '').trim(), name_en: (b.name_en || '').trim(),
  desc_am: (b.desc_am || '').trim(), desc_en: (b.desc_en || '').trim(),
  price: Number(b.price) || 0, inStock: b.inStock !== 'false'
});

app.get('/api/products', (req, res) => res.json(load()));
app.post('/api/login', (req, res) => {
  if (req.body.password !== PASSWORD) return res.status(401).json({ error: 'wrong' });
  res.setHeader('Set-Cookie', 'auth=' + token() + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000');
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', 'auth=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

app.post('/api/products', guard, upload.array('photos', 8), (req, res) => {
  const all = load();
  const item = { id: Date.now(), ...fields(req.body), images: (req.files || []).map(f => '/uploads/' + f.filename) };
  if (!item.name_am) return res.status(400).json({ error: 'name' });
  all.unshift(item); save(all); res.json(item);
});
app.put('/api/products/:id', guard, upload.array('photos', 8), (req, res) => {
  const all = load(), i = all.findIndex(p => String(p.id) === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'none' });
  let keep = []; try { keep = JSON.parse(req.body.keep || '[]'); } catch (e) {}
  const kept = all[i].images.filter(u => keep.includes(u));
  all[i].images.filter(u => !kept.includes(u)).forEach(removeFile);
  all[i] = { ...all[i], ...fields(req.body), images: kept.concat((req.files || []).map(f => '/uploads/' + f.filename)) };
  save(all); res.json(all[i]);
});
app.delete('/api/products/:id', guard, (req, res) => {
  const all = load(), p = all.find(x => String(x.id) === req.params.id);
  if (p) p.images.forEach(removeFile);
  save(all.filter(x => String(x.id) !== req.params.id)); res.json({ ok: true });
});

app.listen(PORT, () => console.log('Mogess Furniture running: http://localhost:' + PORT));
