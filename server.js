const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// ROTA DO PIX DIRETA (SEM ERRO DE UNDEFINED)
app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, userLogado } = req.body;
        const mp = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                transaction_amount: Number(valor),
                description: `Depósito - ${userLogado}`,
                payment_method_id: "pix",
                payer: { email: `${userLogado}@gmail.com` }
            })
        });
        const d = await mp.json();
        res.json({
            success: true,
            imagem_qr: d.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: d.point_of_interaction.transaction_data.qr_code
        });
    } catch (e) { res.json({ success: false }); }
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, saldo: c.saldo, user: c.user, bets: c.bets });
    else res.json({ success: false });
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
    const novo = Number((u.saldo + (u.bets[alvo] * 5)).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: novo });
});

let tempo = 120;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

app.listen(10000, () => console.log("RODANDO"));
