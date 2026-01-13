const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

// Conexão com tratamento de erro para o Deploy não travar
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MONGODB CONECTADO"))
    .catch(err => console.error("❌ ERRO AO CONECTAR MONGODB:", err));

// --- MODELOS (COM TRAVA DE DUPLICIDADE) ---
const UserSchema = new mongoose.Schema({
    user: { type: String, unique: true },
    email: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const SaqueSchema = new mongoose.Schema({
    user: String,
    valor: Number,
    chavePix: String,
    status: { type: String, default: 'Pendente' },
    data: { type: Date, default: Date.now }
});
const Saque = mongoose.models.Saque || mongoose.model('Saque', SaqueSchema);

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/auth/register', async (req, res) => {
    try {
        const { user, pass, email } = req.body;
        if(!user || !pass || !email) return res.json({ success: false, message: "Dados incompletos" });
        const exists = await User.findOne({ $or: [{ user }, { email }] });
        if (exists) return res.json({ success: false, message: "Usuário ou Email já cadastrado!" });
        const novo = await User.create({ user, pass, email });
        res.json({ success: true, user: novo.user, saldo: 0, ganhos: 0 });
    } catch (e) { res.json({ success: false, message: "Erro no cadastro" }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
        if (c) res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos });
        else res.json({ success: false, message: "Usuário ou senha incorretos" });
    } catch (e) { res.json({ success: false }); }
});

// --- ROTA PIX (MERCADO PAGO) ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    const cleanUser = String(userLogado || "user").replace(/[^a-zA-Z0-9]/g, '');

    const postData = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Deposito_${cleanUser}`,
        payment_method_id: "pix",
        payer: {
            email: `${cleanUser}@gmail.com`,
            identification: { type: "CPF", number: "19119119100" }
        }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MP_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': 'pix_' + Date.now()
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let b = '';
        mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                if (r.point_of_interaction) {
                    res.json({
                        success: true,
                        imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64,
                        copia_e_cola: r.point_of_interaction.transaction_data.qr_code
                    });
                } else { res.json({ success: false, message: "Erro MP" }); }
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.on('error', (e) => res.json({ success: false, message: "Erro conexao MP" }));
    mpReq.write(postData);
    mpReq.end();
});

// --- ROTAS DO GERENTE (ADMIN) ---
app.get('/admin/usuarios', async (req, res) => {
    try {
        const lista = await User.find({});
        res.json(lista);
    } catch (e) { res.json([]); }
});

app.get('/admin/saques', async (req, res) => {
    try {
        const lista = await Saque.find({ status: 'Pendente' });
        res.json(lista);
    } catch (e) { res.json([]); }
});

app.post('/admin/atualizar-saque', async (req, res) => {
    try {
        const { id, status } = req.body;
        await Saque.findByIdAndUpdate(id, { status });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- JOGO ---
app.post('/api/save-saldo', async (req, res) => {
    try {
        await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/spin', async (req, res) => {
    try {
        const u = await User.findOne({ user: req.body.user });
        if(!u) return res.json({ success: false });
        let menor = Math.min(...u.bets), cores = [];
        u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
        const alvo = cores[Math.floor(Math.random() * cores.length)];
        const ganho = u.bets[alvo] * 5;
        const nS = Number((u.saldo + ganho).toFixed(2));
        const nG = Number((u.ganhos + ganho).toFixed(2));
        await User.findOneAndUpdate({ user: req.body.user }, { saldo: nS, ganhos: nG, bets: [0,0,0,0,0,0,0,0,0,0] });
        res.json({ success: true, corAlvo: alvo, novoSaldo: nS, novoGanhos: nG });
    } catch (e) { res.json({ success: false }); }
});

// TIMER
let t = 120;
setInterval(() => { if(t > 0) t--; else t = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 SERVIDOR ATIVO NA PORTA " + PORT));
