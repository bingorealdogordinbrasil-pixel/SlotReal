const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SENHA_GERENTE = "admin123"; 
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// --- RELÓGIO DO SERVIDOR (NÃO RESETA NO F5) ---
let tempoServidor = 120; 
setInterval(() => {
    if (tempoServidor > 0) tempoServidor--;
    else tempoServidor = 120;
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempoServidor }));

// --- LOGIN E CADASTRO ---
app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ ...req.body, saldo: 0.00 });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false }); }
});

app.post('/auth/login', async (req, res) => {
    const conta = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (conta) res.json({ success: true, saldo: conta.saldo, user: conta.user });
    else res.json({ success: false });
});

// --- MOTOR DE GIRO (LUCRO GARANTIDO) ---
app.post('/api/spin', async (req, res) => {
    try {
        const { user, bets } = req.body; 
        const userDb = await User.findOne({ user });
        if (!userDb) return res.json({ success: false });

        let menorValor = Math.min(...bets);
        let coresPossiveis = [];
        bets.forEach((v, i) => { if(v === menorValor) coresPossiveis.push(i); });
        const corAlvo = coresPossiveis[Math.floor(Math.random() * coresPossiveis.length)];
        
        const premio = bets[corAlvo] * 5.0;
        const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
        await User.findOneAndUpdate({ user }, { saldo: novoSaldo });
        res.json({ success: true, corAlvo, novoSaldo, ganhou: premio > 0 });
    } catch (e) { res.json({ success: false }); }
});

// --- GERENTE ---
app.post('/admin/users', async (req, res) => {
    if (String(req.body.senha) !== SENHA_GERENTE) return res.status(401).json({ success: false });
    const users = await User.find({}, 'user saldo fone');
    res.json({ success: true, users });
});

app.post('/admin/add-bonus', async (req, res) => {
    if (String(req.body.senha) !== SENHA_GERENTE) return res.status(401).json({ success: false });
    const user = await User.findOneAndUpdate({ user: req.body.targetUser }, { $inc: { saldo: parseFloat(req.body.valor) } }, { new: true });
    res.json({ success: true, novoSaldo: user ? user.saldo : 0 });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo });
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR OK`));
