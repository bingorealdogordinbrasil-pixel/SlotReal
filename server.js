const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO BANCO DE DADOS
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ SERVIDOR ON - 30s - APOSTA R$1"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// TIMER DO JOGO (30 SEGUNDOS)
let t = 30;
setInterval(() => { if(t > 0) t--; else t = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

// CADASTRO
app.post('/auth/register', async (req, res) => {
    try {
        const existe = await User.findOne({ user: req.body.user });
        if (existe) return res.json({ success: false, message: "Usuário já existe!" });
        const novo = new User({ user: req.body.user, pass: req.body.pass });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// LOGIN
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo });
    else res.json({ success: false });
});

// SALVAR APOSTAS
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

// LÓGICA DO GIRO (ANTI-BANCA)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if (!u) return res.json({ success: false });

    let menorValor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menorValor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];

    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    const nS = Number((u.saldo + ganho).toFixed(2));

    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, bets: [0,0,0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

app.listen(process.env.PORT || 10000);
