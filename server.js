const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ SERVIDOR ON - TUDO INTEGRADO"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

let t = 30;
setInterval(() => { if(t > 0) t--; else t = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

app.post('/auth/register', async (req, res) => {
    try {
        const existe = await User.findOne({ user: req.body.user });
        if (existe) return res.json({ success: false });
        const novo = new User({ user: req.body.user, pass: req.body.pass });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    const nS = Number((u.saldo + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, bets: [0,0,0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

app.post('/gerar-pix', (req, res) => {
    const postData = JSON.stringify({
        transaction_amount: Number(req.body.valor),
        description: `Dep_${req.body.user}`,
        payment_method_id: "pix",
        payer: { email: `${req.body.user}@gmail.com`, first_name: req.body.user, identification: { type: "CPF", number: "19119119100" } }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try { const r = JSON.parse(b); res.json({ success: true, imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, copia_e_cola: r.point_of_interaction.transaction_data.qr_code }); }
            catch(e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData); mpReq.end();
});

app.post('/api/saque', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(u && u.saldo >= req.body.valor) {
        const nS = u.saldo - req.body.valor;
        await User.findOneAndUpdate({ user: u.user }, { saldo: nS });
        res.json({ success: true, novoSaldo: nS });
    } else res.json({ success: false });
});

app.listen(10000);
