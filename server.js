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

// --- MODELOS ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    email: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({
    user: String, valor: Number, chavePix: String, status: { type: String, default: 'Pendente' }, data: { type: Date, default: Date.now }
}));

// --- ROTAS DO GERENTE (CONECTADO AO SEU HTML) ---
app.post('/admin/users', async (req, res) => {
    try {
        const { senha } = req.body;
        if (senha !== SENHA_ADMIN) return res.json({ success: false, message: "Senha incorreta!" });

        const users = await User.find({});
        const saques = await Saque.find({ status: 'Pendente' });
        
        res.json({ success: true, users, saques });
    } catch (e) { res.json({ success: false, message: "Erro de conexão com o banco" }); }
});

app.post('/admin/add-bonus', async (req, res) => {
    try {
        const { senha, targetUser, valor } = req.body;
        if (senha !== SENHA_ADMIN) return res.json({ success: false });

        const u = await User.findOne({ user: targetUser });
        if (u) {
            u.saldo += Number(valor);
            await u.save();
            res.json({ success: true });
        } else { res.json({ success: false, message: "Usuário não encontrado" }); }
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/finalizar-saque', async (req, res) => {
    try {
        const { senha, id } = req.body;
        if (senha !== SENHA_ADMIN) return res.json({ success: false });

        await Saque.findByIdAndUpdate(id, { status: 'Pago' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- LÓGICA DE JOGO ---
app.post('/auth/register', async (req, res) => {
    try {
        const { user, pass, email } = req.body;
        const exists = await User.findOne({ $or: [{ user }, { email }] });
        if (exists) return res.json({ success: false, message: "Já existe!" });
        const novo = await User.create({ user, pass, email });
        res.json({ success: true, user: novo.user, saldo: 0, ganhos: 0 });
    } catch (e) { res.json({ success: false }); }
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos });
    else res.json({ success: false, message: "Dados incorretos" });
});

app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    const postData = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Dep_${userLogado}`,
        payment_method_id: "pix",
        payer: { email: `${userLogado}@gmail.com`, identification: { type: "CPF", number: "19119119100" } }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'k' + Date.now() }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                res.json({ success: true, imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, copia_e_cola: r.point_of_interaction.transaction_data.qr_code });
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData); mpReq.end();
});

app.post('/solicitar-saque', async (req, res) => {
    const { user, valor, chavePix } = req.body;
    const u = await User.findOne({ user });
    if (u && u.ganhos >= valor) {
        u.ganhos -= valor; u.saldo -= valor;
        await u.save();
        await Saque.create({ user, valor, chavePix });
        res.json({ success: true, novoSaldo: u.saldo, novoGanhos: u.ganhos });
    } else { res.json({ success: false, message: "Saldo insuficiente" }); }
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menor = Math.min(...u.bets), cores = [];
    u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const ganho = u.bets[alvo] * 5;
    u.saldo += ganho; u.ganhos += ganho;
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: u.saldo, ganhos: u.ganhos, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: u.saldo, novoGanhos: u.ganhos });
});

let t = 120; setInterval(() => { if(t > 0) t--; else t = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🔥 Servidor ON na porta " + PORT));
