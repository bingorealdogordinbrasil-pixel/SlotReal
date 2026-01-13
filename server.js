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
const SENHA_ADMIN = "123456"; 

mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

// MODELO DE USUÁRIO
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 }, // SÓ PODE SACAR ISSO
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String, valor: Number, chavePix: String, status: { type: String, default: 'Pendente' }, data: { type: Date, default: Date.now }
}));

// --- AUTENTICAÇÃO ---
app.post('/auth/register', async (req, res) => {
    try {
        const { user, pass } = req.body;
        if (!user || !pass) return res.json({ success: false, message: "Preencha tudo" });
        const exists = await User.findOne({ user });
        if (exists) return res.json({ success: false, message: "Usuário já existe" });
        const novo = await User.create({ user, pass });
        res.json({ success: true, user: novo.user });
    } catch (e) { res.json({ success: false, message: "Erro no cadastro" }); }
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, saldo: c.saldo, ganhos: c.ganhos, user: c.user, bets: c.bets });
    else res.json({ success: false, message: "Login inválido" });
});

// --- JOGO ---
app.post('/api/spin', async (req, res) => {
    try {
        const u = await User.findOne({ user: req.body.user });
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

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

// --- DINHEIRO ---
app.post('/solicitar-saque', async (req, res) => {
    const { user, valor, chavePix } = req.body;
    const u = await User.findOne({ user });
    if (u && u.ganhos >= valor && u.saldo >= valor) {
        const nS = Number((u.saldo - valor).toFixed(2));
        const nG = Number((u.ganhos - valor).toFixed(2));
        await User.findOneAndUpdate({ user }, { saldo: nS, ganhos: nG });
        await Saque.create({ user, valor, chavePix });
        res.json({ success: true, novoSaldo: nS, novoGanhos: nG });
    } else {
        res.json({ success: false, message: "Saldo de ganhos insuficiente!" });
    }
});

app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    const data = JSON.stringify({
        transaction_amount: Number(valor), description: `Dep: ${userLogado}`, payment_method_id: "pix",
        payer: { email: `${userLogado}@gmail.com` }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'k'+Date.now() }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                if (r.point_of_interaction) res.json({ success: true, imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, copia_e_cola: r.point_of_interaction.transaction_data.qr_code });
                else res.json({ success: false });
            } catch(e) { res.json({ success: false }); }
        });
    });
    mpReq.write(data); mpReq.end();
});

// --- ADMIN E TEMPO ---
app.post('/admin/users', async (req, res) => {
    if (req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({}, 'user saldo ganhos').sort({ saldo: -1 });
    const saques = await Saque.find({ status: 'Pendente' });
    res.json({ success: true, users, saques });
});

let t = 120; setInterval(() => { if(t > 0) t--; else t = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Servidor Online na porta " + PORT));
